import logging
import shutil
import urllib.parse
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from config import (
    LYCHEE_ALLOWED_ORIGINS,
    MEDIA_DOWNLOAD_CHUNK_SIZE,
)
from discover_service import discover_engine
from media_service import extract_info_async, prepare_media_job
from playlist_service import extract_playlist_async
from resilience import ensure_ffmpeg_in_path
from storage import PreparedJob, storage_manager
from stream_service import handle_preview_stream
from trim_service import trim_media_job
from validator import is_valid_youtube_url

# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lychee.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure FFmpeg discovery, initialize temp root, and start periodic cleaner
    try:
        ensure_ffmpeg_in_path()
    except Exception as exc:
        logger.warning(f"Resilience pre-flight check warning: {exc}")

    try:
        storage_manager.initialize()
    except Exception as exc:
        logger.error(f"Storage initialization error: {exc}")

    try:
        storage_manager.start_periodic_cleanup()
    except Exception as exc:
        logger.warning(f"Could not start periodic cleanup: {exc}")

    logger.info("Lychee Backend services initialized and ready.")
    yield

    # Shutdown: gracefully stop cleaner and purge jobs
    logger.info("Lychee Backend shutting down...")
    try:
        await storage_manager.stop_periodic_cleanup()
    except Exception as exc:
        logger.warning(f"Shutdown cleanup warning: {exc}")
    logger.info("Lychee Backend shutdown complete.")


app = FastAPI(
    title="Lychee Media Backend",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# CORS configuration: explicit whitelist + universal loopback/localhost regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=LYCHEE_ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.\d+)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# Global privacy & cache-prevention middleware
@app.middleware("http")
async def add_privacy_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


# Typed models
class MediaRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=2048)
    format: Literal["mp3", "mp4"] = "mp4"
    quality: str = "best"


class PreparedMediaResponse(BaseModel):
    token: str
    filename: str
    filesize: int
    expires_in: int


class TrimRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=2048)
    format: Literal["mp3", "mp4"] = "mp3"
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., gt=0.0)


class DiscoverSeedRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=2048)


class DiscoverRecommendRequest(BaseModel):
    seed: Dict[str, Any]
    category: Literal["more_like_this", "same_vibe", "hidden_gems", "trending", "explore"] = "more_like_this"
    similarity_pref: Literal["experimental", "balanced", "very_similar"] = "balanced"
    popularity_pref: Literal["underground", "balanced", "popular"] = "balanced"
    diversity_pref: Literal["high", "normal", "familiar"] = "normal"
    liked_ids: List[str] = []
    disliked_ids: List[str] = []
    known_ids: List[str] = []
    limit: int = 25


# Streaming generator for prepared jobs
async def stream_media_chunks(job: PreparedJob):
    await storage_manager.increment_transfers(job.job_id)
    transfer_succeeded = False
    try:
        with open(job.filepath, "rb") as f:
            while True:
                chunk = f.read(MEDIA_DOWNLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        transfer_succeeded = True
    except (GeneratorExit, ConnectionResetError, BrokenPipeError):
        logger.info(f"Transfer interrupted for job {job.job_id}")
    except Exception as exc:
        logger.error(f"Streaming error for job {job.job_id}: {exc}")
    finally:
        await storage_manager.decrement_transfers(job.job_id, mark_completed=transfer_succeeded)


router = APIRouter()


@router.get("/")
def root():
    return {
        "ok": True,
        "name": "Lychee Media Backend",
        "version": "2.0.0",
        "endpoints": [
            "/health",
            "/info",
            "/download/prepare",
            "/download/stream",
            "/stream/preview",
            "/trim/process",
            "/playlist/info",
            "/discover/seed",
            "/discover/recommendations",
        ],
    }


@router.get("/health")
def health():
    return {
        "ok": True,
        "active_jobs": storage_manager.active_jobs_count,
    }


@router.get("/diagnostics")
def diagnostics():
    ffmpeg_bin = shutil.which("ffmpeg")
    return {
        "ok": True,
        "ffmpeg": {
            "available": ffmpeg_bin is not None,
            "path": ffmpeg_bin,
        },
        "storage": {
            "root": str(storage_manager.temp_root),
            "exists": storage_manager.temp_root.exists(),
            "active_jobs": storage_manager.active_jobs_count,
        },
    }


# 1. Media Info & Metadata
@router.get("/info")
async def get_media_info(url: str = Query(..., description="YouTube URL")):
    if not is_valid_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch, shorts, or youtu.be link.",
        )
    return await extract_info_async(url)


