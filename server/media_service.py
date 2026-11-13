import asyncio
import logging
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict, Literal, Optional, Tuple

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadCancelled, DownloadError

from config import MEDIA_MAX_DURATION_SECONDS
from job_types import ErrorCode, JobRecord, JobStatus, JobType
from jobs import job_manager
from storage import PreparedJob, storage_manager
from validator import is_valid_youtube_url, sanitize_filename

logger = logging.getLogger("banana.media")

YDL_BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "socket_timeout": 30,
    "retries": 3,
    "fragment_retries": 3,
    "extractor_args": {
        "youtube": {
            "player_client": ["android", "web"],
        }
    },
    "js_runtimes": {"node": {}},
}


def mp4_format_selector(quality: str) -> str:
    q = quality.strip().lower()
    mapping = {
        "best": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/18/best",
        "2160p": "bv*[height<=2160][ext=mp4]+ba[ext=m4a]/b[height<=2160]/18/best",
        "1440p": "bv*[height<=1440][ext=mp4]+ba[ext=m4a]/b[height<=1440]/18/best",
        "1080p": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/18/best",
        "720p": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/18/best",
        "480p": "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480]/18/best",
        "360p": "18/b[height<=360]/best",
    }
    return mapping.get(q, "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/18/best")


def pick_final_file(workdir: Path, expected_ext: Literal["mp3", "mp4"]) -> Path:
    for attempt in range(3):
        candidates = [
            p for p in workdir.rglob("*")
            if p.is_file() and p.suffix.lower() == f".{expected_ext}"
        ]

        if not candidates:
            candidates = [
                p for p in workdir.rglob("*")
                if p.is_file()
                and not p.name.endswith(".part")
                and not p.name.endswith(".ytdl")
                and not p.name.endswith(".json")
            ]

        if candidates:
            # Pick newest, largest valid file
            return max(candidates, key=lambda p: (p.stat().st_mtime, p.stat().st_size))

        if attempt < 2:
            time.sleep(0.2)

    raise HTTPException(
        status_code=500,
        detail="Processing completed, but the expected output media file was not found."
    )


def categorize_error(exc: Exception) -> Tuple[ErrorCode, str, str]:
    """Map any exception to normalized ErrorCode, user-facing error message, and technical detail."""
    raw_msg = str(exc)
    clean_msg = raw_msg.split("ERROR:")[-1].strip() if "ERROR:" in raw_msg else raw_msg
    lower = raw_msg.lower()

    if isinstance(exc, DownloadCancelled):
        return ErrorCode.CLIENT_CANCELLED, "Download cancelled by user.", "User triggered cancellation"
    if "429" in lower or "rate-limit" in lower or "too many requests" in lower:
        return ErrorCode.SOURCE_RATE_LIMITED, "Media source is temporarily rate-limiting requests. Please wait a moment and try again.", clean_msg
    if "sign in to confirm" in lower or "bot" in lower or "private video" in lower or "copyright" in lower:
        return ErrorCode.SOURCE_ACCESS_DENIED, "This media requires authentication, is age-restricted, or is private.", clean_msg
    if "video unavailable" in lower or "not available" in lower:
        return ErrorCode.MEDIA_UNAVAILABLE, "The requested media is unavailable or has been removed from the platform.", clean_msg
    if "requested format not available" in lower or "no such format" in lower:
        return ErrorCode.NO_AVAILABLE_FORMAT, "The requested media quality/format could not be resolved.", clean_msg
    if "timed out" in lower or "readtimeout" in lower or "connecttimeout" in lower:
        return ErrorCode.NETWORK_TIMEOUT, "Network timeout connecting to media server. Please check connection and try again.", clean_msg
    if "ffmpeg" in lower and ("not found" in lower or "is not recognized" in lower):
        return ErrorCode.FFMPEG_NOT_FOUND, "FFmpeg was not found in system PATH. Audio conversion and merging require FFmpeg.", clean_msg
    if "postprocessing" in lower or "ffmpeg" in lower:
        return ErrorCode.POSTPROCESSING_FAILED, "Media post-processing failed. Please try a different quality or format.", clean_msg
    if "no space left on device" in lower or "disk full" in lower or "winerror 112" in lower:
        return ErrorCode.DISK_FULL, "Not enough disk space to complete media download and processing.", clean_msg

    return ErrorCode.INTERNAL_ERROR, f"Download failed: {clean_msg[:120]}", clean_msg


def _sync_extract_info(url: str) -> Dict[str, Any]:
    """Synchronous metadata extraction in worker thread."""
    ydl_opts = {
        **YDL_BASE_OPTS,
        "skip_download": True,
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)
    except DownloadError as exc:
        clean_msg = str(exc).split("ERROR:")[-1].strip()
        raise HTTPException(status_code=400, detail=f"Media error: {clean_msg}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid or unsupported media URL.") from exc


