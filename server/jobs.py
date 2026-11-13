import asyncio
import logging
import os
import secrets
import shutil
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Set, Tuple

from config import (
    MEDIA_CLEANUP_INTERVAL_SECONDS,
    MEDIA_MAX_CONCURRENT_JOBS,
    MEDIA_TEMP_ROOT,
    MEDIA_TEMP_TTL_SECONDS,
)
from job_types import ErrorCode, JobEvent, JobRecord, JobStatus, JobType
from resilience import ensure_temp_storage

logger = logging.getLogger("banana.jobs")

MAX_EVENT_HISTORY_PER_JOB = 50


class JobManager:
    def __init__(self):
        self.temp_root = MEDIA_TEMP_ROOT
        self.ttl_seconds = MEDIA_TEMP_TTL_SECONDS
        self.cleanup_interval = MEDIA_CLEANUP_INTERVAL_SECONDS
        self.max_concurrent_jobs = MEDIA_MAX_CONCURRENT_JOBS

        # Concurrency semaphore
        self.semaphore = asyncio.Semaphore(self.max_concurrent_jobs)

        # Internal state
        self._jobs: Dict[str, JobRecord] = {}
        self._tokens: Dict[str, str] = {}  # token -> job_id
        self._job_paths: Dict[str, Tuple[Path, Optional[Path]]] = {}  # job_id -> (workdir, filepath)

        # SSE Event distribution
        self._event_counter = 0
        self._event_histories: Dict[str, Deque[JobEvent]] = {}
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}

        # Worker queue for queued jobs
        self._execution_queue: asyncio.Queue[Tuple[str, Callable]] = asyncio.Queue()
        self._worker_tasks: List[asyncio.Task] = []
        self._cleanup_task: Optional[asyncio.Task] = None

        self._lock = asyncio.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def initialize(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Initialize temp directory and background workers."""
        self._loop = loop or asyncio.get_event_loop()
        try:
            self.temp_root = ensure_temp_storage(self.temp_root)
            logger.info(f"JobManager initialized with verified temp root: {self.temp_root}")
        except Exception as exc:
            logger.error(f"Error establishing temp root for JobManager: {exc}")

        # Purge legacy orphaned directories from prior sessions
        self._purge_orphans_on_disk()

        # Start background workers for concurrency queue
        for i in range(self.max_concurrent_jobs):
            worker_task = asyncio.create_task(self._queue_worker_loop(i))
            self._worker_tasks.append(worker_task)

        # Start periodic scavenger task
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._scavenger_loop())

        logger.info(f"JobManager workers started (concurrency={self.max_concurrent_jobs}).")

    async def shutdown(self) -> None:
        """Gracefully stop queue workers, scavenger, and clean up active jobs."""
        logger.info("JobManager shutting down...")

        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        for wt in self._worker_tasks:
            if not wt.done():
                wt.cancel()
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
            self._worker_tasks.clear()

        # Clean all registered jobs
        async with self._lock:
            job_ids = list(self._jobs.keys())
            for jid in job_ids:
                self._delete_job_internal(jid, force=True)

        logger.info("JobManager shutdown complete.")

    def _is_safe_child(self, path: Path) -> bool:
        """Path traversal defense: verify path is strict descendant of temp_root."""
        try:
            resolved = path.resolve()
            root_res = self.temp_root.resolve()
            return root_res in resolved.parents or resolved == root_res
        except Exception:
            return False

    def _purge_orphans_on_disk(self) -> None:
        """Purge stale job directories left from ungraceful shutdowns."""
        if not self.temp_root.exists():
            return
        try:
            for item in self.temp_root.iterdir():
                if item.is_dir() and item.name.startswith("job_"):
                    try:
                        shutil.rmtree(item, ignore_errors=True)
                        logger.info(f"Purged orphan directory on startup: {item.name}")
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning(f"Orphan purge warning: {exc}")

    def create_job_directory(self) -> Tuple[str, Path]:
        """Create a dedicated, isolated temporary directory for a new job."""
        job_id = str(uuid.uuid4())
        job_dir = (self.temp_root / f"job_{job_id}").resolve()

        if not self._is_safe_child(job_dir):
            raise RuntimeError(f"Unsafe directory path: {job_dir}")

        job_dir.mkdir(parents=True, exist_ok=False)
        return job_id, job_dir

    async def create_job(
        self,
        job_type: JobType,
        url: str,
        format: str = "mp4",
        quality: str = "best",
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        parent_job_id: Optional[str] = None,
        title: str = "Preparing media...",
        uploader: Optional[str] = None,
        thumbnail: Optional[str] = None,
        duration: Optional[float] = None,
    ) -> JobRecord:
        """Register and persist a new job in memory."""
        job_id, workdir = self.create_job_directory()

        now = time.time()
        job = JobRecord(
            job_id=job_id,
            job_type=job_type,
            status=JobStatus.CREATED,
            parent_job_id=parent_job_id,
            url=url,
            format=format,
            quality=quality,
            start_time=start_time,
            end_time=end_time,
            title=title,
            uploader=uploader,
            thumbnail=thumbnail,
            duration=duration,
            created_at=now,
            updated_at=now,
            expires_at=now + self.ttl_seconds,
            current_stage="created",
            current_message="Job created",
        )

        async with self._lock:
            self._jobs[job_id] = job
            self._job_paths[job_id] = (workdir, None)
            self._event_histories[job_id] = deque(maxlen=MAX_EVENT_HISTORY_PER_JOB)
            self._subscribers[job_id] = set()

            if parent_job_id and parent_job_id in self._jobs:
                self._jobs[parent_job_id].child_job_ids.append(job_id)

        await self._publish_event(
            job_id=job_id,
            event_type="job_created",
            status=JobStatus.CREATED,
            stage="created",
            message="Job created successfully",
        )
        return job

    async def enqueue_execution(self, job_id: str, execute_fn: Callable) -> None:
        """Mark job as QUEUED and place it into the concurrency execution queue."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = JobStatus.QUEUED
            job.current_stage = "queued"
            job.current_message = "Waiting for an available download slot..."
            job.updated_at = time.time()

        await self._publish_event(
            job_id=job_id,
            event_type="queued",
            status=JobStatus.QUEUED,
            stage="queued",
            message="Waiting for an available download slot...",
        )
        await self._execution_queue.put((job_id, execute_fn))

    async def _queue_worker_loop(self, worker_id: int) -> None:
        """Background worker that executes queued jobs under the semaphore."""
        while True:
            try:
                job_id, execute_fn = await self._execution_queue.get()
            except asyncio.CancelledError:
                break
            except Exception:
                continue

            # Check if job was cancelled while waiting in queue
            job = await self.get_job(job_id)
            if not job or job.cancellation_requested or job.status == JobStatus.CANCELLED:
                self._execution_queue.task_done()
                continue

            try:
                async with self.semaphore:
                    # Double-check cancellation after acquiring semaphore
                    job = await self.get_job(job_id)
                    if not job or job.cancellation_requested or job.status == JobStatus.CANCELLED:
                        continue

                    await execute_fn(job_id)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Worker {worker_id} unexpected error processing {job_id}: {exc}", exc_info=True)
            finally:
                self._execution_queue.task_done()

    async def get_job(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def get_by_token(self, token: str) -> Optional[JobRecord]:
        async with self._lock:
            job_id = self._tokens.get(token)
            if not job_id:
                return None
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job.expires_at and time.time() > job.expires_at:
                logger.info(f"Token {token[:8]}... expired for job {job_id}")
                return None
            return job

    def get_job_sync(self, job_id: str) -> Optional[JobRecord]:
        """Synchronous job snapshot lookup for worker threads."""
        return self._jobs.get(job_id)

    def get_file_path(self, job_id: str) -> Optional[Path]:
        """Internal private lookup of file path on disk."""
        entry = self._job_paths.get(job_id)
        return entry[1] if entry else None

    def get_workdir(self, job_id: str) -> Optional[Path]:
        """Internal private lookup of workdir on disk."""
        entry = self._job_paths.get(job_id)
        return entry[0] if entry else None

    async def set_job_ready(
        self,
        job_id: str,
        final_filepath: Path,
        output_filename: str,
        content_type: str,
        filesize: int,
    ) -> JobRecord:
        """Mark job as READY and issue an opaque high-entropy download token."""
        token = secrets.token_urlsafe(32)
        now = time.time()

        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise ValueError(f"Job not found: {job_id}")

            workdir, _ = self._job_paths.get(job_id, (final_filepath.parent, None))
            self._job_paths[job_id] = (workdir, final_filepath)
            self._tokens[token] = job_id

            job.status = JobStatus.READY
            job.output_filename = output_filename
            job.output_extension = final_filepath.suffix.lstrip(".").lower()
            job.content_type = content_type
            job.output_size_bytes = filesize
            job.download_token = token
            job.current_stage = "ready"
            job.current_message = "Your file is ready."
            job.percent = 100.0
            job.is_estimated_percent = False
            job.updated_at = now
            job.completed_at = now
            job.expires_at = now + self.ttl_seconds

        await self._publish_event(
            job_id=job_id,
            event_type="ready",
            status=JobStatus.READY,
            stage="ready",
            percent=100.0,
            message="Your file is ready.",
            downloaded_bytes=filesize,
            total_bytes=filesize,
            extra={"token": token, "filename": output_filename, "filesize": filesize},
        )
        return job

    async def update_job_progress(
        self,
        job_id: str,
        status: JobStatus,
        stage: str,
        message: str,
        percent: Optional[float] = None,
        is_estimated: bool = False,
        downloaded_bytes: int = 0,
        total_bytes: Optional[int] = None,
        speed: Optional[float] = None,
        eta: Optional[int] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Update job metrics and publish progress event."""
        now = time.time()
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.status in (JobStatus.CANCELLED, JobStatus.COMPLETED, JobStatus.FAILED):
                return

            job.status = status
            job.current_stage = stage
            job.current_message = message
            job.updated_at = now

            if downloaded_bytes > 0:
                job.downloaded_bytes = downloaded_bytes
            if total_bytes is not None and total_bytes > 0:
                job.total_bytes = total_bytes
            if percent is not None:
                job.percent = percent
            job.is_estimated_percent = is_estimated
            if speed is not None:
                job.download_speed = speed
            if eta is not None:
                job.eta_seconds = eta

        await self._publish_event(
            job_id=job_id,
            event_type="progress" if status == JobStatus.DOWNLOADING else "stage_changed",
            status=status,
            stage=stage,
            percent=percent,
            is_estimated_percent=is_estimated,
            downloaded_bytes=downloaded_bytes,
            total_bytes=total_bytes,
            speed_bytes_per_second=speed,
            eta_seconds=eta,
            message=message,
            extra=extra,
        )

    def dispatch_from_thread(
        self,
        job_id: str,
        status: JobStatus,
        stage: str,
        message: str,
        percent: Optional[float] = None,
        is_estimated: bool = False,
        downloaded_bytes: int = 0,
        total_bytes: Optional[int] = None,
        speed: Optional[float] = None,
        eta: Optional[int] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Thread-safe event dispatcher for synchronous yt-dlp & FFmpeg worker threads."""
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.update_job_progress(
                    job_id=job_id,
                    status=status,
                    stage=stage,
                    message=message,
                    percent=percent,
                    is_estimated=is_estimated,
                    downloaded_bytes=downloaded_bytes,
                    total_bytes=total_bytes,
                    speed=speed,
                    eta=eta,
                    extra=extra,
                ),
                self._loop,
            )

    async def fail_job(
        self,
        job_id: str,
        error_code: ErrorCode,
        user_facing_error: str,
        technical_detail: Optional[str] = None,
    ) -> None:
        """Transition job to FAILED state and clean intermediate artifacts safely."""
        now = time.time()
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return

            job.status = JobStatus.FAILED
            job.current_stage = "failed"
            job.current_message = user_facing_error
            job.error_code = error_code
            job.user_facing_error = user_facing_error
            job.technical_error_reference = technical_detail
            job.updated_at = now

        await self._publish_event(
            job_id=job_id,
            event_type="failed",
            status=JobStatus.FAILED,
            stage="failed",
            message=user_facing_error,
            extra={"error_code": error_code.value, "detail": technical_detail},
        )

    async def cancel_job(self, job_id: str) -> bool:
        """Request cooperative cancellation for active or queued job."""
        now = time.time()
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status in (JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.FAILED):
                return False

            job.cancellation_requested = True
            was_queued = (job.status == JobStatus.QUEUED or job.status == JobStatus.CREATED)

            if was_queued:
                job.status = JobStatus.CANCELLED
                job.current_stage = "cancelled"
                job.current_message = "Download cancelled by user."
                job.updated_at = now

        if was_queued:
            await self._publish_event(
                job_id=job_id,
                event_type="cancelled",
                status=JobStatus.CANCELLED,
                stage="cancelled",
                message="Download cancelled by user.",
            )
            # Safe cleanup of empty workdir
            await self.cleanup_job(job_id, force=True)
        return True

    async def retry_job(self, job_id: str, execute_fn: Callable) -> Optional[JobRecord]:
        """Retry a previously failed or cancelled job."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None

            if job.status not in (JobStatus.FAILED, JobStatus.CANCELLED):
                return job

            job.status = JobStatus.CREATED
            job.cancellation_requested = False
            job.error_code = None
            job.user_facing_error = None
            job.technical_error_reference = None
            job.downloaded_bytes = 0
            job.percent = 0.0
            job.download_speed = None
            job.eta_seconds = None
            job.current_stage = "created"
            job.current_message = "Retrying job..."
            job.updated_at = time.time()

        await self.enqueue_execution(job_id, execute_fn)
        return job

    async def increment_transfers(self, job_id: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.active_transfers += 1
                job.transfer_attempt_count += 1
                job.status = JobStatus.TRANSFERRING
                job.current_stage = "transferring"
                job.current_message = "Transferring file to your device..."

    async def decrement_transfers(self, job_id: str, bytes_sent: int = 0) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.active_transfers = max(0, job.active_transfers - 1)
                if bytes_sent > 0:
                    job.transfer_bytes_sent += bytes_sent
                if job.active_transfers == 0 and job.status == JobStatus.TRANSFERRING:
                    # Restore ready status for retries or subsequent chunk transfers
                    job.status = JobStatus.READY
                    job.current_stage = "ready"
                    job.current_message = "Your file is ready."

    async def acknowledge_completion(self, token: str) -> bool:
        """Client-side acknowledgment that file was successfully written and closed."""
        now = time.time()
        async with self._lock:
            job_id = self._tokens.get(token)
            if not job_id:
                return False
            job = self._jobs.get(job_id)
            if not job:
                return False

            job.status = JobStatus.COMPLETED
            job.current_stage = "completed"
            job.current_message = "Download completed successfully."
            job.completed_at = now
            # Extend lease for 30s grace period then schedule cleanup
            job.expires_at = now + 30.0

        await self._publish_event(
            job_id=job_id,
            event_type="completed",
            status=JobStatus.COMPLETED,
            stage="completed",
            message="Download completed successfully.",
        )
        return True

    async def subscribe_events(self, job_id: str, last_event_id: Optional[int] = None) -> Tuple[asyncio.Queue, List[JobEvent]]:
        """Subscribe client to real-time SSE stream with replay of missed events."""
        queue: asyncio.Queue[JobEvent] = asyncio.Queue(maxsize=100)
        replayed: List[JobEvent] = []

        async with self._lock:
            if job_id not in self._subscribers:
                self._subscribers[job_id] = set()
            self._subscribers[job_id].add(queue)

            history = self._event_histories.get(job_id, deque())
            if last_event_id is not None:
                replayed = [e for e in history if e.event_id > last_event_id]
            elif history:
                # If fresh connect and has events, return the most recent snapshot
                replayed = [history[-1]]

        return queue, replayed

    async def unsubscribe_events(self, job_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(job_id)
            if subs:
                subs.discard(queue)
                if not subs:
                    self._subscribers.pop(job_id, None)

    async def _publish_event(
        self,
        job_id: str,
        event_type: str,
        status: JobStatus,
        stage: str,
        message: str,
        percent: Optional[float] = None,
        is_estimated_percent: bool = False,
        downloaded_bytes: int = 0,
        total_bytes: Optional[int] = None,
        speed_bytes_per_second: Optional[float] = None,
        eta_seconds: Optional[int] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._event_counter += 1
        event = JobEvent(
            event_id=self._event_counter,
            job_id=job_id,
            type=event_type,
            status=status,
            stage=stage,
            percent=percent,
            is_estimated_percent=is_estimated_percent,
            downloaded_bytes=downloaded_bytes,
            total_bytes=total_bytes,
            speed_bytes_per_second=speed_bytes_per_second,
            eta_seconds=eta_seconds,
            message=message,
            timestamp=time.time(),
            extra=extra,
        )

        async with self._lock:
            history = self._event_histories.get(job_id)
            if history is not None:
                history.append(event)

            subscribers = list(self._subscribers.get(job_id, set()))

        for sub_queue in subscribers:
            try:
                sub_queue.put_nowait(event)
            except asyncio.QueueFull:
                # If subscriber queue is full, drop oldest and push latest
                try:
                    sub_queue.get_nowait()
                    sub_queue.put_nowait(event)
                except Exception:
                    pass

    async def cleanup_job(self, job_id: str, force: bool = False) -> bool:
        async with self._lock:
            return self._delete_job_internal(job_id, force=force)

    def _delete_job_internal(self, job_id: str, force: bool = False) -> bool:
        """Internal deletion of temporary disk directory and records."""
        job = self._jobs.get(job_id)
        if not job and job_id not in self._job_paths:
            return False

        if job and job.active_transfers > 0 and not force:
            logger.info(f"Skipping cleanup for job {job_id} ({job.active_transfers} transfers ongoing).")
            return False

        path_entry = self._job_paths.pop(job_id, None)
        if path_entry:
            workdir, _ = path_entry
            if workdir and workdir.exists() and self._is_safe_child(workdir):
                try:
                    shutil.rmtree(workdir, ignore_errors=True)
                    logger.info(f"Cleaned up job directory: {workdir}")
                except Exception as exc:
                    logger.warning(f"Error removing workdir for {job_id}: {exc}")

        # Remove token mappings
        if job and job.download_token:
            self._tokens.pop(job.download_token, None)

        self._jobs.pop(job_id, None)
        self._event_histories.pop(job_id, None)
        self._subscribers.pop(job_id, None)
        return True

    async def _scavenger_loop(self) -> None:
        """Background scavenger that removes expired jobs and protects active transfers."""
        while True:
            try:
                await asyncio.sleep(self.cleanup_interval)
                now = time.time()
                to_delete: List[str] = []

                async with self._lock:
                    for job_id, job in self._jobs.items():
                        if job.active_transfers > 0:
                            continue
                        if job.expires_at and now > job.expires_at:
                            to_delete.append(job_id)
                        elif job.status in (JobStatus.FAILED, JobStatus.CANCELLED) and (now - job.updated_at) > 120.0:
                            to_delete.append(job_id)

                for jid in to_delete:
                    logger.info(f"Scavenger purging expired/cancelled job {jid}")
                    await self.cleanup_job(jid, force=False)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Error in scavenger loop: {exc}")

    @property
    def active_jobs_count(self) -> int:
        return sum(1 for j in self._jobs.values() if j.status in (JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.POST_PROCESSING, JobStatus.TRANSFERRING))


# Global singleton instance
job_manager = JobManager()

