import { BACKEND } from './media'
import type { VideoSearchResult } from './types'

export async function searchVideos(
  query: string,
  limit: number = 20,
  signal?: AbortSignal,
): Promise<VideoSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    query: trimmed,
    limit: String(limit),
  })

  const res = await fetch(`${BACKEND}/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || 'Video search request failed.')
  }

  const json = await res.json()
  return json.results || []
}

export function formatCompactNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—'
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }
  return String(num)
}

