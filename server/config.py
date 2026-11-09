import os
from pathlib import Path
from typing import List


def get_env_list(key: str, default: List[str]) -> List[str]:
    raw = os.getenv(key)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


# Host and Port
BANANA_HOST: str = os.getenv("BANANA_HOST", "127.0.0.3")
BANANA_PORT: int = int(os.getenv("BANANA_PORT", "6060"))

# Permitted CORS origins
BANANA_ALLOWED_ORIGINS: List[str] = get_env_list(
    "BANANA_ALLOWED_ORIGINS",
    [
        "https://banana.com",
        "http://banana.com",
        "https://api.banana.com",
        "http://api.banana.com",
        "http://127.0.0.3:6050",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://localhost:6050",
        "http://127.0.0.1:6050",
        "http://127.0.0.3:5173",
        "http://localhost:4173",
        "http://127.0.0.3:4173",
        "http://127.0.0.1:4173",
    ],
)

# Media lifecycle & retention policy (configurable via env)
MEDIA_TEMP_TTL_SECONDS: int = int(os.getenv("MEDIA_TEMP_TTL_SECONDS", "600"))  # 10 minutes
MEDIA_CLEANUP_INTERVAL_SECONDS: int = int(os.getenv("MEDIA_CLEANUP_INTERVAL_SECONDS", "60"))  # 1 minute
MEDIA_MAX_CONCURRENT_JOBS: int = int(os.getenv("MEDIA_MAX_CONCURRENT_JOBS", "3"))
MEDIA_MAX_DURATION_SECONDS: int = int(os.getenv("MEDIA_MAX_DURATION_SECONDS", "14400"))  # 4 hours
MEDIA_DOWNLOAD_CHUNK_SIZE: int = int(os.getenv("MEDIA_DOWNLOAD_CHUNK_SIZE", str(64 * 1024)))  # 64 KB

# Limits for playlists and recommendations
PLAYLIST_MAX_ITEMS: int = int(os.getenv("PLAYLIST_MAX_ITEMS", "100"))
DISCOVER_MAX_RECOMMENDATIONS: int = int(os.getenv("DISCOVER_MAX_RECOMMENDATIONS", "40"))

# Bounded temporary directory root for Banana
DEFAULT_TEMP_ROOT = Path(os.getenv("TEMP", os.getenv("TMP", "/tmp"))) / "banana_media_temp"
MEDIA_TEMP_ROOT: Path = Path(os.getenv("MEDIA_TEMP_ROOT", str(DEFAULT_TEMP_ROOT))).resolve()
