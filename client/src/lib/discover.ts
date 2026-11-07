import { BACKEND } from './media'
import type { DiscoverCategory, DiscoverPreferences, TrackItem } from './types'

export async function resolveDiscoverSeed(query: string, signal?: AbortSignal): Promise<TrackItem> {
  const res = await fetch(`${BACKEND}/discover/seed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: query.trim() }),
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || 'Could not identify seed song.')
  }

  const json = await res.json()
  return json.seed
}

export async function fetchDiscoverRecommendations(
  seed: TrackItem,
  category: DiscoverCategory,
  prefs: DiscoverPreferences,
  feedback: { liked: string[]; disliked: string[]; known: string[] },
  signal?: AbortSignal,
): Promise<TrackItem[]> {
  const res = await fetch(`${BACKEND}/discover/recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      seed,
      category,
      similarity_pref: prefs.similarity,
      popularity_pref: prefs.popularity,
      diversity_pref: prefs.diversity,
      liked_ids: feedback.liked,
      disliked_ids: feedback.disliked,
      known_ids: feedback.known,
      limit: 30,
    }),
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || 'Failed to load recommendations.')
  }

  const json = await res.json()
  return json.recommendations || []
}

