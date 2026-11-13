import asyncio
import logging
from pathlib import Path
from typing import Literal, Tuple

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadCancelled, DownloadError, download_range_func

from job_types import ErrorCode, JobStatus
from jobs import job_manager
from media_service import (
    BananaProgressTracker,
    YDL_BASE_OPTS,
    categorize_error,
    mp4_format_selector,
    pick_final_file,
)
from storage import PreparedJob, storage_manager
from validator import is_valid_youtube_url, sanitize_filename

logger = logging.getLogger("banana.trim")


def format_seconds_to_timestamp(seconds: float) -> str:
    """Format float seconds to hh:mm:ss.xxx for FFmpeg."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def _sync_execute_trim(
    job_id: str,
    url: str,
    output_format: Literal["mp3", "mp4"],
    start_time: float,
    end_time: float,
    workdir: Path,
) -> Tuple[Path, str, str, int]:
    duration = end_time - start_time
    if duration <= 0:
        raise ValueError("End time must be greater than start time.")

    tracker = BananaProgressTracker(job_id)
    outtmpl = str(workdir / "%(title).100s [trimmed_%(id)s].%(ext)s")
    range_fn = download_range_func(None, [(start_time, end_time)])

    if output_format == "mp4":
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/18/best",
            "merge_output_format": "mp4",
            "download_ranges": range_fn,
            "force_keyframes_at_cuts": True,
            "windowsfilenames": True,
            "progress_hooks": [tracker.progress_hook],
            "postprocessor_hooks": [tracker.postprocessor_hook],
        }
    else:
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "ba/b[ext=mp4]/18/best",
            "download_ranges": range_fn,
            "force_keyframes_at_cuts": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "windowsfilenames": True,
            "progress_hooks": [tracker.progress_hook],
            "postprocessor_hooks": [tracker.postprocessor_hook],
        }

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    final_file = pick_final_file(workdir, output_format)
    filesize = final_file.stat().st_size
    raw_title = info.get("title") or "banana_trimmed"
    title = f"{sanitize_filename(raw_title)}_trim_{int(start_time)}s_{int(end_time)}s"
    filename = f"{title}.{output_format}"
    content_type = "audio/mpeg" if output_format == "mp3" else "video/mp4"

    return final_file, filename, content_type, filesize


async def execute_trim_job(job_id: str) -> None:
    job = await job_manager.get_job(job_id)
    if not job or job.cancellation_requested:
        return

    workdir = job_manager.get_workdir(job_id)
    if not workdir:
        await job_manager.fail_job(job_id, ErrorCode.TEMP_STORAGE_ERROR, "Working directory missing.")
        return

    if job.start_time is None or job.end_time is None or job.end_time <= job.start_time:
        await job_manager.fail_job(job_id, ErrorCode.INVALID_URL, "Invalid start or end timestamps for trim.")
        return

    try:
        await job_manager.update_job_progress(
            job_id=job_id,
            status=JobStatus.FETCHING_METADATA,
            stage="metadata",
            message="Connecting to source for clip extraction...",
        )

        final_file, filename, content_type, filesize = await asyncio.to_thread(
            _sync_execute_trim,
            job_id,
            job.url,
            job.format,  # type: ignore
            job.start_time,
            job.end_time,
            workdir,
        )

        await job_manager.set_job_ready(
            job_id=job_id,
            final_filepath=final_file,
            output_filename=filename,
            content_type=content_type,
            filesize=filesize,
        )

    except DownloadCancelled:
        logger.info(f"Trim job {job_id} was successfully cancelled.")
        await job_manager.cancel_job(job_id)
    except Exception as exc:
        err_code, user_msg, tech_msg = categorize_error(exc)
        logger.error(f"Execution error on trim job {job_id}: {user_msg} ({tech_msg})", exc_info=True)
        await job_manager.fail_job(job_id, err_code, user_msg, tech_msg)


# Legacy synchronous function for backward compatibility and existing tests
def _sync_trim_media(
    url: str,
    output_format: Literal["mp3", "mp4"],
    start_time: float,
    end_time: float,
    workdir: Path,
) -> tuple[Path, str]:
    duration = end_time - start_time
    if duration <= 0:
        raise ValueError("End time must be greater than start time.")

    outtmpl = str(workdir / "%(title).100s [trimmed_%(id)s].%(ext)s")
    range_fn = download_range_func(None, [(start_time, end_time)])

    if output_format == "mp4":
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/18/best",
            "merge_output_format": "mp4",
            "download_ranges": range_fn,
            "force_keyframes_at_cuts": True,
            "windowsfilenames": True,
        }
    else:
        ydl_opts = {
            **YDL_BASE_OPTS,
            "outtmpl": outtmpl,
            "format": "ba/b[ext=mp4]/18/best",
            "download_ranges": range_fn,
            "force_keyframes_at_cuts": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "windowsfilenames": True,
        }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as exc:
        clean_msg = str(exc).split("ERROR:")[-1].strip()
        raise HTTPException(status_code=400, detail=f"Trimming failed: {clean_msg}") from exc
    except Exception as exc:
        logger.error(f"Trimming error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Media trimming failed. Please check timestamps.") from exc

    final_file = pick_final_file(workdir, output_format)
    raw_title = info.get("title") or "banana_trimmed"
    title = f"{sanitize_filename(raw_title)}_trim_{int(start_time)}s_{int(end_time)}s"
    return final_file, title


async def trim_media_job(
    url: str,
    output_format: Literal["mp3", "mp4"],
    start_time: float,
    end_time: float,
) -> PreparedJob:
    if not is_valid_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch, shorts, or youtu.be link.",
        )

    if start_time < 0 or end_time <= start_time:
        raise HTTPException(
            status_code=400,
            detail="Invalid timestamp range. Start time must be >= 0 and end time must be > start time.",
        )

    async with storage_manager.semaphore:
        job_id, workdir = storage_manager.create_job_directory()

        try:
            final_file, title = await asyncio.to_thread(
                _sync_trim_media,
                url,
                output_format,
                start_time,
                end_time,
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
