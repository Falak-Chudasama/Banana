import asyncio
import hashlib
import io
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from starlette.requests import Request

from config import MEDIA_MAX_CONCURRENT_JOBS
from download_service import handle_download_complete, handle_download_request
from job_types import ErrorCode, JobEvent, JobRecord, JobStatus, JobType
from jobs import JobManager, job_manager
from media_service import BananaProgressTracker, categorize_error
from stream_service import handle_preview_stream
from yt_dlp.utils import DownloadCancelled


async def execute_asgi_request(response, method: str = "GET", headers: list = None):
    """Execute Starlette Response through ASGI send to extract status, headers, and body."""
    raw_headers = []
    if headers:
        for k, v in headers:
            raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))

    scope = {
        "type": "http",
        "method": method,
        "headers": raw_headers,
    }

    messages = []
    async def send(msg):
        messages.append(msg)

    async def receive():
        # Keep connection open until body finishes streaming
        await asyncio.sleep(60.0)
        return {"type": "http.disconnect"}

    try:
        await response(scope, receive, send)
    except (asyncio.CancelledError, GeneratorExit):
        pass

    start_msg = next((m for m in messages if m["type"] == "http.response.start"), None)
    status_code = start_msg["status"] if start_msg else 500
    res_headers = {}
    if start_msg:
        for k, v in start_msg.get("headers", []):
            res_headers[k.decode("latin-1").lower()] = v.decode("latin-1")

    body_chunks = [m.get("body", b"") for m in messages if m["type"] == "http.response.body"]
    body = b"".join(body_chunks)

    return status_code, res_headers, body


class TestJobLifecycleAndQueue(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="banana_test_jobs_")
        self.mgr = JobManager()
        self.mgr.temp_root = Path(self.tmp_dir)
        self.mgr.initialize(loop=asyncio.get_running_loop())

    async def asyncTearDown(self):
        await self.mgr.shutdown()
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    async def test_job_creation(self):
        job = await self.mgr.create_job(
            job_type=JobType.DOWNLOAD,
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            format="mp4",
            quality="1080p",
            title="Test Video",
        )
        self.assertEqual(job.status, JobStatus.CREATED)
        self.assertEqual(job.title, "Test Video")
        self.assertTrue(Path(self.mgr.get_workdir(job.job_id)).exists())

    async def test_job_queue_and_concurrency_execution(self):
        executed_jobs = []
        barrier = asyncio.Event()

        async def worker_fn(job_id: str):
            executed_jobs.append(job_id)
            await barrier.wait()

        # Enqueue 2 jobs
        j1 = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/test1")
        j2 = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/test2")

        await self.mgr.enqueue_execution(j1.job_id, worker_fn)
        await self.mgr.enqueue_execution(j2.job_id, worker_fn)

        await asyncio.sleep(0.05)
        self.assertIn(j1.job_id, executed_jobs)
        self.assertIn(j2.job_id, executed_jobs)

        barrier.set()
        await asyncio.sleep(0.05)

    async def test_job_cancellation_while_queued(self):
        j = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/test_cancel")
        self.assertEqual(j.status, JobStatus.CREATED)

        cancelled = await self.mgr.cancel_job(j.job_id)
        self.assertTrue(cancelled)

        updated = await self.mgr.get_job(j.job_id)
        self.assertTrue(updated is None or updated.status == JobStatus.CANCELLED)

    async def test_job_retry(self):
        j = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/test_retry")
        await self.mgr.fail_job(j.job_id, ErrorCode.NETWORK_TIMEOUT, "Connection timeout")

        failed_job = await self.mgr.get_job(j.job_id)
        self.assertEqual(failed_job.status, JobStatus.FAILED)

        executed = []
        async def dummy_worker(job_id):
            executed.append(job_id)

        retried = await self.mgr.retry_job(j.job_id, dummy_worker)
        self.assertIsNotNone(retried)
        self.assertEqual(retried.status, JobStatus.QUEUED)
        await asyncio.sleep(0.05)
        self.assertIn(j.job_id, executed)


