import argparse
import logging
import sys
import uvicorn
from config import LYCHEE_HOST, LYCHEE_PORT
from resilience import (
    ensure_ffmpeg_in_path,
    is_service_responding,
    resolve_resilient_bind,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lychee.launcher")


def start_server():
    parser = argparse.ArgumentParser(description="Lychee Media Backend Launcher")
    parser.add_argument("--host", default=LYCHEE_HOST, help="Host address to bind")
    parser.add_argument("--port", type=int, default=LYCHEE_PORT, help="Port to listen on")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reloader")
    args, _ = parser.parse_known_args()

    # 1. Environment resilience: ensure FFmpeg is in PATH
    ffmpeg_loc = ensure_ffmpeg_in_path()
    if ffmpeg_loc:
        logger.info(f"FFmpeg ready: {ffmpeg_loc}")
    else:
        logger.warning("FFmpeg was not located in standard paths; media conversions may be restricted.")

    # 2. Check if a Lychee instance is already running and healthy
    if is_service_responding(args.host, args.port):
        print("\n" + "=" * 65)
        print("  LYCHEE MEDIA BACKEND IS ALREADY RUNNING & HEALTHY")
        print(f"  Service Address: http://{args.host}:{args.port}")
        print(f"  Health Status:   http://{args.host}:{args.port}/health")
        print(f"  API Docs/Root:   http://{args.host}:{args.port}/api")
        print("=" * 65 + "\n")
        logger.info("Service is already operational. No duplicate process needed.")
        return 0

    # 3. Resolve resilient host and port
    bind_host, bind_port = resolve_resilient_bind(args.host, args.port)
    reload_enabled = not args.no_reload

    print("\n" + "=" * 65)
    print("  STARTING LYCHEE MEDIA BACKEND")
    print(f"  Target Host:     {bind_host}")
    print(f"  Target Port:     {bind_port}")
    print(f"  Auto-Reload:     {reload_enabled}")
    print("=" * 65 + "\n")

    # 4. Attempt server start with graceful fallback
    try:
        uvicorn.run(
            "main:app",
            host=bind_host,
            port=bind_port,
            reload=reload_enabled,
        )
        return 0
    except OSError as err:
        logger.warning(f"Could not bind to {bind_host}:{bind_port} ({err}). Attempting fallback to 127.0.0.1:0...")
        try:
            uvicorn.run(
                "main:app",
                host="127.0.0.1",
                port=6060 if bind_port != 6060 else 6061,
                reload=False,
            )
            return 0
        except Exception as fallback_err:
            logger.error(f"Fallback server startup failed: {fallback_err}")
            return 1
    except KeyboardInterrupt:
        logger.info("Server stopped by user interrupt.")
        return 0
    except Exception as exc:
        logger.error(f"Server encountered unexpected fatal startup error: {exc}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(start_server())
