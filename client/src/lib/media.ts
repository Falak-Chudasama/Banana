import type { MediaFormat, MediaInfo, PreparedDownload } from './types'
export type { MediaFormat, MediaInfo, PreparedDownload }

export const BACKEND =
  typeof window !== 'undefined' && (window.location.hostname.includes('banana.jam') || window.location.hostname.includes('banana.com'))
    ? 'https://api.banana.jam'
    : (import.meta.env.VITE_API_BASE_URL || '/api')

export const mp4Qualities = ['best', '2160p', '1440p', '1080p', '720p', '480p', '360p'] as const
export const mp3Qualities = ['320', '192', '128'] as const

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

export function isYouTubeUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false
  const trimmed = input.trim()
  if (trimmed.length < 11 || trimmed.length > 2048) return false

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.username || url.password) return false

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!YOUTUBE_HOSTS.has(hostname)) return false

    if (hostname.includes('youtu.be')) {
      const parts = url.pathname.split('/').filter(Boolean)
      return parts.length > 0 && /^[a-zA-Z0-9_-]{5,15}$/.test(parts[0])
    }

    if (url.pathname.startsWith('/playlist')) {
      return Boolean(url.searchParams.get('list'))
    }

    if (url.pathname.startsWith('/watch')) {
      const v = url.searchParams.get('v')
      return Boolean(v && /^[a-zA-Z0-9_-]{5,15}$/.test(v))
    }

    if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/v/')) {
      const parts = url.pathname.split('/').filter(Boolean)
      return parts.length >= 2 && /^[a-zA-Z0-9_-]{5,15}$/.test(parts[1])
    }

    return false
  } catch {
    return false
  }
}

export function qualityLabel(format: MediaFormat, quality: string): string {
  return format === 'mp4' ? quality : `${quality} kbps`
}

export function defaultQualityFor(format: MediaFormat): string {
  return format === 'mp4' ? mp4Qualities[0] : mp3Qualities[0]
}

export function formatDuration(totalSeconds: number | string | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—'
  if (typeof totalSeconds === 'string') {
    if (totalSeconds.includes(':')) return totalSeconds
    const parsed = parseFloat(totalSeconds)
    if (Number.isNaN(parsed)) return '—'
    totalSeconds = parsed
  }

  if (Number.isNaN(totalSeconds) || totalSeconds < 0) return '—'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const paddedSeconds = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }

  return `${minutes}:${paddedSeconds}`
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function buildStreamPreviewUrl(url: string, format: 'audio' | 'video' = 'audio'): string {
  const params = new URLSearchParams({ url: url.trim(), format })
  return `${BACKEND}/stream/preview?${params.toString()}`
}

export async function fetchMediaInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const query = new URLSearchParams({ url: url.trim() })
  const res = await fetch(`${BACKEND}/info?${query.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Server returned error (${res.status})`)
  }

  return res.json()
}

export async function prepareDownload(
  url: string,
  format: MediaFormat,
  quality: string,
  signal?: AbortSignal,
): Promise<PreparedDownload> {
  const res = await fetch(`${BACKEND}/download/prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      url: url.trim(),
      format,
      quality,
    }),
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Processing failed (${res.status})`)
  }

  return res.json()
}

export async function processTrim(
  url: string,
  format: MediaFormat,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<PreparedDownload> {
  const res = await fetch(`${BACKEND}/trim/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      url: url.trim(),
      format,
      start_time: startTime,
      end_time: endTime,
    }),
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Trimming failed (${res.status})`)
  }

  return res.json()
}

export function triggerBrowserNativeDownload(token: string, filename: string): void {
  const streamUrl = `${BACKEND}/download/stream?token=${encodeURIComponent(token)}`
  const anchor = document.createElement('a')
  anchor.href = streamUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => anchor.remove(), 100)
}
