import React from 'react'
import type { JobRecord } from '../../lib/jobTypes'
import { DownloadItem } from './DownloadItem'
import { CloseIcon, DownloadIcon, TrashIcon } from '../icons'

interface DownloadQueueProps {
  jobs: JobRecord[]
  isOpen: boolean
  onClose: () => void
  onSave: (jobId: string) => Promise<boolean | void>
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onDismiss: (jobId: string) => void
  onClearCompleted: () => void
}

export function DownloadQueue({
  jobs,
  isOpen,
  onClose,
  onSave,
  onCancel,
  onRetry,
  onDismiss,
  onClearCompleted,
}: DownloadQueueProps) {
  if (!isOpen) return null

  const activeCount = jobs.filter(
    (j) =>
      j.status !== 'completed' &&
      j.status !== 'failed' &&
      j.status !== 'cancelled',
  ).length

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md transform border-l border-black/[0.08] bg-[#F8F9F5] shadow-2xl transition-all dark:border-white/[0.08] dark:bg-[#121310] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400">
                <DownloadIcon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-sans text-base font-bold text-stone-900 dark:text-stone-50">
                  Downloads
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {activeCount > 0
                    ? `${activeCount} active operation${activeCount > 1 ? 's' : ''}`
                    : 'All downloads up to date'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {jobs.some((j) => j.status === 'completed' || j.status === 'cancelled') && (
                <button
                  type="button"
                  onClick={onClearCompleted}
                  className="rounded-lg p-1.5 text-xs font-medium text-stone-500 hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-800 transition"
                  title="Clear completed downloads"
                >
                  Clear Completed
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition"
                title="Close drawer"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Jobs List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {jobs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400">
                  <DownloadIcon className="h-7 w-7" />
                </div>
                <h4 className="mt-4 font-sans text-sm font-semibold text-stone-800 dark:text-stone-200">
                  No active downloads
                </h4>
                <p className="mt-1 max-w-xs text-xs text-stone-500 dark:text-stone-400">
                  When you initiate a media download or audio trim, real-time progress and stream controls will appear here.
                </p>
              </div>
            ) : (
              jobs.map((job) => (
                <DownloadItem
                  key={job.job_id}
                  job={job}
                  onSave={onSave}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onDismiss={onDismiss}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

