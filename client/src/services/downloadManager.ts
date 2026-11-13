import { BACKEND } from '../lib/media'
import type { JobEvent, JobRecord, JobStatus } from '../lib/jobTypes'
import { JobEventSubscriber } from './jobEvents'

export type DownloadManagerListener = (jobs: JobRecord[]) => void

class DownloadManager {
  private jobs: Map<string, JobRecord> = new Map()
  private subscribers: Map<string, JobEventSubscriber> = new Map()
  private listeners: Set<DownloadManagerListener> = new Set()

  constructor() {
    this.restoreFromStorage()
  }

  private notify() {
    const list = Array.from(this.jobs.values()).sort((a, b) => b.created_at - a.created_at)
    this.persistToStorage(list)
    this.listeners.forEach((cb) => {
      try {
        cb(list)
      } catch (err) {
        console.error('DownloadManager listener error:', err)
      }
    })
  }

  public subscribe(cb: DownloadManagerListener): () => void {
    this.listeners.add(cb)
    cb(this.getJobs())
    return () => {
      this.listeners.delete(cb)
    }
  }

  public getJobs(): JobRecord[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.created_at - a.created_at)
  }

  public getJob(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId)
  }

  private persistToStorage(jobs: JobRecord[]) {
    if (typeof window === 'undefined') return
    try {
      // Only keep recent 20 jobs in session storage
      const recent = jobs.slice(0, 20)
      sessionStorage.setItem('banana_jobs', JSON.stringify(recent))
    } catch {}
  }

  private restoreFromStorage() {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem('banana_jobs')
      if (raw) {
        const parsed: JobRecord[] = JSON.parse(raw)
        for (const j of parsed) {
          this.jobs.set(j.job_id, j)
          // Re-subscribe if job was still active
          if (
            j.status === 'created' ||
            j.status === 'queued' ||
            j.status === 'fetching_metadata' ||
            j.status === 'downloading' ||
            j.status === 'post_processing' ||
            j.status === 'packaging'
          ) {
            this.attachSubscriber(j.job_id)
          }
        }
      }
    } catch {}
  }

  private attachSubscriber(jobId: string) {
    if (this.subscribers.has(jobId)) return

    const sub = new JobEventSubscriber(
      jobId,
      (event: JobEvent) => this.handleJobEvent(event),
      (updatedJob: JobRecord) => this.handleJobSnapshot(updatedJob),
      (err: Error) => console.warn(`Job ${jobId} subscription error:`, err),
    )
    this.subscribers.set(jobId, sub)
  }

  private handleJobEvent(event: JobEvent) {
    const job = this.jobs.get(event.job_id)
    if (!job) return

    job.status = event.status
    job.current_stage = event.stage
    job.current_message = event.message
    job.updated_at = event.timestamp

    if (event.percent !== undefined) {
      job.percent = event.percent
    }
    job.is_estimated_percent = event.is_estimated_percent

    if (event.downloaded_bytes > 0) {
      job.downloaded_bytes = event.downloaded_bytes
    }
    if (event.total_bytes !== undefined && event.total_bytes !== null) {
      job.total_bytes = event.total_bytes
    }
    if (event.speed_bytes_per_second !== undefined) {
      job.download_speed = event.speed_bytes_per_second
    }
    if (event.eta_seconds !== undefined) {
      job.eta_seconds = event.eta_seconds
    }

    if (event.extra?.token) {
      job.download_token = event.extra.token
    }
    if (event.extra?.filename) {
      job.output_filename = event.extra.filename
    }
    if (event.extra?.filesize) {
      job.output_size_bytes = event.extra.filesize
    }
    if (event.extra?.error_code) {
      job.error_code = event.extra.error_code
    }
    if (event.extra?.detail) {
      job.technical_error_reference = event.extra.detail
    }

    // Playlist aggregate info
    if (event.extra?.completed_tracks !== undefined) {
      job.playlist_completed_tracks = event.extra.completed_tracks
    }
    if (event.extra?.failed_tracks !== undefined) {
      job.playlist_failed_tracks = event.extra.failed_tracks
    }
    if (event.extra?.current_track_title) {
      job.playlist_current_track_title = event.extra.current_track_title
    }

    if (
      event.status === 'completed' ||
      event.status === 'failed' ||
      event.status === 'cancelled' ||
      event.status === 'expired'
    ) {
      this.subscribers.get(event.job_id)?.close()
      this.subscribers.delete(event.job_id)
    }

    this.notify()
  }

  private handleJobSnapshot(updatedJob: JobRecord) {
    const existing = this.jobs.get(updatedJob.job_id)
    this.jobs.set(updatedJob.job_id, {
      ...existing,
      ...updatedJob,
    })

    const st = updatedJob.status
    if (st === 'completed' || st === 'failed' || st === 'cancelled' || st === 'expired') {
      this.subscribers.get(updatedJob.job_id)?.close()
      this.subscribers.delete(updatedJob.job_id)
    }

    this.notify()
  }

  // 1. Start Media Download Job
  public async startDownloadJob(
    url: string,
    format: 'mp3' | 'mp4',
    quality: string,
    meta?: { title?: string; thumbnail?: string; uploader?: string; duration?: number | null },
  ): Promise<JobRecord> {
    const res = await fetch(`${BACKEND}/jobs/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: url.trim(), format, quality }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => null)
      throw new Error(errData?.detail || `Failed to initiate download job (${res.status})`)
    }

    const data = await res.json()
    const job: JobRecord = {
      ...data.job,
      title: meta?.title || data.job.title || 'Preparing media...',
      thumbnail: meta?.thumbnail || data.job.thumbnail,
      uploader: meta?.uploader || data.job.uploader,
      duration: meta?.duration !== undefined ? meta.duration : data.job.duration,
      client_transfer_status: 'idle',
    }

    this.jobs.set(job.job_id, job)
    this.attachSubscriber(job.job_id)
    this.notify()
    return job
  }

  // 2. Start Segment Trim Job
  public async startTrimJob(
    url: string,
    format: 'mp3' | 'mp4',
    startTime: number,
    endTime: number,
    meta?: { title?: string; thumbnail?: string; uploader?: string },
  ): Promise<JobRecord> {
    const res = await fetch(`${BACKEND}/jobs/trim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url: url.trim(),
        format,
        start_time: startTime,
        end_time: endTime,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => null)
      throw new Error(errData?.detail || `Failed to initiate trim job (${res.status})`)
    }

    const data = await res.json()
    const job: JobRecord = {
      ...data.job,
      title: meta?.title || data.job.title || 'Trimming audio/video clip...',
      thumbnail: meta?.thumbnail || data.job.thumbnail,
      uploader: meta?.uploader || data.job.uploader,
      client_transfer_status: 'idle',
    }

    this.jobs.set(job.job_id, job)
    this.attachSubscriber(job.job_id)
    this.notify()
    return job
  }

  // 3. Start Playlist Batch Job
  public async startPlaylistJob(
    url: string,
    format: 'mp3' | 'mp4',
    quality: string,
    trackIds?: string[],
  ): Promise<JobRecord> {
    const res = await fetch(`${BACKEND}/jobs/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url: url.trim(),
        format,
        quality,
        track_ids: trackIds,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => null)
      throw new Error(errData?.detail || `Failed to start playlist job (${res.status})`)
    }

    const data = await res.json()
    const job: JobRecord = {
      ...data.job,
      client_transfer_status: 'idle',
    }

    this.jobs.set(job.job_id, job)
    this.attachSubscriber(job.job_id)
    this.notify()
    return job
  }

  // 4. Cancel Job
  public async cancelJob(jobId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND}/jobs/${jobId}/cancel`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Cancellation failed (${res.status})`)
      }

      const job = this.jobs.get(jobId)
      if (job) {
        job.status = 'cancelled'
        job.cancellation_requested = true
        job.current_stage = 'cancelled'
        job.current_message = 'Download cancelled by user.'
        this.notify()
      }

      this.subscribers.get(jobId)?.close()
      this.subscribers.delete(jobId)
      return true
    } catch (err) {
      console.warn(`Cancel job ${jobId} failed:`, err)
      return false
    }
  }

  // 5. Retry Job
  public async retryJob(jobId: string): Promise<JobRecord | null> {
    try {
      const res = await fetch(`${BACKEND}/jobs/${jobId}/retry`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Retry failed (${res.status})`)
      }
      const data = await res.json()
      const updated = data.job as JobRecord

      this.jobs.set(jobId, updated)
      this.attachSubscriber(jobId)
      this.notify()
      return updated
    } catch (err) {
      console.warn(`Retry job ${jobId} failed:`, err)
      return null
    }
  }

  // 6. Dismiss / Remove Job from Local List
  public dismissJob(jobId: string): void {
    this.subscribers.get(jobId)?.close()
    this.subscribers.delete(jobId)
    this.jobs.delete(jobId)
    this.notify()
  }

  // 7. Clear Completed Jobs
  public clearCompleted(): void {
    for (const [id, j] of this.jobs.entries()) {
      if (j.status === 'completed' || j.status === 'cancelled') {
        this.dismissJob(id)
      }
    }
  }

  // 8. Progressive File Transfer to Device
  public async saveFileToDevice(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job || !job.download_token) {
      throw new Error('Prepared file is missing or token is unavailable.')
    }

    const token = job.download_token
    const filename = job.output_filename || `banana_media.${job.output_extension || 'mp4'}`
    const contentType = job.content_type || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4')
    const totalBytes = job.output_size_bytes || 0

    job.client_transfer_status = 'saving'
    job.client_transfer_progress = 0
    job.client_transfer_bytes = 0
    this.notify()

    try {
      // Strategy A: File System Access API (Streamed direct to disk without buffering)
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: 'Media File',
                accept: {
                  [contentType]: [`.${job.output_extension || (contentType.includes('audio') ? 'mp3' : 'mp4')}`],
                },
              },
            ],
          })

          const writable = await fileHandle.createWritable()
          const streamUrl = `${BACKEND}/download/${encodeURIComponent(token)}`
          const response = await fetch(streamUrl, { cache: 'no-store' })

          if (!response.ok || !response.body) {
            await writable.abort()
            throw new Error(`Failed to fetch media stream (${response.status})`)
          }

          const reader = response.body.getReader()
          let received = 0

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              await writable.write(value)
              received += value.byteLength
              if (totalBytes > 0) {
                job.client_transfer_progress = Math.min(100, Math.round((received / totalBytes) * 100))
              }
              job.client_transfer_bytes = received
              this.notify()
            }
          }

          await writable.close()

          // Send explicit completion acknowledgment to server
          await fetch(`${BACKEND}/download/${encodeURIComponent(token)}/complete`, {
            method: 'POST',
          }).catch(() => {})

          job.client_transfer_status = 'saved'
          job.client_transfer_progress = 100
          job.status = 'completed'
          this.notify()
          return true
        } catch (pickerErr: any) {
          if (pickerErr?.name === 'AbortError') {
            job.client_transfer_status = 'idle'
            this.notify()
            return false
          }
          console.warn('File System Access API failed, falling back...', pickerErr)
        }
      }

      // Strategy B: Fetch + ReadableStream + Blob (for files <= 60MB)
      if (totalBytes > 0 && totalBytes <= 60 * 1024 * 1024) {
        const streamUrl = `${BACKEND}/download/${encodeURIComponent(token)}`
        const response = await fetch(streamUrl, { cache: 'no-store' })
        if (!response.ok || !response.body) {
          throw new Error(`Failed to download media (${response.status})`)
        }

        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let received = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            chunks.push(value)
            received += value.byteLength
            if (totalBytes > 0) {
              job.client_transfer_progress = Math.min(100, Math.round((received / totalBytes) * 100))
            }
            job.client_transfer_bytes = received
            this.notify()
          }
        }

        const blob = new Blob(chunks as any[], { type: contentType })
        const blobUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = blobUrl
        anchor.download = filename
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()

        window.setTimeout(() => {
          anchor.remove()
          URL.revokeObjectURL(blobUrl)
        }, 3000)

        // Send completion acknowledgment
        await fetch(`${BACKEND}/download/${encodeURIComponent(token)}/complete`, {
          method: 'POST',
        }).catch(() => {})

        job.client_transfer_status = 'saved'
        job.client_transfer_progress = 100
        job.status = 'completed'
        this.notify()
        return true
      }

      // Strategy C: Browser-managed native download
      const nativeUrl = `${BACKEND}/download/${encodeURIComponent(token)}`
      const anchor = document.createElement('a')
      anchor.href = nativeUrl
      anchor.download = filename
      anchor.rel = 'noopener'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      window.setTimeout(() => anchor.remove(), 100)

      job.client_transfer_status = 'saved'
      job.status = 'completed'
      this.notify()
      return true
    } catch (err) {
      console.error('Error saving file:', err)
      job.client_transfer_status = 'failed'
      this.notify()
      throw err
    }
  }
}

export const downloadManager = new DownloadManager()
