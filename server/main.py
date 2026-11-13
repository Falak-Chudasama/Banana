import asyncio
import logging
import shutil
import time
import urllib.parse
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Header, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from config import (
    BANANA_ALLOWED_ORIGINS,
    MEDIA_DOWNLOAD_CHUNK_SIZE,
)
from discover_service import discover_engine
from download_service import handle_download_complete, handle_download_request
from job_types import ErrorCode, JobRecord, JobStatus, JobType
from jobs import job_manager
from media_service import (
    execute_download_job,
    extract_info_async,
    prepare_media_job,
)
from playlist_jobs import create_playlist_job
from playlist_service import extract_playlist_async
from resilience import ensure_ffmpeg_in_path
from search_service import search_videos_async
from storage import PreparedJob, storage_manager
from stream_service import handle_preview_stream
from trim_service import execute_trim_job, trim_media_job
from validator import is_valid_playlist_url, is_valid_youtube_url

# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("banana.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure FFmpeg discovery, initialize JobManager and StorageManager
    loop = asyncio.get_running_loop()
    try:
        ensure_ffmpeg_in_path()
    except Exception as exc:
        logger.warning(f"Resilience pre-flight check warning: {exc}")

    try:
        job_manager.initialize(loop=loop)
    except Exception as exc:
        logger.error(f"JobManager initialization error: {exc}")

    try:
        storage_manager.initialize()
        storage_manager.start_periodic_cleanup()
    except Exception as exc:
        logger.warning(f"Legacy StorageManager initialization warning: {exc}")

    logger.info("Banana Backend services and JobManager initialized and ready.")
    yield

    # Shutdown: gracefully stop workers and purge jobs
    logger.info("Banana Backend shutting down...")
    try:
        await job_manager.shutdown()
    except Exception as exc:
        logger.warning(f"JobManager shutdown warning: {exc}")

    try:
        await storage_manager.stop_periodic_cleanup()
    except Exception as exc:
        logger.warning(f"StorageManager shutdown cleanup warning: {exc}")
    logger.info("Banana Backend shutdown complete.")


app = FastAPI(
    title="Banana Media Backend",
    version="2.1.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# CORS configuration: explicit whitelist + universal loopback/localhost regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=BANANA_ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://([a-zA-Z0-9.-]+\.)?banana\.com(:\d+)?$|^https?://(localhost|127\.0\.0\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Disposition", "Content-Length"],
)


# Global privacy & cache-prevention middleware
@app.middleware("http")
async def add_privacy_headers(request: Request, call_next):
    response: Response = await call_next(request)
    # Don't override stream response headers if already set
    if "Cache-Control" not in response.headers:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    if "Pragma" not in response.headers:
        response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


# Typed Request Models
class CreateDownloadJobRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=2048)
    format: Literal["mp3", "mp4"] = "mp4"
    quality: str = "best"


class CreateTrimJobRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=2048)
    format: Literal["mp3", "mp4"] = "mp3"
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., gt=0.0)


class CreatePlaylistJobRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=2048)
    format: Literal["mp3", "mp4"] = "mp3"
    quality: str = "best"
    track_ids: Optional[List[str]] = None


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


router = APIRouter()


@router.get("/")
def root():
    return {
        "ok": True,
        "name": "Banana Media Backend",
        "version": "2.1.0",
        "features": [
            "real_time_sse_progress",
            "cooperative_cancellation",
            "progressive_file_transfer",
            "http_range_206_seeking",
            "ephemeral_zero_storage",
        ],
    }


@router.get("/health")
def health():
    return {
        "ok": True,
        "active_jobs": job_manager.active_jobs_count,
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
            "root": str(job_manager.temp_root),
            "exists": job_manager.temp_root.exists(),
            "active_jobs": job_manager.active_jobs_count,
        },
    }


# =========================================================================
# 1. NEW ROBUST JOB ORCHESTRATION & SSE PIPELINE
# =========================================================================

