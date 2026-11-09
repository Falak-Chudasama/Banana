import re
from typing import Optional
from urllib.parse import parse_qs, urlsplit

ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
}

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{5,15}$")
YOUTUBE_PLAYLIST_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{10,64}$")


def extract_youtube_id(url: str) -> Optional[str]:
    """Extract a valid YouTube video ID from a URL, or None if invalid."""
    if not url or not isinstance(url, str):
        return None

    cleaned = url.strip()
    try:
        parsed = urlsplit(cleaned)
    except Exception:
        return None

    if parsed.scheme.lower() not in {"http", "https"}:
        return None

    if parsed.username or parsed.password:
        return None

    if parsed.port not in (None, 80, 443):
        return None

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname not in ALLOWED_HOSTS:
        return None

    path = parsed.path or ""

    if hostname in {"youtu.be", "www.youtu.be"}:
        parts = [p for p in path.split("/") if p]
        if parts and YOUTUBE_VIDEO_ID_PATTERN.match(parts[0]):
            return parts[0]
        return None

    if path.startswith("/watch"):
        qs = parse_qs(parsed.query)
        v = qs.get("v")
        if v and v[0] and YOUTUBE_VIDEO_ID_PATTERN.match(v[0]):
            return v[0]
        return None

    if path.startswith("/shorts/") or path.startswith("/embed/") or path.startswith("/v/"):
        parts = [p for p in path.split("/") if p]
        if len(parts) >= 2 and YOUTUBE_VIDEO_ID_PATTERN.match(parts[1]):
            return parts[1]

    return None


def extract_playlist_id(url: str) -> Optional[str]:
    """Extract a valid YouTube playlist ID from a URL, or None if invalid."""
    if not url or not isinstance(url, str):
        return None

    cleaned = url.strip()
    try:
        parsed = urlsplit(cleaned)
    except Exception:
        return None

    if parsed.scheme.lower() not in {"http", "https"}:
        return None

    if parsed.username or parsed.password:
        return None

    if parsed.port not in (None, 80, 443):
        return None

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname not in ALLOWED_HOSTS:
        return None

    qs = parse_qs(parsed.query)
    list_id = qs.get("list")
    if list_id and list_id[0] and YOUTUBE_PLAYLIST_ID_PATTERN.match(list_id[0]):
        return list_id[0]

    return None


def is_valid_youtube_url(url: str) -> bool:
    """Check if the URL is a valid YouTube video or playlist URL."""
    return extract_youtube_id(url) is not None or extract_playlist_id(url) is not None


def is_valid_playlist_url(url: str) -> bool:
    """Check if the URL points specifically to a playlist."""
    return extract_playlist_id(url) is not None


def sanitize_filename(name: str, fallback: str = "banana_media") -> str:
    """Sanitize filename to prevent directory traversal and illegal filesystem characters."""
    if not name:
        return fallback

    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f\r\n\t]', "_", name).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned)
    cleaned = cleaned.strip(". _-")

    return cleaned[:120] if cleaned else fallback
