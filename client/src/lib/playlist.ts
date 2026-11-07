import { BACKEND } from './media'
import type { PlaylistData } from './types'

export async function fetchPlaylistInfo(url: string, signal?: AbortSignal): Promise<PlaylistData> {
  const params = new URLSearchParams({ url: url.trim() })
  const res = await fetch(`${BACKEND}/playlist/info?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || 'Failed to load playlist.')
  }

  return res.json()
}

