import asyncio
import logging
import time
from typing import Dict, Literal, Optional, Tuple

import requests
from fastapi import HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from yt_dlp import YoutubeDL

from config import MEDIA_DOWNLOAD_CHUNK_SIZE
from media_service import YDL_BASE_OPTS
from validator import is_valid_youtube_url

logger = logging.getLogger("banana.stream")

# In-memory stream cache
# Key: (url, stream_type) -> (direct_url, mime_type, total_size, http_headers, expires_at)
_STREAM_CACHE: Dict[Tuple[str, str], Tuple[str, str, int, dict, float]] = {}
_STREAM_LOCKS: Dict[Tuple[str, str], asyncio.Lock] = {}
_GLOBAL_LOCK = asyncio.Lock()
_CACHE_TTL = 300.0  # 5 minutes

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


def _sync_get_direct_stream(url: str, stream_type: Literal["audio", "video"]) -> Tuple[str, str, int, dict]:
    ydl_opts = {
        **YDL_BASE_OPTS,
        "skip_download": True,
    }

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    formats = info.get("formats") or []
    chosen = None

    if stream_type == "audio":
        audio_formats = [
            f for f in formats
            if f.get("url") and f.get("acodec") != "none"
        ]
        if audio_formats:
            f140 = [f for f in audio_formats if f.get("format_id") in ("140", "18")]
            if f140:
                chosen = f140[0]
            else:
                chosen = audio_formats[0]
    else:
        f18 = [f for f in formats if f.get("url") and f.get("format_id") == "18"]
        if f18:
            chosen = f18[0]
        else:
            progressive = [
                f for f in formats
                if f.get("url")
                and f.get("vcodec") != "none"
                and f.get("acodec") != "none"
            ]
            if progressive:
                chosen = progressive[0]
            else:
                any_video = [f for f in formats if f.get("url") and f.get("vcodec") != "none"]
                if any_video:
                    chosen = any_video[0]

    if not chosen or not chosen.get("url"):
        raise HTTPException(status_code=404, detail="No direct playable stream found for this media.")

    direct_url = chosen["url"]
    headers = dict(chosen.get("http_headers") or {})
    ext = chosen.get("ext", "mp4")
    mime = (
        "audio/mp4" if ext in ("m4a", "mp4") and stream_type == "audio"
        else "video/mp4" if stream_type == "video"
        else "audio/mpeg"
    )
    filesize = chosen.get("filesize") or chosen.get("filesize_approx") or 0

    return direct_url, mime, filesize, headers


async def get_direct_stream_info(url: str, stream_type: Literal["audio", "video"], force_refresh: bool = False) -> Tuple[str, str, int, dict]:
    now = time.time()
    cache_key = (url, stream_type)

    if not force_refresh and cache_key in _STREAM_CACHE:
        direct_url, mime, size, headers, exp = _STREAM_CACHE[cache_key]
        if now < exp:
            return direct_url, mime, size, headers

    # Acquire lock for this key to prevent duplicate concurrent resolutions
    async with _GLOBAL_LOCK:
        if cache_key not in _STREAM_LOCKS:
            _STREAM_LOCKS[cache_key] = asyncio.Lock()
        lock = _STREAM_LOCKS[cache_key]

    async with lock:
        # Check cache again after acquiring lock
        if not force_refresh and cache_key in _STREAM_CACHE:
            direct_url, mime, size, headers, exp = _STREAM_CACHE[cache_key]
            if now < exp:
                return direct_url, mime, size, headers

        direct_url, mime, size, headers = await asyncio.to_thread(_sync_get_direct_stream, url, stream_type)
        _STREAM_CACHE[cache_key] = (direct_url, mime, size, headers, now + _CACHE_TTL)
        return direct_url, mime, size, headers


def chunk_generator(upstream_response: requests.Response):
    """Synchronous chunk reader for Starlette StreamingResponse thread executor."""
    try:
        for chunk in upstream_response.iter_content(chunk_size=MEDIA_DOWNLOAD_CHUNK_SIZE):
            if chunk:
                yield chunk
    except (GeneratorExit, ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        logger.info(f"Stream playback interrupted by client: {exc}")
    finally:
        try:
            upstream_response.close()
        except Exception:
            pass


async def handle_preview_stream(
    url: str,
    stream_type: Literal["audio", "video"],
    request: Request,
) -> Response:
    if not is_valid_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    direct_url, mime_type, total_size, upstream_headers = await get_direct_stream_info(url, stream_type)

    req_headers = {k: v for k, v in upstream_headers.items() if k.lower() not in HOP_BY_HOP_HEADERS}
    range_header = request.headers.get("range")
    if range_header:
        req_headers["Range"] = range_header

    def fetch_upstream(d_url: str, hdrs: dict) -> requests.Response:
        return requests.get(d_url, headers=hdrs, stream=True, timeout=15)

    try:
        upstream = await asyncio.to_thread(fetch_upstream, direct_url, req_headers)
    except Exception as exc:
        logger.error(f"Failed to connect to upstream stream: {exc}")
        raise HTTPException(status_code=502, detail="Upstream media source unavailable.") from exc

    # If YouTube expired the direct stream URL (HTTP 403 or 410), refresh cache and retry once
    if upstream.status_code in (403, 410):
        logger.info(f"Stream returned HTTP {upstream.status_code}, refreshing direct stream token...")
        try:
            upstream.close()
        except Exception:
            pass
        _STREAM_CACHE.pop((url, stream_type), None)
        try:
            direct_url, mime_type, total_size, upstream_headers = await get_direct_stream_info(
                url, stream_type, force_refresh=True
            )
            req_headers = {k: v for k, v in upstream_headers.items() if k.lower() not in HOP_BY_HOP_HEADERS}
            if range_header:
                req_headers["Range"] = range_header

            upstream = await asyncio.to_thread(fetch_upstream, direct_url, req_headers)
        except Exception as retry_exc:
            logger.warning(f"Stream token auto-refresh retry failed: {retry_exc}")
            raise HTTPException(status_code=502, detail="Upstream media stream unavailable.") from retry_exc

    status_code = upstream.status_code

    # Handle 416 Range Not Satisfiable correctly
    if status_code == 416:
        headers_416 = {
            "Content-Range": upstream.headers.get("Content-Range", f"bytes */{total_size}"),
            "Accept-Ranges": "bytes",
        }
        upstream.close()
        return Response(status_code=416, headers=headers_416)

    if status_code not in (200, 206):
        try:
            upstream.close()
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"Upstream stream returned HTTP {status_code}.")

    resp_headers = {
        "Content-Type": upstream.headers.get("Content-Type", mime_type),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }

    if "Content-Range" in upstream.headers:
        resp_headers["Content-Range"] = upstream.headers["Content-Range"]
    if "Content-Length" in upstream.headers:
        resp_headers["Content-Length"] = upstream.headers["Content-Length"]
    if "ETag" in upstream.headers:
        resp_headers["ETag"] = upstream.headers["ETag"]
    if "Last-Modified" in upstream.headers:
        resp_headers["Last-Modified"] = upstream.headers["Last-Modified"]

    return StreamingResponse(
        chunk_generator(upstream),
        status_code=status_code,
        headers=resp_headers,
    )
