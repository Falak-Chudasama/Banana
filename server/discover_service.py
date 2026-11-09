import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

from config import DISCOVER_MAX_RECOMMENDATIONS
from validator import extract_youtube_id, is_valid_youtube_url

logger = logging.getLogger("lychee.discover")

# Global lazy YTMusic client
_ytm_client = None


def get_ytm():
    global _ytm_client
    if _ytm_client is None:
        try:
            from ytmusicapi import YTMusic
            _ytm_client = YTMusic()
        except Exception as exc:
            logger.warning(f"Could not initialize ytmusicapi: {exc}")
            _ytm_client = False
    return _ytm_client if _ytm_client is not False else None


def clean_track_title(title: str) -> str:
    """Normalize song title by stripping extraneous labels like (Official Video), [Audio], etc."""
    if not title:
        return ""
    cleaned = re.sub(
        r"[\(\[\{].*?(?:official|audio|video|remaster|hd|4k|lyric|visualizer).*?[\)\]\}]",
        "",
        title,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+-\s+.*$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or title.strip()


def normalize_artist(artist_entry: Any) -> str:
    """Extract clean artist name from ytmusicapi dict or string."""
    if isinstance(artist_entry, list):
        names = [a.get("name") if isinstance(a, dict) else str(a) for a in artist_entry if a]
        return ", ".join(names) if names else "Unknown Artist"
    if isinstance(artist_entry, dict):
        return artist_entry.get("name", "Unknown Artist")
    if isinstance(artist_entry, str):
        return artist_entry.strip()
    return "Unknown Artist"


def extract_best_thumbnail(raw_thumb: Any, video_id: str = "") -> str:
    """Extract a valid single thumbnail URL string from strings, dicts, or lists of dicts."""
    if isinstance(raw_thumb, list) and raw_thumb:
        # Choose the highest resolution thumbnail (last item)
        for item in reversed(raw_thumb):
            if isinstance(item, dict) and item.get("url"):
                return item["url"]
            if isinstance(item, str) and item.startswith("http"):
                return item
    elif isinstance(raw_thumb, dict) and raw_thumb.get("url"):
        return raw_thumb["url"]
    elif isinstance(raw_thumb, str) and raw_thumb.startswith("http"):
        return raw_thumb

    if video_id:
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return ""


class DiscoverEngine:
    def __init__(self):
        self.ytm = get_ytm()

    async def resolve_seed(self, input_query: str) -> Dict[str, Any]:
        cleaned = input_query.strip()
        video_id = extract_youtube_id(cleaned)

        if video_id:
            return await asyncio.to_thread(self._resolve_by_id, video_id, cleaned)
        else:
            return await asyncio.to_thread(self._resolve_by_search, cleaned)

    def _resolve_by_id(self, video_id: str, original_url: str) -> Dict[str, Any]:
        ytm = get_ytm()
        if ytm:
            try:
                watch = ytm.get_watch_playlist(videoId=video_id, limit=2)
                tracks = watch.get("tracks", [])
                if tracks:
                    first = tracks[0]
                    thumb = extract_best_thumbnail(first.get("thumbnail") or first.get("thumbnails"), video_id)

                    return {
                        "id": video_id,
                        "title": first.get("title") or "Unknown Title",
                        "artist": normalize_artist(first.get("artists") or first.get("byline")),
                        "duration": first.get("length") or None,
                        "thumbnail": thumb,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    }
            except Exception as exc:
                logger.warning(f"ytmusicapi watch_playlist lookup failed for {video_id}: {exc}")

        # Fallback using yt-dlp metadata
        from media_service import _sync_extract_info
        info = _sync_extract_info(f"https://www.youtube.com/watch?v={video_id}")
        thumb = extract_best_thumbnail(info.get("thumbnail") or info.get("thumbnails"), video_id)
        return {
            "id": video_id,
            "title": info.get("title") or "Unknown Title",
            "artist": info.get("uploader") or "Unknown Artist",
            "duration": info.get("duration"),
            "thumbnail": thumb,
            "url": f"https://www.youtube.com/watch?v={video_id}",
        }

    def _resolve_by_search(self, query: str) -> Dict[str, Any]:
        ytm = get_ytm()
        if ytm:
            try:
                results = ytm.search(query, filter="songs", limit=5)
                if not results:
                    results = ytm.search(query, limit=5)

                if results:
                    item = results[0]
                    video_id = item.get("videoId") or ""
                    thumb = extract_best_thumbnail(item.get("thumbnails") or item.get("thumbnail"), video_id)

                    return {
                        "id": video_id,
                        "title": item.get("title") or query,
                        "artist": normalize_artist(item.get("artists")),
                        "duration": item.get("duration"),
                        "thumbnail": thumb,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    }
            except Exception as exc:
                logger.warning(f"ytmusicapi search failed for {query}: {exc}")

        from yt_dlp import YoutubeDL
        ydl_opts = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
            "js_runtimes": {"node": {}},
        }
        with YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch1:{query}", download=False)
            entries = res.get("entries") or []
            if entries:
                first = entries[0]
                vid = first.get("id") or ""
                thumb = extract_best_thumbnail(first.get("thumbnail") or first.get("thumbnails"), vid)
                return {
                    "id": vid,
                    "title": first.get("title") or query,
                    "artist": first.get("uploader") or "Unknown Artist",
                    "duration": first.get("duration"),
                    "thumbnail": thumb,
                    "url": f"https://www.youtube.com/watch?v={vid}",
                }

        raise ValueError(f"Could not find any matching songs for: {query}")

    async def get_recommendations(
        self,
        seed: Dict[str, Any],
        category: str = "more_like_this",
        similarity_pref: str = "balanced",
        popularity_pref: str = "balanced",
        diversity_pref: str = "normal",
        liked_ids: Optional[List[str]] = None,
        disliked_ids: Optional[List[str]] = None,
        known_ids: Optional[List[str]] = None,
        limit: int = 25,
    ) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(
            self._get_recommendations_sync,
            seed,
            category,
            similarity_pref,
            popularity_pref,
            diversity_pref,
            liked_ids or [],
            disliked_ids or [],
            known_ids or [],
            limit,
        )

    def _get_recommendations_sync(
        self,
        seed: Dict[str, Any],
        category: str,
        similarity_pref: str,
        popularity_pref: str,
        diversity_pref: str,
        liked_ids: List[str],
        disliked_ids: List[str],
        known_ids: List[str],
        limit: int,
    ) -> List[Dict[str, Any]]:
        ytm = get_ytm()
        raw_candidates = []
        seed_id = seed.get("id") or ""
        seed_artist = (seed.get("artist") or "").lower().strip()
        seed_title_clean = clean_track_title(seed.get("title") or "").lower()

        exclude_ids = set(disliked_ids) | set(known_ids)
        if seed_id:
            exclude_ids.add(seed_id)

        # 1. Fetch raw candidate pool based on category
        if category == "trending":
            raw_candidates = self._fetch_trending_candidates(ytm)
        else:
            raw_candidates = self._fetch_radio_candidates(ytm, seed_id, seed_artist)

        # 2. Deduplicate and filter out unwanted IDs
        seen_keys = set()
        cleaned_pool = []

        for item in raw_candidates:
            vid = item.get("id") or item.get("videoId") or ""
            if not vid or vid in exclude_ids:
                continue

            raw_title = item.get("title") or ""
            norm_title = clean_track_title(raw_title).lower()
            norm_artist = normalize_artist(item.get("artists") or item.get("artist")).lower()

            if norm_title == seed_title_clean and seed_artist in norm_artist:
                continue

            key = (norm_title, norm_artist.split(",")[0].strip())
            if key in seen_keys:
                continue
            seen_keys.add(key)

            thumb = extract_best_thumbnail(item.get("thumbnail") or item.get("thumbnails"), vid)

            cleaned_pool.append({
                "id": vid,
                "title": raw_title,
                "artist": normalize_artist(item.get("artists") or item.get("artist")),
                "duration": item.get("length") or item.get("duration") or None,
                "thumbnail": thumb,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "raw_index": len(cleaned_pool),
            })

        # 3. Category-specific filtering & scoring
        pref_delta = 0
        if similarity_pref == "very_similar":
            pref_delta = 2
        elif similarity_pref == "experimental":
            pref_delta = -4

        def compute_match_score(base_peak: int, step_decay: float, index: int, is_same_artist: bool = False) -> int:
            score = base_peak - (index * step_decay) + pref_delta
            if is_same_artist:
                score += 2
            return int(max(60, min(99, round(score))))

        results = []

        if category == "same_vibe":
            filtered = [
                c for c in cleaned_pool
                if seed_artist not in c["artist"].lower() and c["artist"].lower() not in seed_artist
            ]
            for idx, item in enumerate(filtered):
                reason = f"Same vibe from alternative artist ({item['artist']})"
                match_score = compute_match_score(96, 0.8, idx)
                results.append({**item, "reason": reason, "match_score": match_score})

        elif category == "hidden_gems":
            gems = [
                c for c in cleaned_pool
                if seed_artist not in c["artist"].lower()
            ]
            ranked_gems = sorted(gems, key=lambda x: -x["raw_index"])
            for idx, item in enumerate(ranked_gems):
                reason = "Hidden gem with acoustic match"
                match_score = compute_match_score(91, 0.7, idx)
                results.append({**item, "reason": reason, "match_score": match_score})

        elif category == "trending":
            for idx, item in enumerate(cleaned_pool):
                reason = "Trending now on global music charts"
                match_score = compute_match_score(89, 0.5, idx)
                results.append({**item, "reason": reason, "match_score": match_score})

        elif category == "explore":
            diverse = [
                c for c in cleaned_pool
                if seed_artist not in c["artist"].lower()
            ]
            step = 2 if len(diverse) > 10 else 1
            for idx, item in enumerate(diverse[::step]):
                reason = "Musical crossover sharing production energy"
                match_score = compute_match_score(85, 0.7, idx)
                results.append({**item, "reason": reason, "match_score": match_score})

        else:  # more_like_this
            for idx, item in enumerate(cleaned_pool):
                is_same_artist = seed_artist in item["artist"].lower()
                if is_same_artist:
                    reason = f"Matching track by {item['artist']}"
                    base_peak = 98
                else:
                    reason = "Similar musical style, tempo and energy"
                    base_peak = 95
                match_score = compute_match_score(base_peak, 0.7, idx, is_same_artist)
                results.append({**item, "reason": reason, "match_score": match_score})

        # 4. Apply session feedback
        if liked_ids:
            liked_set = set(liked_ids)
            liked_artists = {c["artist"].lower() for c in results if c["id"] in liked_set}
            if liked_artists:
                def feedback_priority(c):
                    return 0 if any(la in c["artist"].lower() for la in liked_artists) else 1
                results.sort(key=feedback_priority)
                # Boost match_score for liked artists/tracks by +3% (capped at 99)
                for item in results:
                    if any(la in item["artist"].lower() for la in liked_artists) or item["id"] in liked_set:
                        item["match_score"] = min(99, item.get("match_score", 90) + 3)

        final_list = results[:min(limit, DISCOVER_MAX_RECOMMENDATIONS)]

        if len(final_list) < 5 and cleaned_pool:
            for extra in cleaned_pool:
                if extra["id"] not in {r["id"] for r in final_list}:
                    final_list.append({
                        **extra,
                        "reason": "Recommended by Banana Discover",
                        "match_score": max(65, 82 - len(final_list)),
                    })
                if len(final_list) >= limit:
                    break

        return final_list

    def _fetch_radio_candidates(self, ytm, seed_id: str, seed_artist: str) -> List[Dict[str, Any]]:
        candidates = []
        if ytm and seed_id:
            try:
                watch = ytm.get_watch_playlist(videoId=seed_id, limit=50)
                tracks = watch.get("tracks", [])
                candidates.extend(tracks)
            except Exception as exc:
                logger.warning(f"Error fetching watch playlist for {seed_id}: {exc}")

        if len(candidates) < 15 and ytm and seed_artist:
            try:
                search_res = ytm.search(f"{seed_artist} radio", filter="songs", limit=15)
                candidates.extend(search_res)
            except Exception:
                pass

        if not candidates:
            # Resilient fallback: search via yt-dlp
            try:
                from yt_dlp import YoutubeDL
                from media_service import YDL_BASE_OPTS
                ydl_opts = {
                    **YDL_BASE_OPTS,
                    "skip_download": True,
                    "extract_flat": True,
                }
                search_term = f"{seed_artist} songs" if seed_artist else "popular music songs"
                with YoutubeDL(ydl_opts) as ydl:
                    res = ydl.extract_info(f"ytsearch15:{search_term}", download=False)
                    for e in list(res.get("entries") or []):
                        if e and e.get("id"):
                            candidates.append({
                                "videoId": e.get("id"),
                                "title": e.get("title") or "Unknown Song",
                                "artists": [{"name": e.get("uploader") or seed_artist or "Artist"}],
                                "duration": e.get("duration"),
                                "thumbnails": [{"url": e.get("thumbnail")}],
                            })
            except Exception as exc:
                logger.warning(f"yt-dlp fallback radio candidates search failed: {exc}")

        return candidates

    def _fetch_trending_candidates(self, ytm) -> List[Dict[str, Any]]:
        candidates = []
        if ytm:
            try:
                chart_pl = ytm.get_playlist("PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0", limit=30)
                candidates.extend(chart_pl.get("tracks", []))
            except Exception as exc:
                logger.warning(f"Failed to fetch global chart playlist: {exc}")

        if not candidates and ytm:
            try:
                trending_search = ytm.search("Trending hits", filter="songs", limit=25)
                candidates.extend(trending_search)
            except Exception:
                pass

        if not candidates:
            try:
                from yt_dlp import YoutubeDL
                from media_service import YDL_BASE_OPTS
                ydl_opts = {
                    **YDL_BASE_OPTS,
                    "skip_download": True,
                    "extract_flat": True,
                }
                with YoutubeDL(ydl_opts) as ydl:
                    res = ydl.extract_info("ytsearch20:top hits trending music", download=False)
                    for e in list(res.get("entries") or []):
                        if e and e.get("id"):
                            candidates.append({
                                "videoId": e.get("id"),
                                "title": e.get("title") or "Trending Track",
                                "artists": [{"name": e.get("uploader") or "Popular Artist"}],
                                "duration": e.get("duration"),
                                "thumbnails": [{"url": e.get("thumbnail")}],
                            })
            except Exception as exc:
                logger.warning(f"yt-dlp fallback trending search failed: {exc}")

        return candidates


discover_engine = DiscoverEngine()
