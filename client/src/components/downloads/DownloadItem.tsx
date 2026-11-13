import React, { useState } from 'react'
import type { JobRecord, JobStatus } from '../../lib/jobTypes'
import { formatDuration, formatFileSize } from '../../lib/media'
import {
  AlertIcon,
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  PlayIcon,
  ScissorsIcon,
  SpinnerIcon,
} from '../icons'

interface DownloadItemProps {
  job: JobRecord
  onSave: (jobId: string) => Promise<boolean | void>
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onDismiss: (jobId: string) => void
}

export function DownloadItem({
  job,
  onSave,
  onCancel,
  onRetry,
  onDismiss,
}: DownloadItemProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveClick = async () => {
    setIsSaving(true)
    try {
      await onSave(job.job_id)
    } finally {
      setIsSaving(false)
    }
  }

  const isIndeterminate =
    (job.status === 'downloading' && job.percent === null) ||
    job.status === 'fetching_metadata' ||
    job.status === 'post_processing' ||
    job.status === 'packaging' ||
    job.status === 'queued'

  const percentNumber = job.client_transfer_progress !== undefined && job.client_transfer_progress !== null
    ? job.client_transfer_progress
    : job.percent !== null && job.percent !== undefined
    ? Math.min(100, Math.max(0, job.percent))
    : null

  // Format speed
  const speedFormatted =
    job.download_speed && job.download_speed > 0
      ? `${formatFileSize(job.download_speed)}/s`
      : null

  // Format ETA
  const etaFormatted =
    job.eta_seconds !== null && job.eta_seconds !== undefined && job.eta_seconds > 0
      ? job.eta_seconds >= 60
        ? `~${Math.ceil(job.eta_seconds / 60)}m left`
        : `~${job.eta_seconds}s left`
      : null

  const getStatusBadge = () => {
    if (job.client_transfer_status === 'saving') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-400/20 dark:text-cyan-300">
          <SpinnerIcon className="h-3 w-3 animate-spin" />
          Saving to Device
        </span>
      )
    }

    switch (job.status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-400/15 dark:text-stone-300">
            Queued
          </span>
        )
      case 'fetching_metadata':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-400/20 dark:text-blue-300">
            <SpinnerIcon className="h-3 w-3 animate-spin" />
            Metadata
          </span>
        )
      case 'downloading':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
            <SpinnerIcon className="h-3 w-3 animate-spin" />
            Downloading{percentNumber !== null ? ` ${percentNumber}%` : ''}
          </span>
        )
      case 'post_processing':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-400/20 dark:text-purple-300">
            <SpinnerIcon className="h-3 w-3 animate-spin" />
            FFmpeg Processing
          </span>
        )
      case 'packaging':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-300">
            <SpinnerIcon className="h-3 w-3 animate-spin" />
            Finalizing
          </span>
        )
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
            <CheckCircleIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Ready to Save
          </span>
        )
      case 'transferring':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-400/20 dark:text-cyan-300">
            <SpinnerIcon className="h-3 w-3 animate-spin" />
            Transferring
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-400/20 dark:text-green-300">
            <CheckCircleIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
            Completed
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-400/20 dark:text-rose-300">
            <AlertIcon className="h-3 w-3 text-rose-600 dark:text-rose-400" />
            Failed
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-400/10 dark:text-stone-400">
            Cancelled
          </span>
        )
      default:
        return null
    }
  }

  const isTerminal =
    job.status === 'ready' ||
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled'

  return (
    <div className="group relative rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-sm transition hover:shadow-md dark:border-white/[0.08] dark:bg-[#181915]">
      <div className="flex items-start gap-3">
        {/* Thumbnail or Icon */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
          {job.thumbnail ? (
            <img
              src={job.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-400 dark:text-stone-500">
              {job.job_type === 'trim' ? (
                <ScissorsIcon className="h-6 w-6 text-amber-500" />
              ) : (
                <DownloadIcon className="h-6 w-6 text-amber-500" />
              )}
            </div>
          )}
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.2 text-[9px] font-mono font-bold uppercase tracking-wider text-white">
            {job.format}
          </span>
        </div>

        {/* Content & Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100">
              {job.title}
            </h4>
            <button
              type="button"
              onClick={() => onDismiss(job.job_id)}
              className="shrink-0 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition"
              title="Dismiss job"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {getStatusBadge()}
            {job.uploader && (
              <span className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                {job.uploader}
              </span>
            )}
          </div>

          {/* Real-time Progress Bar */}
          {!isTerminal || job.status === 'ready' || job.client_transfer_status === 'saving' ? (
            <div className="mt-2.5">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                {isIndeterminate ? (
                  <div className="absolute inset-0 h-full w-2/5 animate-[shimmer_1.5s_infinite] rounded-full bg-amber-500/80" />
                ) : (
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-200 dark:bg-amber-400"
                    style={{ width: `${percentNumber || 0}%` }}
                  />
                )}
              </div>

              {/* Progress Telemetry */}
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                <span className="truncate font-sans font-medium text-stone-600 dark:text-stone-300">
                  {job.current_message}
                </span>
                <div className="shrink-0 flex items-center gap-1.5 font-mono text-[10px]">
                  {job.downloaded_bytes > 0 && (
                    <span>
                      {formatFileSize(job.downloaded_bytes)}
                      {job.total_bytes ? ` / ${formatFileSize(job.total_bytes)}` : ''}
                    </span>
                  )}
                  {speedFormatted && <span>&middot; {speedFormatted}</span>}
                  {etaFormatted && <span>&middot; {etaFormatted}</span>}
                </div>
              </div>
            </div>
          ) : null}

          {/* User-facing error message */}
          {job.status === 'failed' && job.user_facing_error && (
            <div className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
              <div className="flex items-start gap-1.5">
                <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{job.user_facing_error}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-2.5 flex items-center gap-2">
            {job.status === 'ready' && (
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-stone-950 shadow-sm hover:bg-amber-400 active:scale-95 transition disabled:opacity-50"
              >
                {isSaving ? (
                  <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadIcon className="h-3.5 w-3.5" />
                )}
                <span>Save to Device</span>
              </button>
            )}

            {!isTerminal && (
              <button
                type="button"
                onClick={() => onCancel(job.job_id)}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 transition"
              >
                Cancel
              </button>
            )}

            {job.status === 'failed' && (
              <button
                type="button"
                onClick={() => onRetry(job.job_id)}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 hover:bg-amber-500/25 transition"
              >
                Retry
              </button>
            )}

            {job.status === 'completed' && job.download_token && (
              <button
                type="button"
                onClick={handleSaveClick}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 transition"
              >
                <DownloadIcon className="h-3 w-3" />
                Download Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

