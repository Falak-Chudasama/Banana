import { BACKEND } from '../lib/media'
import type { JobEvent, JobRecord } from '../lib/jobTypes'

export class JobEventSubscriber {
  private jobId: string
  private onEventCallback: (event: JobEvent) => void
  private onJobUpdatedCallback: (job: JobRecord) => void
  private onErrorCallback?: (err: Error) => void

  private eventSource: EventSource | null = null
  private pollIntervalId: number | null = null
  private lastEventId: number | null = null
  private isClosed = false
  private retryCount = 0
  private maxSseRetries = 3

  constructor(
    jobId: string,
    onEvent: (event: JobEvent) => void,
    onJobUpdated: (job: JobRecord) => void,
    onError?: (err: Error) => void,
  ) {
    this.jobId = jobId
    this.onEventCallback = onEvent
    this.onJobUpdatedCallback = onJobUpdated
    this.onErrorCallback = onError

    this.connect()
  }

  private connect() {
    if (this.isClosed) return

    // If SSE retries exceeded or EventSource unavailable, use polling fallback
    if (this.retryCount >= this.maxSseRetries || typeof window === 'undefined' || !window.EventSource) {
      this.startPollingFallback()
      return
    }

    try {
      const url = new URL(`${BACKEND}/jobs/${this.jobId}/events`, window.location.href)
      if (this.lastEventId !== null) {
        url.searchParams.set('last_event_id', String(this.lastEventId))
      }

      this.eventSource = new EventSource(url.toString())

      this.eventSource.onopen = () => {
        this.retryCount = 0
      }

      const handleIncomingMessage = (e: MessageEvent) => {
        if (!e.data || e.data.trim() === '') return
        try {
          const event: JobEvent = JSON.parse(e.data)
          if (event.event_id) {
            this.lastEventId = event.event_id
          }
          this.onEventCallback(event)

          // Terminal state handling
          if (
            event.status === 'completed' ||
            event.status === 'failed' ||
            event.status === 'cancelled' ||
            event.status === 'expired'
          ) {
            this.close()
          }
        } catch (err) {
          console.warn('Error parsing SSE event payload:', err)
        }
      }

      // Listen for custom event types
      const eventTypes = [
        'job_created',
        'queued',
        'stage_changed',
        'progress',
        'postprocessing',
        'ready',
        'transfer_started',
        'transfer_progress',
        'completed',
        'failed',
        'cancelled',
        'expired',
        'message',
      ]

      for (const t of eventTypes) {
        this.eventSource.addEventListener(t, handleIncomingMessage)
      }

      this.eventSource.onerror = () => {
        if (this.isClosed) return
        this.closeEventSource()
        this.retryCount++

        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 6000)
        window.setTimeout(() => {
          if (!this.isClosed) {
            this.connect()
          }
        }, delay)
      }
    } catch {
      this.startPollingFallback()
    }
  }

  private startPollingFallback() {
    this.closeEventSource()
    if (this.isClosed || this.pollIntervalId !== null) return

    // Immediately poll once
    this.pollJobState()
    this.pollIntervalId = window.setInterval(() => {
      this.pollJobState()
    }, 1500)
  }

  private async pollJobState() {
    if (this.isClosed) return
    try {
      const res = await fetch(`${BACKEND}/jobs/${this.jobId}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        throw new Error(`Job poll failed (${res.status})`)
      }
      const data = await res.json()
      if (data?.job) {
        this.onJobUpdatedCallback(data.job)

        const st = data.job.status
        if (st === 'completed' || st === 'failed' || st === 'cancelled' || st === 'expired') {
          this.close()
        }
      }
    } catch (err) {
      if (this.onErrorCallback && err instanceof Error) {
        this.onErrorCallback(err)
      }
    }
  }

  private closeEventSource() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  public close() {
    this.isClosed = true
    this.closeEventSource()
    if (this.pollIntervalId !== null) {
      window.clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }
}

