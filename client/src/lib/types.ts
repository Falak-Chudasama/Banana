export type MediaFormat = 'mp4' | 'mp3'

export type NavTab = 'download' | 'discover' | 'search' | 'playlists'

export interface VideoSearchResult {
  id: string
  title: string
  channel: string
  channel_thumbnail?: string | null
  views?: string
  upload_date?: string
  duration?: string | null
  thumbnail: string
  badges?: string[]
  url: string
  likes?: number | null
  dislikes?: number | null
}

export interface TrackItem {
  id: string
  title: string
  artist: string
  duration?: number | string | null
  thumbnail?: string
  url: string
  reason?: string
  match_score?: number
}

export interface MediaInfo {
  title: string
  thumbnail: string
  uploader: string
  duration: number | null
  webpage_url?: string
}

export interface PreparedDownload {
  token: string
  filename: string
  filesize: number
  expires_in: number
}

export type DiscoverCategory = 'more_like_this' | 'same_vibe' | 'hidden_gems' | 'trending' | 'explore'

export interface DiscoverPreferences {
  similarity: 'experimental' | 'balanced' | 'very_similar'
  popularity: 'underground' | 'balanced' | 'popular'
  diversity: 'high' | 'normal' | 'familiar'
}

export interface PlaylistData {
  id: string
  title: string
  uploader: string
  track_count: number
  tracks: TrackItem[]
}

