export type JobStatus =
  | 'created'
  | 'queued'
  | 'fetching_metadata'
  | 'downloading'
  | 'post_processing'
  | 'packaging'
  | 'ready'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export type JobType = 'download' | 'trim' | 'playlist_parent' | 'playlist_item'

export type ErrorCode =
  | 'invalid_url'
  | 'unsupported_source'
  | 'media_unavailable'
  | 'no_available_format'
  | 'network_timeout'
  | 'source_rate_limited'
  | 'source_access_denied'
  | 'cdn_url_expired'
  | 'download_interrupted'
  | 'ffmpeg_not_found'
  | 'postprocessing_failed'
  | 'disk_full'
  | 'temp_storage_error'
  | 'token_invalid'
  | 'token_expired'
  | 'transfer_interrupted'
  | 'client_cancelled'
  | 'internal_error'

export interface JobRecord {
  job_id: string
  job_type: JobType
  status: JobStatus
  parent_job_id?: string | null
  child_job_ids?: string[]

  url: string
  format: string
  quality: string
  start_time?: number | null
  end_time?: number | null

  title: string
  uploader?: string | null
  duration?: number | null
  thumbnail?: string | null

  created_at: number
  updated_at: number
  started_at?: number | null
  completed_at?: number | null
  expires_at?: number | null

  output_filename?: string | null
  output_extension?: string | null
  content_type?: string | null
  output_size_bytes?: number | null
  download_token?: string | null

  downloaded_bytes: number
  total_bytes?: number | null
  is_estimated_percent: boolean
  download_speed?: number | null
  eta_seconds?: number | null
  percent?: number | null

  transfer_bytes_sent: number
  transfer_attempt_count: number
  active_transfers: number

  current_stage: string
  current_message: string

  cancellation_requested: boolean
  error_code?: ErrorCode | null
  user_facing_error?: string | null
  technical_error_reference?: string | null

  playlist_total_tracks?: number | null
  playlist_completed_tracks?: number | null
  playlist_failed_tracks?: number | null
  playlist_current_track_index?: number | null
  playlist_current_track_title?: string | null
  children?: JobRecord[]

  // Client-side local transfer tracking
  client_transfer_progress?: number | null // 0-100%
  client_transfer_bytes?: number
  client_transfer_status?: 'idle' | 'saving' | 'saved' | 'failed'
}

export interface JobEvent {
  event_id: number
  job_id: string
  type: string
  status: JobStatus
  stage: string
  percent?: number | null
  is_estimated_percent: boolean
  downloaded_bytes: number
  total_bytes?: number | null
  speed_bytes_per_second?: number | null
  eta_seconds?: number | null
  message: string
  timestamp: number
  extra?: Record<string, any> | null
}

