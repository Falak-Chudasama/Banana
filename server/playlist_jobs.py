import asyncio
import logging
import time
from typing import List, Optional

from config import PLAYLIST_MAX_ITEMS
from job_types import ErrorCode, JobRecord, JobStatus, JobType
from jobs import job_manager
from media_service import execute_download_job
from playlist_service import extract_playlist_async

logger = logging.getLogger("banana.playlist_jobs")


async def create_playlist_job(
    url: str,
    format: str = "mp3",
    quality: str = "best",
    track_ids: Optional[List[str]] = None,
) -> JobRecord:
    """Create parent playlist job and registered child items."""
    playlist_data = await extract_playlist_async(url)
    tracks = playlist_data.get("tracks") or []

    if track_ids:
        selected_set = set(track_ids)
        tracks = [t for t in tracks if t.get("id") in selected_set]

    if not tracks:
        raise ValueError("No valid tracks selected in playlist.")

    tracks = tracks[:PLAYLIST_MAX_ITEMS]

    # Create parent job
    parent_job = await job_manager.create_job(
        job_type=JobType.PLAYLIST_PARENT,
        url=url,
        format=format,
        quality=quality,
        title=playlist_data.get("title") or "YouTube Playlist",
        uploader=playlist_data.get("uploader"),
    )

    async with job_manager._lock:
        parent_job.playlist_total_tracks = len(tracks)
        parent_job.playlist_completed_tracks = 0
        parent_job.playlist_failed_tracks = 0
        parent_job.playlist_current_track_index = 0
        parent_job.percent = 0.0

    # Create child jobs for each track
    for t in tracks:
        track_url = t.get("url") or f"https://www.youtube.com/watch?v={t['id']}"
        child_job = await job_manager.create_job(
            job_type=JobType.PLAYLIST_ITEM,
            url=track_url,
            format=format,
            quality=quality,
            parent_job_id=parent_job.job_id,
            title=t.get("title") or "Untitled Track",
            uploader=t.get("artist") or t.get("uploader"),
            thumbnail=t.get("thumbnail"),
            duration=t.get("duration"),
        )

    # Launch sequential orchestration in background task
    asyncio.create_task(run_playlist_orchestrator(parent_job.job_id))
    return parent_job


async def run_playlist_orchestrator(parent_job_id: str) -> None:
    parent = await job_manager.get_job(parent_job_id)
    if not parent:
        return

    child_ids = list(parent.child_job_ids)
    total = len(child_ids)

    await job_manager.update_job_progress(
        job_id=parent_job_id,
        status=JobStatus.DOWNLOADING,
        stage="downloading",
        message=f"Starting batch download for {total} tracks...",
        percent=0.0,
    )

    completed_count = 0
    failed_count = 0

    for idx, child_id in enumerate(child_ids):
        # Check parent cancellation
        parent = await job_manager.get_job(parent_job_id)
        if not parent or parent.cancellation_requested or parent.status == JobStatus.CANCELLED:
            logger.info(f"Playlist {parent_job_id} cancelled by user. Terminating remaining tracks.")
            # Cancel all subsequent child jobs
            for remaining_id in child_ids[idx:]:
                await job_manager.cancel_job(remaining_id)
            break

        child = await job_manager.get_job(child_id)
        if not child:
            continue

        # Update parent progress
        parent_percent = round((idx / total) * 100.0, 1)
        async with job_manager._lock:
            parent.playlist_current_track_index = idx + 1
            parent.playlist_current_track_title = child.title
            parent.playlist_completed_tracks = completed_count
            parent.playlist_failed_tracks = failed_count
            parent.percent = parent_percent

        await job_manager.update_job_progress(
            job_id=parent_job_id,
            status=JobStatus.DOWNLOADING,
            stage="downloading",
            message=f"Processing track {idx + 1} of {total}: {child.title}",
            percent=parent_percent,
            extra={
                "current_track_index": idx + 1,
                "current_track_title": child.title,
                "completed_tracks": completed_count,
                "failed_tracks": failed_count,
            },
        )

        # Enqueue and await child job completion under the semaphore
        try:
            async with job_manager.semaphore:
                await execute_download_job(child_id)

            # Re-read child status
            updated_child = await job_manager.get_job(child_id)
            if updated_child and updated_child.status == JobStatus.READY:
                completed_count += 1
            else:
                failed_count += 1
        except Exception as exc:
            logger.error(f"Error processing playlist track {child_id}: {exc}")
            failed_count += 1

    # Finalize parent status
    parent = await job_manager.get_job(parent_job_id)
    if parent and not parent.cancellation_requested:
        final_status = JobStatus.COMPLETED if failed_count == 0 else JobStatus.READY
        async with job_manager._lock:
            parent.status = final_status
            parent.playlist_completed_tracks = completed_count
            parent.playlist_failed_tracks = failed_count
            parent.percent = 100.0
            parent.completed_at = time.time()
            parent.current_stage = "completed"
            parent.current_message = f"Batch download finished: {completed_count} completed, {failed_count} failed."

        await job_manager.update_job_progress(
            job_id=parent_job_id,
            status=final_status,
            stage="completed",
            message=parent.current_message,
            percent=100.0,
            extra={
                "completed_tracks": completed_count,
                "failed_tracks": failed_count,
            },
        )

