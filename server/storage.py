import asyncio
import logging
import os
import secrets
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from config import (
    MEDIA_CLEANUP_INTERVAL_SECONDS,
    MEDIA_MAX_CONCURRENT_JOBS,
    MEDIA_TEMP_ROOT,
    MEDIA_TEMP_TTL_SECONDS,
)
from resilience import ensure_temp_storage

logger = logging.getLogger("banana.storage")


@dataclass
class PreparedJob:
    job_id: str
    token: str
    workdir: Path
    filepath: Path
    filename: str
    media_type: str
    filesize: int
    created_at: float
    expires_at: float
    active_transfers: int = 0
    completed: bool = False


class MediaStorageManager:
    def __init__(self):
        self.temp_root = MEDIA_TEMP_ROOT
        self.ttl_seconds = MEDIA_TEMP_TTL_SECONDS
        self.cleanup_interval = MEDIA_CLEANUP_INTERVAL_SECONDS
        self.semaphore = asyncio.Semaphore(MEDIA_MAX_CONCURRENT_JOBS)
        self._jobs: Dict[str, PreparedJob] = {}
        self._tokens: Dict[str, PreparedJob] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    def initialize(self) -> None:
        """Create the temporary root if missing, ensure writability, and perform startup cleanup."""
        try:
            self.temp_root = ensure_temp_storage(self.temp_root)
            logger.info(f"Initialized verified temporary root at: {self.temp_root}")
        except Exception as exc:
            logger.error(f"Error establishing temp root: {exc}")

        try:
            self.purge_orphaned_directories()
        except Exception as exc:
            logger.warning(f"Startup orphan purge warning: {exc}")

    def start_periodic_cleanup(self) -> None:
        """Start the background cleanup loop."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Background media cleanup task started.")

    async def stop_periodic_cleanup(self) -> None:
        """Gracefully stop the background cleanup loop and clean remaining jobs."""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        # Clean all registered jobs on shutdown
        async with self._lock:
            job_ids = list(self._jobs.keys())
            for jid in job_ids:
                self._delete_job_internal(jid, force=True)

    def create_job_directory(self) -> tuple[str, Path]:
        """Create a dedicated, isolated temporary directory for a new job."""
        job_id = str(uuid.uuid4())
        job_dir = (self.temp_root / f"job_{job_id}").resolve()

        # Path traversal guard
        if not self._is_safe_child(job_dir):
            raise RuntimeError(f"Unsafe directory path: {job_dir}")

        job_dir.mkdir(parents=True, exist_ok=False)
        return job_id, job_dir

    async def register_prepared_job(
        self,
        job_id: str,
        workdir: Path,
        filepath: Path,
        filename: str,
        media_type: str,
    ) -> PreparedJob:
        """Register a prepared media file and generate a short-lived opaque token."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        filesize = filepath.stat().st_size if filepath.exists() else 0

        job = PreparedJob(
            job_id=job_id,
            token=token,
            workdir=workdir,
            filepath=filepath,
            filename=filename,
            media_type=media_type,
            filesize=filesize,
            created_at=now,
            expires_at=now + self.ttl_seconds,
        )

        async with self._lock:
            self._jobs[job_id] = job
            self._tokens[token] = job

        return job

    async def get_by_token(self, token: str) -> Optional[PreparedJob]:
        """Retrieve a job by its opaque token, verifying expiration."""
        async with self._lock:
            job = self._tokens.get(token)
            if not job:
                return None
            if time.time() > job.expires_at:
                logger.info(f"Token {token[:8]}... expired.")
                return None
            return job

    async def increment_transfers(self, job_id: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.active_transfers += 1

    async def decrement_transfers(self, job_id: str, mark_completed: bool = False) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.active_transfers = max(0, job.active_transfers - 1)
                if mark_completed:
                    job.completed = True

                # If completed or transfer ended and no other active transfers, schedule cleanup
                if job.active_transfers == 0 and job.completed:
                    self._delete_job_internal(job_id, force=False)

    async def cleanup_job(self, job_id: str, force: bool = False) -> bool:
        async with self._lock:
            return self._delete_job_internal(job_id, force=force)

    def _delete_job_internal(self, job_id: str, force: bool = False) -> bool:
        job = self._jobs.get(job_id)
        if not job:
            return False

        if not force and job.active_transfers > 0:
            logger.info(f"Skipping cleanup for active job {job_id} ({job.active_transfers} transfers ongoing).")
            return False

        # Remove from registries
        self._jobs.pop(job_id, None)
        self._tokens.pop(job.token, None)

        # Remove folder on disk
        self._safe_rmtree(job.workdir)
        logger.info(f"Cleaned up job directory: {job.workdir}")
        return True

    def purge_orphaned_directories(self) -> None:
        """
        Scan temp_root for any leftover 'job_*', 'banana_*', or legacy directories.
        Invoked on startup and periodically for abandoned files.
        """
        if not self.temp_root.exists():
            return

        now = time.time()
        try:
            for item in self.temp_root.iterdir():
                if item.is_dir() and (item.name.startswith("job_") or item.name.startswith("banana_")):
                    # Check if this item is currently in active memory
                    job_id = item.name.replace("job_", "")
                    if job_id in self._jobs:
                        continue

                    # On startup or if modified > TTL seconds ago, delete
                    try:
                        mtime = item.stat().st_mtime
                        if now - mtime >= self.ttl_seconds or not self._jobs:
                            self._safe_rmtree(item)
                            logger.info(f"Purged orphaned directory: {item.name}")
                    except Exception as exc:
                        logger.warning(f"Failed to check/purge {item}: {exc}")
        except Exception as exc:
            logger.error(f"Error scanning temp directory for orphaned files: {exc}")

    async def _cleanup_loop(self) -> None:
        """Periodic background task enforcing media expiration and removing dead files."""
        while True:
            try:
                await asyncio.sleep(self.cleanup_interval)
                now = time.time()
                expired_job_ids = []

                async with self._lock:
                    for jid, job in self._jobs.items():
                        if now > job.expires_at and job.active_transfers == 0:
                            expired_job_ids.append(jid)

                    for jid in expired_job_ids:
                        self._delete_job_internal(jid, force=False)

                # Also sweep any orphaned files from crashed operations
                self.purge_orphaned_directories()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Unexpected error in media cleanup loop: {exc}")

    def _is_safe_child(self, path: Path) -> bool:
        """Ensure path is strictly inside temp_root to prevent path traversal."""
        try:
            resolved_root = self.temp_root.resolve()
            resolved_path = path.resolve()
            return resolved_path.is_relative_to(resolved_root) and resolved_path != resolved_root
        except (ValueError, AttributeError):
            # Fallback for python < 3.9 or OS path variations
            try:
                common = os.path.commonpath([str(self.temp_root.resolve()), str(path.resolve())])
                return common == str(self.temp_root.resolve()) and str(path.resolve()) != str(self.temp_root.resolve())
            except Exception:
                return False

    def _safe_rmtree(self, path: Path) -> None:
        """Safely delete directory ensuring it is strictly inside temp_root."""
        if not path.exists():
            return

        if not self._is_safe_child(path):
            logger.error(f"Refusing to delete unsafe path outside temp root: {path}")
            return

        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception as exc:
            logger.warning(f"Could not remove {path}: {exc}")

    @property
    def active_jobs_count(self) -> int:
        return len(self._jobs)


# Global instance
storage_manager = MediaStorageManager()

