import asyncio
import logging
from typing import Any, Dict, List, Literal

from fastapi import HTTPException
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from config import PLAYLIST_MAX_ITEMS
from discover_service import extract_best_thumbnail
from media_service import YDL_BASE_OPTS
from validator import extract_playlist_id, is_valid_playlist_url, is_valid_youtube_url

logger = logging.getLogger("banana.playlist")


def _sync_extract_playlist(url: str) -> Dict[str, Any]:
    """Extract flat playlist metadata in worker thread."""
    ydl_opts = {
        **YDL_BASE_OPTS,
        "extract_flat": True,
        "skip_download": True,
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(url, download=False)
            if not res:
                raise HTTPException(status_code=404, detail="Playlist not found or empty.")

            raw_entries = res.get("entries")
            entries = list(raw_entries) if raw_entries else []
            tracks = []

            for entry in entries[:PLAYLIST_MAX_ITEMS]:
                vid = entry.get("id") or ""
                if not vid:
                    continue

                thumb = extract_best_thumbnail(entry.get("thumbnails") or entry.get("thumbnail"), vid)

                tracks.append({
                    "id": vid,
                    "title": entry.get("title") or "Untitled Track",
                    "artist": entry.get("uploader") or entry.get("channel") or "Unknown Artist",
                    "duration": entry.get("duration"),
                    "thumbnail": thumb,
                    "url": f"https://www.youtube.com/watch?v={vid}",
                })

            return {
                "id": res.get("id") or extract_playlist_id(url) or "playlist",
                "title": res.get("title") or "YouTube Playlist",
                "uploader": res.get("uploader") or res.get("channel") or "Unknown Channel",
                "track_count": len(tracks),
                "tracks": tracks,
            }

    except DownloadError as exc:
        clean_msg = str(exc).split("ERROR:")[-1].strip()
        raise HTTPException(status_code=400, detail=f"Playlist error: {clean_msg}") from exc
    except Exception as exc:
        logger.error(f"Error extracting playlist: {exc}")
        raise HTTPException(status_code=400, detail="Could not read playlist details.") from exc


async def extract_playlist_async(url: str) -> Dict[str, Any]:
    if not is_valid_youtube_url(url):
        raise HTTPException(status_code=400, detail="Please provide a valid YouTube or YouTube Music playlist link.")

    return await asyncio.to_thread(_sync_extract_playlist, url)