# 2. Preview Streaming (Range-compatible)
@router.get("/stream/preview")
async def preview_stream(
    request: Request,
    url: str = Query(..., description="YouTube URL to stream"),
    format: Literal["audio", "video"] = Query("audio"),
):
    """
    On-demand seekable media preview using HTTP Range requests (206 Partial Content).
    Enables native HTML5 audio and video playback without pre-downloading.
    """
    return await handle_preview_stream(url, format, request)


# 3. Download Preparation & Native Chunked Streaming
@router.post("/download/prepare", response_model=PreparedMediaResponse)
async def prepare_download(payload: MediaRequest):
    job = await prepare_media_job(payload.url, payload.format, payload.quality)
    return PreparedMediaResponse(
        token=job.token,
        filename=job.filename,
        filesize=job.filesize,
        expires_in=storage_manager.ttl_seconds,
    )


@router.get("/download/stream")
async def stream_download(token: str = Query(..., description="Short-lived opaque download token")):
    job = await storage_manager.get_by_token(token)
    if not job or not job.filepath.exists():
        raise HTTPException(
            status_code=404,
            detail="Download token is invalid, expired, or media was already consumed.",
        )

    encoded_filename = urllib.parse.quote(job.filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"{job.filename}\"; filename*=UTF-8''{encoded_filename}",
        "Content-Length": str(job.filesize),
    }

    return StreamingResponse(
        stream_media_chunks(job),
        media_type=job.media_type,
        headers=headers,
    )


@router.get("/download/file")
async def download_file_direct(
    url: str = Query(..., description="YouTube URL"),
    format: Literal["mp3", "mp4"] = Query("mp4"),
    quality: str = Query("best"),
):
    job = await prepare_media_job(url, format, quality)
    encoded_filename = urllib.parse.quote(job.filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"{job.filename}\"; filename*=UTF-8''{encoded_filename}",
        "Content-Length": str(job.filesize),
    }

    return StreamingResponse(
        stream_media_chunks(job),
        media_type=job.media_type,
        headers=headers,
    )


# 4. Audio & Video Trimming
@router.post("/trim/process", response_model=PreparedMediaResponse)
async def process_trim(payload: TrimRequest):
    """
    Trim audio or video using FFmpeg and bounded downloads.
    Returns a short-lived download token for the trimmed file.
    """
    job = await trim_media_job(
        payload.url,
        payload.format,
        payload.start_time,
        payload.end_time,
    )
    return PreparedMediaResponse(
        token=job.token,
        filename=job.filename,
        filesize=job.filesize,
        expires_in=storage_manager.ttl_seconds,
    )


# 5. Playlist Management
@router.get("/playlist/info")
async def get_playlist_info(url: str = Query(..., description="YouTube or YT Music playlist URL")):
    """
    Extract flat track listing for a YouTube or YouTube Music playlist.
    """
    return await extract_playlist_async(url)


# 6. Lychee Discover Engine
@router.post("/discover/seed")
async def discover_seed(payload: DiscoverSeedRequest):
    """
    Identify seed song from a YouTube link or artist/title search query.
    """
    try:
        seed = await discover_engine.resolve_seed(payload.query)
        return {"ok": True, "seed": seed}
    except Exception as exc:
        logger.warning(f"Seed resolution failed for '{payload.query}': {exc}")
        raise HTTPException(status_code=404, detail=f"Could not identify song: {exc}")


@router.post("/discover/recommendations")
async def discover_recommendations(payload: DiscoverRecommendRequest):
    """
    Generate ranked recommendations based on seed track and chosen category.
    """
    try:
        recs = await discover_engine.get_recommendations(
            seed=payload.seed,
            category=payload.category,
            similarity_pref=payload.similarity_pref,
            popularity_pref=payload.popularity_pref,
            diversity_pref=payload.diversity_pref,
            liked_ids=payload.liked_ids,
            disliked_ids=payload.disliked_ids,
            known_ids=payload.known_ids,
            limit=payload.limit,
        )
        return {"ok": True, "category": payload.category, "recommendations": recs}
    except Exception as exc:
        logger.error(f"Recommendation generation error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Recommendation engine encountered an error.")


# Register routes at root and with /api prefix
app.include_router(router)
app.include_router(router, prefix="/api")


# Exception handlers
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error processing request: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": True, "detail": "An internal server error occurred while processing media."},
    )
