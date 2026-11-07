import logging
import os
import shutil
import socket
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger("lychee.resilience")

# Known potential locations for FFmpeg binaries across Windows, Linux, and macOS
COMMON_FFMPEG_DIRS: List[Path] = [
    Path(r"C:\Users\ADMIN\OneDrive\MSWord files\Dependencies\ffmpeg-master-latest-win64-gpl\bin"),
    Path(r"C:\ffmpeg\bin"),
    Path(r"C:\tools\ffmpeg\bin"),
    Path(r"C:\ProgramData\chocolatey\bin"),
    Path(r"C:\Program Files\ffmpeg\bin"),
    Path(r"C:\Program Files (x86)\ffmpeg\bin"),
    Path(os.path.expanduser(r"~\scoop\apps\ffmpeg\current\bin")),
    Path("/usr/bin"),
    Path("/usr/local/bin"),
    Path("/opt/homebrew/bin"),
    Path("/snap/bin"),
]


def ensure_ffmpeg_in_path() -> Optional[str]:
    """
    Ensure ffmpeg is discoverable in PATH. If not present in current PATH,
    search common installation directories and inject into os.environ['PATH'].
    """
    existing = shutil.which("ffmpeg")
    if existing:
        return existing

    for candidate in COMMON_FFMPEG_DIRS:
        try:
            if candidate.is_dir():
                ffmpeg_exe = candidate / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
                if ffmpeg_exe.is_file():
                    path_str = str(candidate.resolve())
                    os.environ["PATH"] = path_str + os.pathsep + os.environ.get("PATH", "")
                    logger.info(f"Discovered FFmpeg at: {path_str} and added to PATH.")
                    return str(ffmpeg_exe.resolve())
        except Exception:
            continue

    logger.warning("FFmpeg not detected in PATH or standard installation locations.")
    return None


def test_socket_bind(host: str, port: int) -> bool:
    """Check if host and port can be bound without error."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
    except Exception:
        return False


def is_service_responding(host: str, port: int, path: str = "/health", timeout: float = 1.0) -> bool:
    """Check if an existing Lychee or HTTP service is already active on host:port."""
    url = f"http://{host}:{port}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Lychee-Health-Probe/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def resolve_resilient_bind(
    preferred_host: str,
    preferred_port: int,
) -> Tuple[str, int]:
    """
    Verify preferred host and port are bindable.
    If preferred_host (e.g. 127.0.0.3) fails on the OS, fall back to 127.0.0.1, then 0.0.0.0.
    If preferred_port is occupied, attempt to find an available port.
    """
    candidate_hosts = [preferred_host]
    for fallback in ["127.0.0.1", "0.0.0.0", "localhost"]:
        if fallback not in candidate_hosts:
            candidate_hosts.append(fallback)

    # 1. Try preferred host & port
    if test_socket_bind(preferred_host, preferred_port):
        return preferred_host, preferred_port

    # 2. Check if preferred host is valid on this OS with port 0 (ephemeral)
    chosen_host = preferred_host
    if not test_socket_bind(preferred_host, 0):
        # preferred_host is not supported by OS network configuration
        for h in candidate_hosts[1:]:
            if test_socket_bind(h, preferred_port) or test_socket_bind(h, 0):
                logger.warning(
                    f"Preferred host '{preferred_host}' is not assignable on this system. "
                    f"Falling back to '{h}'."
                )
                chosen_host = h
                break

    # 3. Check if preferred_port is bindable on chosen_host
    if test_socket_bind(chosen_host, preferred_port):
        return chosen_host, preferred_port

    # 4. If preferred_port is occupied, check if Lychee is already running
    if is_service_responding(chosen_host, preferred_port):
        logger.info(
            f"An active Lychee service was detected already operational on http://{chosen_host}:{preferred_port}."
        )
        return chosen_host, preferred_port

    # 5. Search for the next available port in proximity
    for offset in range(1, 10):
        alt_port = preferred_port + offset
        if test_socket_bind(chosen_host, alt_port):
            logger.warning(
                f"Port {preferred_port} was occupied. Successfully bound fallback port {alt_port} on {chosen_host}."
            )
            return chosen_host, alt_port

    # Final fallback: return original and let uvicorn attempt bind
    return chosen_host, preferred_port


def ensure_temp_storage(primary_path: Path) -> Path:
    """
    Verify and guarantee that the temporary storage root is writable and valid.
    Falls back gracefully if the primary path is blocked or unwritable.
    """
    candidates = [
        primary_path,
        Path(tempfile.gettempdir()) / "lychee_media_temp",
        Path("./.lychee_temp").resolve(),
    ]

    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            test_file = candidate / f".write_test_{os.getpid()}"
            test_file.touch(exist_ok=True)
            test_file.unlink(missing_ok=True)
            return candidate.resolve()
        except Exception as exc:
            logger.warning(f"Temp root candidate {candidate} is not writable ({exc}). Trying next candidate...")
            continue

    # Extreme fallback: use standard tempfile directory directly
    return Path(tempfile.gettempdir()).resolve()

