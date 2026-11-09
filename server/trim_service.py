import asyncio
import logging
from pathlib import Path
from typing import Literal

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, download_range_func

from media_service import YDL_BASE_OPTS, mp4_format_selector, pick_final_file
from storage import PreparedJob, storage_manager
from validator import is_valid_youtube_url, sanitize_filename

logger = logging.getLogger("banana.trim")


def format_seconds_to_timestamp(seconds: float) -> str:
    """Format float seconds to hh:mm:ss.xxx for FFmpeg."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


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