async def extract_info_async(url: str) -> Dict[str, Any]:
    """Non-blocking async wrapper for metadata extraction."""
    if not is_valid_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch, shorts, or youtu.be link."
        )

    data = await asyncio.to_thread(_sync_extract_info, url)

    duration = data.get("duration")
    if duration and isinstance(duration, (int, float)) and duration > MEDIA_MAX_DURATION_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Video duration exceeds maximum allowed limit ({MEDIA_MAX_DURATION_SECONDS // 3600} hours)."
        )

    vid = data.get("id") or ""
    thumbnail = data.get("thumbnail") or ""
    if not thumbnail and vid:
        thumbnail = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

    formats = []
    for f in (data.get("formats") or [])[:25]:
        formats.append({
            "format_id": f.get("format_id"),
            "ext": f.get("ext"),
            "resolution": f.get("resolution"),
            "height": f.get("height"),
            "fps": f.get("fps"),
            "abr": f.get("abr"),
            "vcodec": f.get("vcodec"),
            "acodec": f.get("acodec"),
            "filesize": f.get("filesize") or f.get("filesize_approx"),
        })

    return {
        "title": data.get("title") or "Unknown Title",
        "uploader": data.get("uploader") or "Unknown",
        "duration": data.get("duration"),
        "thumbnail": thumbnail,
        "webpage_url": data.get("webpage_url") or url,
        "formats": formats,
    }


class BananaProgressTracker:
    """Thread-safe progress and postprocessing tracker for yt-dlp hooks."""
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.last_update_time = 0.0
        self.throttle_interval = 0.12  # Throttle progress events to ~120ms

    def progress_hook(self, d: dict) -> None:
        # Check cooperative cancellation
        job = job_manager.get_job_sync(self.job_id)
        if job and job.cancellation_requested:
            raise DownloadCancelled("Download cancelled by user request.")

        status = d.get("status")
        now = time.time()

        if status == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes")
            total_estimate = d.get("total_bytes_estimate")
            speed = d.get("speed")
            eta = d.get("eta")

            percent: Optional[float] = None
            is_estimated = False

            if total and total > 0:
                percent = round(min(100.0, (downloaded / total) * 100.0), 1)
            elif total_estimate and total_estimate > 0:
                percent = round(min(100.0, (downloaded / total_estimate) * 100.0), 1)
                is_estimated = True

            frag_idx = d.get("fragment_index")
            frag_cnt = d.get("fragment_count")
            message = "Downloading media streams..."
            if frag_idx and frag_cnt:
                message = f"Downloading fragment {frag_idx}/{frag_cnt}..."

            # Throttle intermediate progress events
            if (now - self.last_update_time) >= self.throttle_interval or percent == 100.0:
                self.last_update_time = now
                job_manager.dispatch_from_thread(
                    job_id=self.job_id,
                    status=JobStatus.DOWNLOADING,
                    stage="downloading",
                    message=message,
                    percent=percent,
                    is_estimated=is_estimated,
                    downloaded_bytes=downloaded,
                    total_bytes=total or total_estimate,
                    speed=speed,
                    eta=int(eta) if eta is not None else None,
                )

        elif status == "finished":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or downloaded
            self.last_update_time = now
            job_manager.dispatch_from_thread(
                job_id=self.job_id,
                status=JobStatus.DOWNLOADING,
                stage="downloading",
                message="Download stream completed. Preparing processing...",
                percent=100.0,
                is_estimated=False,
                downloaded_bytes=downloaded,
                total_bytes=total,
            )

    def postprocessor_hook(self, d: dict) -> None:
        job = job_manager.get_job_sync(self.job_id)
        if job and job.cancellation_requested:
            raise DownloadCancelled("Download cancelled during post-processing.")

        status = d.get("status")
        pp = d.get("postprocessor", "")

        msg = "Processing media..."
        if "ExtractAudio" in pp:
            msg = "Extracting and encoding audio with FFmpeg..."
        elif "Merger" in pp:
            msg = "Merging audio and video tracks with FFmpeg..."
        elif "MoveFiles" in pp or "Fixup" in pp:
            msg = "Packaging final media container..."

        if status == "started":
            job_manager.dispatch_from_thread(
                job_id=self.job_id,
                status=JobStatus.POST_PROCESSING,
                stage="post_processing",
                message=msg,
                percent=None,  # Postprocessing is indeterminate
            )
        elif status == "finished":
            job_manager.dispatch_from_thread(
                job_id=self.job_id,
                status=JobStatus.PACKAGING,
                stage="packaging",
                message="Finalizing media file...",
                percent=100.0,
            )


def _sync_execute_download(
    job_id: str,
    url: str,
    output_format: Literal["mp3", "mp4"],
    quality: str,
    workdir: Path,
) -> Tuple[Path, str, str, int]:
    """Execute download with full progress and postprocessing hooks."""
    tracker = BananaProgressTracker(job_id)
    outtmpl = str(workdir / "%(title).100s [%(id)s].%(ext)s")

    if output_format == "mp4":
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": mp4_format_selector(quality),
            "merge_output_format": "mp4",
            "restrictfilenames": False,
            "windowsfilenames": True,
            "progress_hooks": [tracker.progress_hook],
            "postprocessor_hooks": [tracker.postprocessor_hook],
        }
    else:
        mp3_quality = quality.strip() if quality.strip().isdigit() else "192"
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "ba/b[ext=mp4]/18/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": mp3_quality,
                }
            ],
            "restrictfilenames": False,
            "windowsfilenames": True,
            "progress_hooks": [tracker.progress_hook],
            "postprocessor_hooks": [tracker.postprocessor_hook],
        }

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    final_file = pick_final_file(workdir, output_format)
    filesize = final_file.stat().st_size
    raw_title = info.get("title") or "banana_media"
    title = sanitize_filename(raw_title)
    filename = f"{title}.{output_format}"
    content_type = "audio/mpeg" if output_format == "mp3" else "video/mp4"

    return final_file, filename, content_type, filesize


