import asyncio
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from discover_service import discover_engine, extract_best_thumbnail
from media_service import _sync_download
from stream_service import get_direct_stream_info


class TestE2EFixes(unittest.TestCase):
    def test_extract_best_thumbnail(self):
        # 1. From list of dicts (like ytmusicapi watch_playlist)
        thumb_list = [
            {"url": "https://i.ytimg.com/vi/abc/small.jpg", "width": 60, "height": 60},
            {"url": "https://i.ytimg.com/vi/abc/large.jpg", "width": 400, "height": 225},
        ]
        self.assertEqual(extract_best_thumbnail(thumb_list, "abc"), "https://i.ytimg.com/vi/abc/large.jpg")

        # 2. From single dict
        self.assertEqual(extract_best_thumbnail({"url": "https://example.com/thumb.jpg"}, "xyz"), "https://example.com/thumb.jpg")

        # 3. From string
        self.assertEqual(extract_best_thumbnail("https://example.com/pic.jpg", "xyz"), "https://example.com/pic.jpg")

        # 4. Fallback from video_id
        self.assertEqual(extract_best_thumbnail([], "dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")

    def test_discover_seed_url_and_thumbnail(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            seed = loop.run_until_complete(discover_engine.resolve_seed("After Hours The Weeknd"))
            self.assertTrue(seed["url"].startswith("https://www.youtube.com/watch?v="))
            self.assertNotEqual(seed["url"], "https://www.youtube.com/watch?v=video_id")
            self.assertIsInstance(seed["thumbnail"], str)
            self.assertTrue(seed["thumbnail"].startswith("http"), f"Thumbnail should be valid URL string: {seed['thumbnail']}")
        finally:
            loop.close()

    def test_discover_recommendations_thumbnails(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            seed = {"id": "4Z9mUjtFJYY", "title": "After Hours", "artist": "The Weeknd", "url": "https://www.youtube.com/watch?v=4Z9mUjtFJYY"}
            recs = loop.run_until_complete(
                discover_engine.get_recommendations(seed, category="hidden_gems", limit=5)
            )
            self.assertTrue(len(recs) > 0)
            for r in recs:
                self.assertIsInstance(r["thumbnail"], str, f"Thumbnail must be string, got: {type(r['thumbnail'])}")
                self.assertTrue(r["thumbnail"].startswith("http"), f"Thumbnail must start with http: {r['thumbnail']}")
                self.assertTrue(r["url"].startswith("https://www.youtube.com/watch?v="))
        finally:
            loop.close()

    def test_stream_preview_direct_url_status(self):
        import requests
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            direct_url, mime, size, headers = loop.run_until_complete(
                get_direct_stream_info("https://www.youtube.com/watch?v=6VQn2fnXOAs", "audio")
            )
            self.assertTrue(direct_url.startswith("http"))
            self.assertIn("audio", mime)

            # Test Range request
            req_headers = dict(headers)
            req_headers["Range"] = "bytes=0-1024"
            r = requests.get(direct_url, headers=req_headers, stream=True, timeout=10)
            self.assertIn(r.status_code, (200, 206), f"Stream should return 200 or 206, got {r.status_code}")
        finally:
            loop.close()

    def test_media_download_no_403(self):
        with tempfile.TemporaryDirectory() as td:
            workdir = Path(td)
            # Test downloading audio on the track that previously threw 403
            final_file, title = _sync_download(
                "https://www.youtube.com/watch?v=6VQn2fnXOAs",
                "mp3",
                "192",
                workdir,
            )
            self.assertTrue(final_file.exists())
            self.assertTrue(final_file.stat().st_size > 10000)
            self.assertEqual(final_file.suffix.lower(), ".mp3")


if __name__ == "__main__":
    unittest.main()
