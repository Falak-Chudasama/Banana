import os
import shutil
import tempfile
import unittest
from pathlib import Path

import requests
from config import BANANA_HOST, BANANA_PORT
from resilience import (
    ensure_ffmpeg_in_path,
    ensure_temp_storage,
    is_service_responding,
    resolve_resilient_bind,
    test_socket_bind,
)


class TestServerResilience(unittest.TestCase):
    def test_ensure_temp_storage_valid(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            target = Path(tmp_dir) / "sub_target"
            result = ensure_temp_storage(target)
            self.assertTrue(result.exists())
            self.assertTrue(result.is_dir())

    def test_ensure_temp_storage_unwritable_fallback(self):
        # Point to a path that cannot be created as a directory (e.g. child of a file)
        with tempfile.NamedTemporaryFile() as tmp_file:
            impossible_path = Path(tmp_file.name) / "cannot_create_dir"
            fallback_dir = ensure_temp_storage(impossible_path)
            self.assertTrue(fallback_dir.exists())
            self.assertTrue(fallback_dir.is_dir())

    def test_ffmpeg_discovery(self):
        result = ensure_ffmpeg_in_path()
        # Should return a valid string path if found on system
        if shutil.which("ffmpeg"):
            self.assertIsNotNone(result)
            self.assertTrue(Path(result).exists())

    def test_socket_bind_check(self):
        # Port 0 on 127.0.0.1 is always bindable
        self.assertTrue(test_socket_bind("127.0.0.1", 0))

    def test_resolve_resilient_bind(self):
        host, port = resolve_resilient_bind("127.0.0.1", 0)
        self.assertIn(host, ["127.0.0.1", "0.0.0.0", "localhost"])

    def test_active_service_and_endpoints(self):
        # If server is running on 127.0.0.3:6060, test endpoints & CORS
        base_url = f"http://{BANANA_HOST}:{BANANA_PORT}"
        if not is_service_responding(BANANA_HOST, BANANA_PORT):
            self.skipTest(f"Server is not running at {base_url}")

        # 1. Test /health
        health_resp = requests.get(f"{base_url}/health", timeout=3)
        self.assertEqual(health_resp.status_code, 200)
        self.assertTrue(health_resp.json().get("ok"))

        # 2. Test /diagnostics
        diag_resp = requests.get(f"{base_url}/diagnostics", timeout=3)
        self.assertEqual(diag_resp.status_code, 200)
        diag_data = diag_resp.json()
        self.assertTrue(diag_data.get("ok"))
        self.assertIn("storage", diag_data)
        self.assertIn("ffmpeg", diag_data)

        # 3. Test universal CORS loopback
        origins = [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.3:6050",
            "http://127.0.0.1:8080",
        ]
        for origin in origins:
            cors_resp = requests.options(
                f"{base_url}/health",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
                timeout=3,
            )
            self.assertEqual(
                cors_resp.headers.get("access-control-allow-origin"),
                origin,
                f"CORS header not matching for {origin}",
            )


if __name__ == "__main__":
    unittest.main()
