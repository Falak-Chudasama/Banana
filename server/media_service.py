import asyncio
import logging
from pathlib import Path
import time
from typing import Any, Dict, Literal, Optional

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from config import MEDIA_MAX_DURATION_SECONDS
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
    for attempt in range(2):
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
            return max(candidates, key=lambda p: p.stat().st_mtime)

        if attempt == 0:
            time.sleep(0.15)

    raise HTTPException(
        status_code=500,
        detail="Processing completed, but the expected output media file was not found."
    )


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
    for f in (data.get("formats") or [])[:20]:
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


def _sync_download(
    url: str,
    output_format: Literal["mp3", "mp4"],
    quality: str,
    workdir: Path,
) -> tuple[Path, str]:
    """Synchronous media download and merge in worker thread."""
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
