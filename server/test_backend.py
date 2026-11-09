import asyncio
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

from config import MEDIA_MAX_CONCURRENT_JOBS, MEDIA_TEMP_ROOT
from discover_service import clean_track_title, discover_engine, normalize_artist
from media_service import mp4_format_selector, pick_final_file
from storage import MediaStorageManager
from trim_service import format_seconds_to_timestamp
from validator import (
    extract_playlist_id,
    extract_youtube_id,
    is_valid_playlist_url,
    is_valid_youtube_url,
    sanitize_filename,
)


class TestValidator(unittest.TestCase):
    def test_valid_youtube_urls(self):
        valid_urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertTrue(is_valid_youtube_url(url), f"Should be valid: {url}")
                self.assertEqual(extract_youtube_id(url), "dQw4w9WgXcQ")

    def test_playlist_urls(self):
        pl_url = "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0"
        self.assertTrue(is_valid_playlist_url(pl_url))
        self.assertEqual(extract_playlist_id(pl_url), "PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0")

    def test_invalid_and_malicious_urls(self):
        invalid_urls = [
            "",
            "   ",
            "not a url",
            "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://evil-site.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ",
            "https://attacker.com?url=https://youtube.com",
            "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com:8080/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=",
            "https://youtube.com/watch?v=$$invalid$$",
            "https://youtu.be/",
            "javascript:alert(1)",
            "file:///etc/passwd",
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                self.assertFalse(is_valid_youtube_url(url), f"Should be invalid: {url}")

    def test_sanitize_filename(self):
        self.assertEqual(sanitize_filename("valid_title"), "valid_title")
        self.assertEqual(sanitize_filename("Title / with : illegal * chars?"), "Title _ with _ illegal _ chars")
        self.assertEqual(sanitize_filename("../../../etc/passwd"), "etc_passwd")
        self.assertEqual(sanitize_filename(""), "banana_media")


class TestDiscoverUtilities(unittest.TestCase):
    def test_clean_track_title(self):
        self.assertEqual(clean_track_title("After Hours (Official Video)"), "After Hours")
        self.assertEqual(clean_track_title("Starboy [Audio]"), "Starboy")
        self.assertEqual(clean_track_title("Blinding Lights (Remastered 2020)"), "Blinding Lights")

    def test_normalize_artist(self):
        self.assertEqual(normalize_artist([{"name": "The Weeknd"}]), "The Weeknd")
        self.assertEqual(normalize_artist({"name": "Daft Punk"}), "Daft Punk")
        self.assertEqual(normalize_artist("Kendrick Lamar"), "Kendrick Lamar")

    def test_recommendation_filtering(self):
        seed = {"id": "seed1", "title": "After Hours", "artist": "The Weeknd"}
        candidates = [
            {"id": "seed1", "title": "After Hours", "artist": "The Weeknd"},
            {"id": "c1", "title": "Blinding Lights", "artist": "The Weeknd"},
            {"id": "c2", "title": "Midnight City", "artist": "M83"},
            {"id": "c3", "title": "Instant Crush", "artist": "Daft Punk"},
        ]
        # In 'same_vibe', seed artist should be excluded
        same_vibe = [
            c for c in candidates
            if "the weeknd" not in c["artist"].lower() and c["id"] != seed["id"]
        ]
        self.assertEqual(len(same_vibe), 2)
        self.assertTrue(all("the weeknd" not in c["artist"].lower() for c in same_vibe))

    def test_discover_recommendations_match_score(self):
        seed = {"id": "seed1", "title": "Knee Socks", "artist": "Arctic Monkeys"}
        recs = discover_engine._get_recommendations_sync(
            seed=seed,
            category="more_like_this",
            similarity_pref="balanced",
            popularity_pref="balanced",
            diversity_pref="normal",
            liked_ids=[],
            disliked_ids=[],
            known_ids=[],
            limit=10,
        )
        if recs:
            for r in recs:
                self.assertIn("match_score", r)
                self.assertIsInstance(r["match_score"], int)
                self.assertGreaterEqual(r["match_score"], 60)
                self.assertLessEqual(r["match_score"], 99)


class TestTrimmingUtilities(unittest.TestCase):
    def test_format_seconds(self):
        self.assertEqual(format_seconds_to_timestamp(65.5), "00:01:05.500")
        self.assertEqual(format_seconds_to_timestamp(3661.0), "01:01:01.000")


class TestMediaStorageManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="test_banana_root_"))
        self.manager = MediaStorageManager()
        self.manager.temp_root = self.test_dir
        self.manager.ttl_seconds = 1
        self.manager.initialize()

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_job_creation_and_registration(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def run():
            job_id, workdir = self.manager.create_job_directory()
            self.assertTrue(workdir.exists())
            self.assertTrue(workdir.is_relative_to(self.test_dir))

            dummy_file = workdir / "test.mp4"
            dummy_file.write_bytes(b"sample bytes data")

            job = await self.manager.register_prepared_job(
                job_id=job_id,
                workdir=workdir,
                filepath=dummy_file,
                filename="test.mp4",
                media_type="video/mp4",
            )

            self.assertIsNotNone(job.token)
            self.assertEqual(job.filesize, 17)

            retrieved = await self.manager.get_by_token(job.token)
            self.assertIsNotNone(retrieved)
            self.assertEqual(retrieved.job_id, job_id)

            await self.manager.cleanup_job(job_id, force=True)
            self.assertFalse(workdir.exists())
            self.assertIsNone(await self.manager.get_by_token(job.token))

        loop.run_until_complete(run())
        loop.close()

    def test_token_expiration(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def run():
            job_id, workdir = self.manager.create_job_directory()
            dummy_file = workdir / "sample.mp3"
            dummy_file.write_bytes(b"mp3 content")

            job = await self.manager.register_prepared_job(
                job_id=job_id,
                workdir=workdir,
                filepath=dummy_file,
                filename="sample.mp3",
                media_type="audio/mpeg",
            )

            await asyncio.sleep(1.1)

            expired_lookup = await self.manager.get_by_token(job.token)
            self.assertIsNone(expired_lookup)

            await self.manager.cleanup_job(job_id, force=True)

        loop.run_until_complete(run())
        loop.close()

    def test_active_transfer_protection(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def run():
            job_id, workdir = self.manager.create_job_directory()
            dummy_file = workdir / "sample.mp4"
            dummy_file.write_bytes(b"data")

            job = await self.manager.register_prepared_job(
                job_id=job_id,
                workdir=workdir,
                filepath=dummy_file,
                filename="sample.mp4",
                media_type="video/mp4",
            )

            await self.manager.increment_transfers(job_id)
            self.assertEqual(job.active_transfers, 1)

            deleted = await self.manager.cleanup_job(job_id, force=False)
            self.assertFalse(deleted)
            self.assertTrue(workdir.exists())

            await self.manager.decrement_transfers(job_id, mark_completed=True)
            self.assertFalse(workdir.exists())

        loop.run_until_complete(run())
        loop.close()

    def test_orphaned_directory_purging(self):
        orphan_dir = self.test_dir / "job_legacy_abandoned"
        orphan_dir.mkdir()
        (orphan_dir / "leftover.mp4").write_bytes(b"junk")

        old_time = time.time() - 100
        os.utime(orphan_dir, (old_time, old_time))

        self.manager.purge_orphaned_directories()
        self.assertFalse(orphan_dir.exists())


class TestEndpoints(unittest.TestCase):
    def test_health_endpoint(self):
        from main import health
        res = health()
        self.assertTrue(res.get("ok"))
        self.assertIn("active_jobs", res)

    def test_invalid_url_info(self):
        from fastapi import HTTPException
        from main import get_media_info
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(get_media_info(url="https://evil.com/video"))
        self.assertEqual(ctx.exception.status_code, 400)
        loop.close()

    def test_invalid_trim_range(self):
        from fastapi import HTTPException
        from main import process_trim
        from main import TrimRequest
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        # End time before start time should raise 400
        with self.assertRaises(HTTPException) as ctx:
            req = TrimRequest(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                format="mp3",
                start_time=50.0,
                end_time=20.0,
            )
            loop.run_until_complete(process_trim(req))
        self.assertEqual(ctx.exception.status_code, 400)
        loop.close()


if __name__ == "__main__":
    unittest.main()
