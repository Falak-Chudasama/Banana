import asyncio
import concurrent.futures
import json
import logging
import urllib.parse
from typing import Any, Dict, List, Optional

import requests
from yt_dlp import YoutubeDL

logger = logging.getLogger("banana.search")

# RYD API URL
RYD_API_URL = "https://returnyoutubedislikeapi.com/votes"


def _fetch_votes_sync(video_id: str) -> Dict[str, Optional[int]]:
    """Fetch likes and dislikes from Return YouTube Dislike API."""
    try:
        url = f"{RYD_API_URL}?videoId={urllib.parse.quote(video_id)}"
        resp = requests.get(url, headers={"User-Agent": "Banana-Search/2.0"}, timeout=1.5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "likes": data.get("likes"),
                "dislikes": data.get("dislikes"),
            }
    except Exception:
        pass
    return {"likes": None, "dislikes": None}


def _search_innertube_sync(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Query YouTube's desktop Innertube search endpoint for rich video metadata."""
    headers = {
        "Content-Type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
    }
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.00.00",
                "hl": "en",
                "gl": "US",
            }
        },
        "query": query,
    }

    resp = requests.post(
        "https://www.youtube.com/youtubei/v1/search",
        json=payload,
        headers=headers,
        timeout=6.0,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Innertube responded with status {resp.status_code}")

    data = resp.json()
    results = []

    sections = (
        data.get("contents", {})
        .get("twoColumnSearchResultsRenderer", {})
        .get("primaryContents", {})
        .get("sectionListRenderer", {})
        .get("contents", [])
    )

    for section in sections:
        items = section.get("itemSectionRenderer", {}).get("contents", [])
        for item in items:
            vr = item.get("videoRenderer")
            if not vr:
                continue

            vid = vr.get("videoId")
            if not vid or len(vid) < 5:
                continue

            title = "".join(r.get("text", "") for r in vr.get("title", {}).get("runs", []))
            if not title:
                continue

            channel = "".join(r.get("text", "") for r in vr.get("ownerText", {}).get("runs", []))
            views = vr.get("viewCountText", {}).get("simpleText") or ""
            published = vr.get("publishedTimeText", {}).get("simpleText") or ""
            duration = vr.get("lengthText", {}).get("simpleText") or ""

            badges = [
                b.get("metadataBadgeRenderer", {}).get("label")
                for b in vr.get("badges", [])
                if b.get("metadataBadgeRenderer") and b.get("metadataBadgeRenderer", {}).get("label")
            ]

            chan_thumbs = (
                vr.get("channelThumbnailSupportedRenderers", {})
                .get("channelThumbnailWithLinkRenderer", {})
                .get("thumbnail", {})
                .get("thumbnails", [])
            )
            chan_thumb = chan_thumbs[-1].get("url") if chan_thumbs else None

            # High-res thumbnail with standard fallback
            thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

            results.append({
                "id": vid,
                "title": title.strip(),
                "channel": channel.strip() or "YouTube Creator",
                "channel_thumbnail": chan_thumb,
                "views": views.strip() or "Views unavailable",
                "upload_date": published.strip() or "Recently",
                "duration": duration.strip() or None,
                "thumbnail": thumb,
                "badges": badges,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "likes": None,
                "dislikes": None,
            })

            if len(results) >= limit:
                break
        if len(results) >= limit:
            break

    return results


def _search_ytdlp_fallback_sync(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Fallback search using yt-dlp flat extractor."""
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 10,
    }
    with YoutubeDL(ydl_opts) as ydl:
        res = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
        entries = res.get("entries", []) or []

        results = []
        for e in entries:
            vid = e.get("id")
            if not vid:
                continue
            duration_s = e.get("duration")
            duration_str = None
            if duration_s is not None:
                mins = int(duration_s // 60)
                secs = int(duration_s % 60)
                duration_str = f"{mins}:{secs:02d}"

            view_count = e.get("view_count")
            views_str = f"{view_count:,} views" if view_count else "Views unavailable"

            results.append({
                "id": vid,
                "title": e.get("title") or "Untitled Video",
                "channel": e.get("channel") or e.get("uploader") or "YouTube Creator",
                "channel_thumbnail": None,
                "views": views_str,
                "upload_date": "Recently",
                "duration": duration_str,
                "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "badges": [],
                "url": f"https://www.youtube.com/watch?v={vid}",
                "likes": None,
                "dislikes": None,
            })
            if len(results) >= limit:
                break

        return results


async def search_videos_async(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Search YouTube videos with rich metadata (views, upload date, channel, badges, likes, dislikes).
    First attempts fast Innertube search, with fallback to yt-dlp.
    Augments top items with Return YouTube Dislike metrics concurrently.
    """
    cleaned_query = query.strip()
    if not cleaned_query:
        return []

    # 1. Fetch search entries
    loop = asyncio.get_running_loop()
    try:
        results = await loop.run_in_executor(None, _search_innertube_sync, cleaned_query, limit)
    except Exception as exc:
        logger.warning(f"Innertube search failed ({exc}); trying yt-dlp fallback...")
        try:
            results = await loop.run_in_executor(None, _search_ytdlp_fallback_sync, cleaned_query, limit)
        except Exception as fb_exc:
            logger.error(f"yt-dlp fallback search also failed: {fb_exc}")
            return []

    if not results:
        return []

    # 2. Enrich top 12 results with likes and dislikes in parallel with tight timeout
    top_vids = [r["id"] for r in results[:12]]

    def enrich_batch():
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(top_vids))) as executor:
            return list(executor.map(_fetch_votes_sync, top_vids))

    try:
        vote_data_list = await loop.run_in_executor(None, enrich_batch)
        for idx, votes in enumerate(vote_data_list):
            if idx < len(results):
                results[idx]["likes"] = votes.get("likes")
                results[idx]["dislikes"] = votes.get("dislikes")
    except Exception as exc:
        logger.warning(f"RYD vote enrichment error: {exc}")

    return results