class TestProgressHooksAndTracking(unittest.TestCase):
    def setUp(self):
        self.mgr = job_manager

    def test_progress_hook_percent_calculation(self):
        tracker = BananaProgressTracker("dummy_job_id")
        tracker.throttle_interval = 0.0

        dispatched = []
        with patch.object(self.mgr, "dispatch_from_thread", side_effect=lambda **kw: dispatched.append(kw)):
            # 1. Total bytes known
            tracker.progress_hook({
                "status": "downloading",
                "downloaded_bytes": 50000,
                "total_bytes": 100000,
                "speed": 10240,
                "eta": 5,
            })
            self.assertEqual(len(dispatched), 1)
            self.assertEqual(dispatched[0]["percent"], 50.0)
            self.assertFalse(dispatched[0]["is_estimated"])

            # 2. Total bytes estimated
            dispatched.clear()
            tracker.progress_hook({
                "status": "downloading",
                "downloaded_bytes": 25000,
                "total_bytes_estimate": 100000,
                "speed": 5000,
            })
            self.assertEqual(len(dispatched), 1)
            self.assertEqual(dispatched[0]["percent"], 25.0)
            self.assertTrue(dispatched[0]["is_estimated"])

            # 3. Indeterminate
            dispatched.clear()
            tracker.progress_hook({
                "status": "downloading",
                "downloaded_bytes": 12000,
            })
            self.assertEqual(len(dispatched), 1)
            self.assertIsNone(dispatched[0]["percent"])

    def test_progress_hook_cancellation_check(self):
        tracker = BananaProgressTracker("cancelled_job")
        mock_job = MagicMock()
        mock_job.cancellation_requested = True

        with patch.object(self.mgr, "get_job_sync", return_value=mock_job):
            with self.assertRaises(DownloadCancelled):
                tracker.progress_hook({"status": "downloading", "downloaded_bytes": 10})

    def test_postprocessor_hook_messages(self):
        tracker = BananaProgressTracker("pp_job")
        dispatched = []
        with patch.object(self.mgr, "dispatch_from_thread", side_effect=lambda **kw: dispatched.append(kw)):
            with patch.object(self.mgr, "get_job_sync", return_value=MagicMock(cancellation_requested=False)):
                tracker.postprocessor_hook({"status": "started", "postprocessor": "FFmpegExtractAudio"})
                self.assertEqual(len(dispatched), 1)
                self.assertIn("FFmpeg", dispatched[0]["message"])
                self.assertEqual(dispatched[0]["status"], JobStatus.POST_PROCESSING)


class TestSSEAndDeliveryAPI(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="banana_test_sse_")
        self.mgr = job_manager
        self.mgr.temp_root = Path(self.tmp_dir)

    async def asyncTearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    async def test_sse_event_subscription_and_reconnection(self):
        job = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/sse_test")

        for p in [10.0, 20.0, 30.0]:
            await self.mgr.update_job_progress(
                job.job_id,
                status=JobStatus.DOWNLOADING,
                stage="downloading",
                message=f"Progress {p}%",
                percent=p,
                downloaded_bytes=int(p * 1000),
            )

        q, replayed = await self.mgr.subscribe_events(job.job_id, last_event_id=1)
        self.assertTrue(len(replayed) >= 2)
        await self.mgr.unsubscribe_events(job.job_id, q)

    async def test_file_transfer_integrity_and_range_requests(self):
        # Create a 64 KB binary fixture with known hash
        fixture_bytes = os.urandom(65536)
        expected_sha256 = hashlib.sha256(fixture_bytes).hexdigest()

        job = await self.mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/integrity_test")
        workdir = self.mgr.get_workdir(job.job_id)
        final_file = workdir / "test_media.mp4"
        with open(final_file, "wb") as f:
            f.write(fixture_bytes)

        ready_job = await self.mgr.set_job_ready(
            job.job_id,
            final_filepath=final_file,
            output_filename="test_media.mp4",
            content_type="video/mp4",
            filesize=len(fixture_bytes),
        )
        token = ready_job.download_token
        self.assertIsNotNone(token)

        # 1. Test HEAD request
        head_scope = {"type": "http", "method": "HEAD", "headers": []}
        head_req = Request(head_scope)
        head_resp = await handle_download_request(token, head_req)
        status, headers, body = await execute_asgi_request(head_resp, method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("content-length"), str(len(fixture_bytes)))
        self.assertEqual(headers.get("accept-ranges"), "bytes")
        self.assertEqual(len(body), 0)

        # 2. Test full GET download
        get_scope = {"type": "http", "method": "GET", "headers": []}
        get_req = Request(get_scope)
        get_resp = await handle_download_request(token, get_req)
        status, headers, body = await execute_asgi_request(get_resp, method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(len(body), len(fixture_bytes))
        received_sha256 = hashlib.sha256(body).hexdigest()
        self.assertEqual(received_sha256, expected_sha256)

        # 3. Test HTTP Range request (206 Partial Content)
        range_headers = [("Range", "bytes=0-1023")]
        range_scope = {"type": "http", "method": "GET", "headers": [(b"range", b"bytes=0-1023")]}
        range_req = Request(range_scope)
        range_resp = await handle_download_request(token, range_req)
        status, headers, body = await execute_asgi_request(range_resp, method="GET", headers=range_headers)
        self.assertEqual(status, 206)
        self.assertEqual(len(body), 1024)
        self.assertEqual(body, fixture_bytes[:1024])
        self.assertEqual(headers.get("content-range"), f"bytes 0-1023/{len(fixture_bytes)}")

        # 4. Test HTTP 416 Unsatisfiable Range
        oob_headers = [("Range", "bytes=100000-200000")]
        oob_scope = {"type": "http", "method": "GET", "headers": [(b"range", b"bytes=100000-200000")]}
        oob_req = Request(oob_scope)
        oob_resp = await handle_download_request(token, oob_req)
        status, headers, body = await execute_asgi_request(oob_resp, method="GET", headers=oob_headers)
        self.assertEqual(status, 416)

        # 5. Token is NOT destroyed on first GET (can download again)
        second_resp = await handle_download_request(token, get_req)
        status2, _, body2 = await execute_asgi_request(second_resp, method="GET")
        self.assertEqual(status2, 200)

        # 6. Test completion acknowledgment
        comp_res = await handle_download_complete(token)
        self.assertTrue(comp_res.get("ok"))


class TestScavengerAndSafety(unittest.IsolatedAsyncioTestCase):
    async def test_scavenger_skips_active_transfers(self):
        mgr = JobManager()
        with tempfile.TemporaryDirectory() as td:
            mgr.temp_root = Path(td)
            job = await mgr.create_job(JobType.DOWNLOAD, "https://youtu.be/scav_test")
            job.expires_at = time.time() - 100.0  # Already expired
            job.active_transfers = 1  # But transfer in progress!

            # Scavenge cleanup should skip
            deleted = mgr._delete_job_internal(job.job_id, force=False)
            self.assertFalse(deleted)
            self.assertIsNotNone(await mgr.get_job(job.job_id))

            # When transfers finish, deletion succeeds
            job.active_transfers = 0
            deleted = mgr._delete_job_internal(job.job_id, force=False)
            self.assertTrue(deleted)


class TestPlaylistOrchestration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="banana_test_pl_")
        self.mgr = job_manager
        self.mgr.temp_root = Path(self.tmp_dir)

    async def asyncTearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    async def test_playlist_parent_and_child_creation(self):
        mock_playlist_data = {
            "title": "Album Playlist",
            "uploader": "Awesome Artist",
            "tracks": [
                {"id": "t1", "title": "Track 1", "artist": "Artist", "duration": 180, "url": "https://youtu.be/t1"},
                {"id": "t2", "title": "Track 2", "artist": "Artist", "duration": 200, "url": "https://youtu.be/t2"},
                {"id": "t3", "title": "Track 3", "artist": "Artist", "duration": 220, "url": "https://youtu.be/t3"},
            ],
        }

        with patch("playlist_jobs.extract_playlist_async", return_value=mock_playlist_data):
            with patch("playlist_jobs.run_playlist_orchestrator", return_value=None):
                from playlist_jobs import create_playlist_job
                parent = await create_playlist_job(
                    "https://www.youtube.com/playlist?list=PLtest",
                    format="mp3",
                    quality="best",
                    track_ids=["t1", "t3"],
                )
                self.assertEqual(parent.job_type, JobType.PLAYLIST_PARENT)
                self.assertEqual(parent.playlist_total_tracks, 2)
                self.assertEqual(len(parent.child_job_ids), 2)

                # Check children exist
                c1 = await self.mgr.get_job(parent.child_job_ids[0])
                c2 = await self.mgr.get_job(parent.child_job_ids[1])
                self.assertIsNotNone(c1)
                self.assertIsNotNone(c2)
                self.assertEqual(c1.parent_job_id, parent.job_id)
                self.assertEqual(c1.title, "Track 1")
                self.assertEqual(c2.title, "Track 3")