async def execute_download_job(job_id: str) -> None:
    """Asynchronous job worker that runs the download process."""
    job = await job_manager.get_job(job_id)
    if not job or job.cancellation_requested:
        return

    workdir = job_manager.get_workdir(job_id)
    if not workdir:
        await job_manager.fail_job(job_id, ErrorCode.TEMP_STORAGE_ERROR, "Working directory missing.")
        return

    try:
        # 1. Fetch metadata stage
        await job_manager.update_job_progress(
            job_id=job_id,
            status=JobStatus.FETCHING_METADATA,
            stage="metadata",
            message="Connecting and retrieving media metadata...",
        )

        # 2. Execute download in worker thread
        final_file, filename, content_type, filesize = await asyncio.to_thread(
            _sync_execute_download,
            job_id,
            job.url,
            job.format,  # type: ignore
            job.quality,
            workdir,
        )

        # 3. Mark ready and issue download token
        await job_manager.set_job_ready(
            job_id=job_id,
            final_filepath=final_file,
            output_filename=filename,
            content_type=content_type,
            filesize=filesize,
        )

    except DownloadCancelled:
        logger.info(f"Job {job_id} was successfully cancelled.")
        await job_manager.cancel_job(job_id)
    except Exception as exc:
        err_code, user_msg, tech_msg = categorize_error(exc)
        logger.error(f"Execution error on job {job_id}: {user_msg} ({tech_msg})", exc_info=True)
        await job_manager.fail_job(job_id, err_code, user_msg, tech_msg)


# Legacy compatibility functions
def _sync_download(
    url: str,
    output_format: Literal["mp3", "mp4"],
    quality: str,
    workdir: Path,
) -> tuple[Path, str]:
    """Synchronous media download and merge in worker thread for legacy routes and tests."""
    outtmpl = str(workdir / "%(title).100s [%(id)s].%(ext)s")

    if output_format == "mp4":
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": mp4_format_selector(quality),
            "merge_output_format": "mp4",
            "restrictfilenames": False,
            "windowsfilenames": True,
        }
    else:
        mp3_quality = quality.strip() if quality.strip().isdigit() else "192"
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "ba/b[ext=mp4]/18/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": mp3_quality,
                }
            ],
            "restrictfilenames": False,
            "windowsfilenames": True,
        }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as exc:
        clean_msg = str(exc).split("ERROR:")[-1].strip()
        raise HTTPException(status_code=400, detail=f"Download failed: {clean_msg}") from exc
    except Exception as exc:
        logger.error(f"Media processing error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Media processing failed. Please try again.") from exc

    final_file = pick_final_file(workdir, output_format)
    title = sanitize_filename(info.get("title") or "banana_download")
    return final_file, title


async def prepare_media_job(
    url: str,
    output_format: Literal["mp3", "mp4"],
    quality: str,
) -> PreparedJob:
    """Legacy prepare endpoint compatibility."""
    if not is_valid_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch, shorts, or youtu.be link."
        )

    async with storage_manager.semaphore:
        job_id, workdir = storage_manager.create_job_directory()

        try:
            final_file, title = await asyncio.to_thread(
                _sync_download,
                url,
                output_format,
                quality,
                workdir,
            )

            filename = f"{title}.{output_format}"
            media_type = "audio/mpeg" if output_format == "mp3" else "video/mp4"

            job = await storage_manager.register_prepared_job(
                job_id=job_id,
                workdir=workdir,
                filepath=final_file,
                filename=filename,
                media_type=media_type,
            )
            return job

        except Exception:
            await storage_manager.cleanup_job(job_id, force=True)
            raise