@router.post("/jobs/download")
async def create_download_job(payload: CreateDownloadJobRequest):
    """Initiate a download job and enter concurrency queue with truthful progress."""
    if not is_valid_youtube_url(payload.url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    job = await job_manager.create_job(
        job_type=JobType.DOWNLOAD,
        url=payload.url.strip(),
        format=payload.format,
        quality=payload.quality,
    )
    await job_manager.enqueue_execution(job.job_id, execute_download_job)
    return {"ok": True, "job": job.to_client_dict()}


@router.post("/jobs/trim")
async def create_trim_job(payload: CreateTrimJobRequest):
    """Initiate a trim job with real-time FFmpeg & download progress hooks."""
    if not is_valid_youtube_url(payload.url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")
    if payload.start_time < 0 or payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="End time must be strictly greater than start time.")

    job = await job_manager.create_job(
        job_type=JobType.TRIM,
        url=payload.url.strip(),
        format=payload.format,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    await job_manager.enqueue_execution(job.job_id, execute_trim_job)
    return {"ok": True, "job": job.to_client_dict()}


@router.post("/jobs/playlist")
async def create_playlist_batch_job(payload: CreatePlaylistJobRequest):
    """Initiate a parent playlist job and child track jobs with aggregate telemetry."""
    if not is_valid_playlist_url(payload.url) and not is_valid_youtube_url(payload.url):
        raise HTTPException(status_code=400, detail="Invalid playlist URL.")

    try:
        parent_job = await create_playlist_job(
            url=payload.url.strip(),
            format=payload.format,
            quality=payload.quality,
            track_ids=payload.track_ids,
        )
        return {"ok": True, "job": parent_job.to_client_dict()}
    except Exception as exc:
        logger.error(f"Failed to create playlist batch job: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/jobs/{job_id}")
async def get_job_state(job_id: str):
    """Polling fallback: returns the current job state."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    data = job.to_client_dict()
    # If playlist parent, attach child job summary
    if job.job_type == JobType.PLAYLIST_PARENT and job.child_job_ids:
        children = []
        for cid in job.child_job_ids:
            cjob = await job_manager.get_job(cid)
            if cjob:
                children.append(cjob.to_client_dict())
        data["children"] = children

    return {"ok": True, "job": data}


@router.get("/jobs/{job_id}/events")
async def stream_job_events(
    job_id: str,
    last_event_id: Optional[int] = Query(None, alias="last_event_id"),
    header_last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
):
    """
    Server-Sent Events (SSE) stream delivering real-time progress, stages, and completion events.
    Supports reconnection via Last-Event-ID and periodic heartbeats.
    """
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    eff_last_id = None
    if header_last_event_id and header_last_event_id.isdigit():
        eff_last_id = int(header_last_event_id)
    elif last_event_id is not None:
        eff_last_id = last_event_id

    async def sse_generator():
        queue, replayed = await job_manager.subscribe_events(job_id, eff_last_id)
        try:
            # Replay missed events or current state snapshot
            for ev in replayed:
                yield f"id: {ev.event_id}\nevent: {ev.type}\ndata: {ev.model_dump_json()}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"id: {event.event_id}\nevent: {event.type}\ndata: {event.model_dump_json()}\n\n"

                    if event.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.EXPIRED):
                        # Graceful close on terminal state
                        break
                except asyncio.TimeoutError:
                    yield f": heartbeat {time.time()}\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            await job_manager.unsubscribe_events(job_id, queue)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a queued or currently executing media job."""
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled or is already finished.")
    return {"ok": True, "job_id": job_id, "status": "cancelled"}


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str):
    """Retry an eligible failed or cancelled media job."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    execute_fn = execute_download_job if job.job_type != JobType.TRIM else execute_trim_job
    updated = await job_manager.retry_job(job_id, execute_fn)
    if not updated:
        raise HTTPException(status_code=400, detail="Job is not eligible for retry.")
    return {"ok": True, "job": updated.to_client_dict()}


# =========================================================================
# 2. FINAL FILE DELIVERY & RANGE TRANSFER (STARLETTE 200, 206, 416, HEAD)
# =========================================================================

@router.api_route("/download/{token}", methods=["GET", "HEAD"])
async def download_file_by_token(token: str, request: Request):
    """
    Deliver prepared file with full HTTP Range support (200, 206, 416) and HEAD requests.
    Does not delete the file prematurely.
    """
    return await handle_download_request(token, request)


@router.post("/download/{token}/complete")
async def complete_download_by_token(token: str):
    """Client acknowledgment after successful file write and stream closure."""
    return await handle_download_complete(token)


# =========================================================================
# 3. STREAM PREVIEW (RANGE SEEKING & ZERO DISK PIPELINE)
# =========================================================================

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


# =========================================================================
# 4. METADATA, DISCOVER, SEARCH, PLAYLIST INFO
# =========================================================================

@router.get("/info")
async def get_media_info(url: str = Query(..., description="YouTube URL")):
    if not is_valid_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch, shorts, or youtu.be link.",
        )
    return await extract_info_async(url)


@router.get("/playlist/info")
async def get_playlist_info(url: str = Query(..., description="YouTube or YT Music playlist URL")):
    return await extract_playlist_async(url)


@router.api_route("/discover/seed", methods=["GET", "POST"])
async def discover_seed(
    request: Request,
    payload: Optional[DiscoverSeedRequest] = None,
    query: Optional[str] = Query(None, description="YouTube link or search query"),
):
    search_query = query
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict) and body.get("query"):
                search_query = str(body["query"])
        except Exception:
            if payload and payload.query:
                search_query = payload.query

    if not search_query:
        if request.method == "GET":
            return {"ok": True, "message": "Discover seed endpoint ready. Provide ?query=<term> or send POST."}
        raise HTTPException(status_code=400, detail="Missing required 'query' parameter.")

    try:
        seed = await discover_engine.resolve_seed(search_query)
        return {"ok": True, "seed": seed}
    except Exception as exc:
        logger.warning(f"Seed resolution failed for '{search_query}': {exc}")
        raise HTTPException(status_code=404, detail=f"Could not identify song: {exc}")


@router.api_route("/discover/recommendations", methods=["GET", "POST"])
async def discover_recommendations(request: Request, payload: Optional[DiscoverRecommendRequest] = None):
    if request.method == "GET":
        return {"ok": True, "message": "Discover recommendations endpoint ready. Send POST with seed and category."}

    req_payload = payload
    if req_payload is None:
        try:
            body_dict = await request.json()
            req_payload = DiscoverRecommendRequest(**body_dict)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid recommendation payload: {exc}")

    try:
        recs = await discover_engine.get_recommendations(
            seed=req_payload.seed,
            category=req_payload.category,
            similarity_pref=req_payload.similarity_pref,
            popularity_pref=req_payload.popularity_pref,
            diversity_pref=req_payload.diversity_pref,
            liked_ids=req_payload.liked_ids,
            disliked_ids=req_payload.disliked_ids,
            known_ids=req_payload.known_ids,
            limit=req_payload.limit,
        )
        return {"ok": True, "category": req_payload.category, "recommendations": recs}
    except Exception as exc:
        logger.error(f"Recommendation generation error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Recommendation engine encountered an error.")


@router.api_route("/search", methods=["GET", "POST"])
async def search_videos(
    request: Request,
    query: Optional[str] = Query(None, description="Video search query"),
    limit: int = Query(20, ge=1, le=50, description="Max search results"),
):
    search_query = query
    max_results = limit

    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                if body.get("query"):
                    search_query = str(body["query"])
                if body.get("limit"):
                    max_results = int(body["limit"])
        except Exception:
            pass

    if not search_query or not search_query.strip():
        if request.method == "GET":
            return {"ok": True, "results": [], "message": "Search endpoint ready. Provide ?query=<term>"}
        raise HTTPException(status_code=400, detail="Missing required 'query' parameter.")

    try:
        results = await search_videos_async(search_query.strip(), limit=max_results)
        return {"ok": True, "query": search_query.strip(), "results": results}
    except Exception as exc:
        logger.error(f"Search failed for '{search_query}': {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Video search service encountered an error.")


# Legacy endpoints
@router.post("/download/prepare", response_model=PreparedMediaResponse)
async def prepare_download(payload: MediaRequest):
    """Legacy prepare endpoint."""
    job = await prepare_media_job(payload.url, payload.format, payload.quality)
    return PreparedMediaResponse(
        token=job.token,
        filename=job.filename,
        filesize=job.filesize,
        expires_in=storage_manager.ttl_seconds,
    )


legacy_prepare_download = prepare_download


@router.get("/download/stream")
async def legacy_stream_download(token: str = Query(..., description="Short-lived opaque download token"), request: Request = None):
    """Legacy stream endpoint: forward to handle_download_request."""
    return await handle_download_request(token, request)


@router.post("/trim/process", response_model=PreparedMediaResponse)
async def process_trim(payload: TrimRequest):
    """Legacy trim endpoint."""
    if payload.start_time < 0 or payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="Invalid timestamp range. Start time must be >= 0 and end time must be > start time.")
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


legacy_process_trim = process_trim


# Dual route registration: at root and with /api prefix
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