class TestStreamPreview(unittest.IsolatedAsyncioTestCase):
    async def test_preview_stream_range_206(self):
        mock_upstream = MagicMock()
        mock_upstream.status_code = 206
        mock_upstream.headers = {
            "Content-Type": "audio/mp4",
            "Content-Range": "bytes 0-1023/50000",
            "Content-Length": "1024",
            "Accept-Ranges": "bytes",
        }
        mock_upstream.iter_content.return_value = [b"A" * 1024]

        req_scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=0-1023")],
        }
        req = Request(req_scope)

        with patch("stream_service.get_direct_stream_info", return_value=("http://cdn.test/audio", "audio/mp4", 50000, {})):
            with patch("requests.get", return_value=mock_upstream):
                resp = await handle_preview_stream("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "audio", req)
                status, headers, body = await execute_asgi_request(resp, method="GET")
                self.assertEqual(status, 206)
                self.assertEqual(headers.get("content-range"), "bytes 0-1023/50000")
                self.assertEqual(len(body), 1024)

    async def test_preview_stream_416_out_of_bounds(self):
        mock_upstream = MagicMock()
        mock_upstream.status_code = 416
        mock_upstream.headers = {"Content-Range": "bytes */50000"}

        req_scope = {
            "type": "http",
            "method": "GET",
            "headers": [(b"range", b"bytes=90000-100000")],
        }
        req = Request(req_scope)

        with patch("stream_service.get_direct_stream_info", return_value=("http://cdn.test/audio", "audio/mp4", 50000, {})):
            with patch("requests.get", return_value=mock_upstream):
                resp = await handle_preview_stream("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "audio", req)
                status, headers, _ = await execute_asgi_request(resp, method="GET")
                self.assertEqual(status, 416)
                self.assertEqual(headers.get("content-range"), "bytes */50000")


if __name__ == "__main__":
    unittest.main()
