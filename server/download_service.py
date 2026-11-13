import logging
import urllib.parse
from pathlib import Path

from fastapi import HTTPException, Request, Response
from starlette.background import BackgroundTask
from starlette.responses import FileResponse

from jobs import job_manager

logger = logging.getLogger("banana.download")


async def handle_download_request(token: str, request: Request) -> Response:
    """
    Handle GET and HEAD requests for prepared files with full HTTP Range (200, 206, 416)
    and safe lease/transfer tracking.
    """
    job = await job_manager.get_by_token(token)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="Download token is invalid, expired, or media was already consumed.",
        )

    filepath = job_manager.get_file_path(job.job_id)
    if not filepath or not filepath.exists() or not filepath.is_file():
        raise HTTPException(
            status_code=404,
            detail="The prepared media file could not be found or has expired.",
        )

    filename = job.output_filename or f"banana_media.{job.output_extension or 'mp4'}"
    content_type = job.content_type or ("audio/mpeg" if filename.endswith(".mp3") else "video/mp4")
    encoded_filename = urllib.parse.quote(filename)

    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded_filename}",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }

    if request.method == "HEAD":
        # Do not increment transfer count on HEAD requests
        return FileResponse(
            path=filepath,
            media_type=content_type,
            headers=headers,
        )

    # Active GET transfer
    await job_manager.increment_transfers(job.job_id)

    async def on_transfer_finished():
        await job_manager.decrement_transfers(job.job_id, bytes_sent=job.output_size_bytes or 0)

    return FileResponse(
        path=filepath,
        media_type=content_type,
        headers=headers,
        background=BackgroundTask(on_transfer_finished),
    )


async def handle_download_complete(token: str) -> dict:
    """Client acknowledgment that file was successfully written and closed."""
    success = await job_manager.acknowledge_completion(token)
    if not success:
        raise HTTPException(status_code=404, detail="Token not found or already completed.")
    return {"ok": True, "token": token, "status": "completed"}
