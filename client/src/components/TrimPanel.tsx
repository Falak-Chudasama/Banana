import { useState } from 'react'
import {
  formatDuration,
  formatFileSize,
  processTrim,
  triggerBrowserNativeDownload,
} from '../lib/media'
import type { MediaFormat, PreparedDownload } from '../lib/types'
import {
  AlertIcon,
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  ScissorsIcon,
  SpinnerIcon,
} from './icons'

interface TrimPanelProps {
  url: string
  duration: number | null
  onClose: () => void
}

function parseSeconds(input: string): number {
  if (!input) return 0
  const parts = input.split(':').map((p) => parseFloat(p.trim()))
  if (parts.some((p) => Number.isNaN(p))) return 0

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return parts[0] || 0
}

function toTimeString(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(s / 60)
  const remSecs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`
}

export function TrimPanel({ url, duration, onClose }: TrimPanelProps) {
  const maxDuration = duration && duration > 0 ? duration : 3600

  const [format, setFormat] = useState<MediaFormat>('mp3')
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(() => Math.min(60, maxDuration))
  const [startInput, setStartInput] = useState(() => toTimeString(0))
  const [endInput, setEndInput] = useState(() => toTimeString(Math.min(60, maxDuration)))

  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState<PreparedDownload | null>(null)

  const selectedDuration = Math.max(0, endTime - startTime)

  const handleStartInputChange = (val: string) => {
    setStartInput(val)
    const secs = parseSeconds(val)
    if (secs >= 0 && secs < endTime) {
      setStartTime(secs)
      setError('')
    }
  }

  const handleEndInputChange = (val: string) => {
    setEndInput(val)
    const secs = parseSeconds(val)
    if (secs > startTime && secs <= maxDuration) {
      setEndTime(secs)
      setError('')
    }
  }

  const handleSliderStart = (val: number) => {
    const clamped = Math.min(val, endTime - 1)
    setStartTime(clamped)
    setStartInput(toTimeString(clamped))
  }

  const handleSliderEnd = (val: number) => {
    const clamped = Math.max(val, startTime + 1)
    setEndTime(clamped)
    setEndInput(toTimeString(clamped))
  }

  const handleProcessTrim = async () => {
    if (startTime < 0 || endTime <= startTime) {
      setError('Start time must be before end time.')
      return
    }

    setIsProcessing(true)
    setError('')
    setPrepared(null)

    try {
      const res = await processTrim(url, format, startTime, endTime)
      setPrepared(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Trimming failed. Please check inputs.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="animate-fade-in mt-6 rounded-2xl border border-black/[0.06] bg-white p-6 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]">
      <div className="flex items-center justify-between pb-4 border-b border-stone-200/80 dark:border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400">
            <ScissorsIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-sans text-base font-bold text-stone-900 dark:text-stone-50">Trim Media Clip</h4>
            <p className="text-xs text-stone-500 dark:text-stone-400">Export a custom excerpt from this track</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200 transition"
          aria-label="Close trim panel"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Sliders and Range preview */}
      <div className="space-y-4 py-4">
        <div className="rounded-xl border border-stone-200/70 bg-stone-50/70 p-4 sm:p-5 dark:border-white/[0.06] dark:bg-[#1C1D18]">
          <div className="flex justify-between text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">
            <span>Selected Clip: {formatDuration(selectedDuration)}</span>
            <span className="text-stone-500 dark:text-stone-400 font-medium">Source Duration: {formatDuration(maxDuration)}</span>
          </div>

          <div className="relative mt-3.5 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                <span>Start Marker</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">{toTimeString(startTime)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={maxDuration}
                step={1}
                value={startTime}
                onChange={(e) => handleSliderStart(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-amber-500 dark:accent-amber-400"
                aria-label="Start Marker"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                <span>End Marker</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">{toTimeString(endTime)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={maxDuration}
                step={1}
                value={endTime}
                onChange={(e) => handleSliderEnd(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-amber-500 dark:accent-amber-400"
                aria-label="End Marker"
              />
            </div>
          </div>
        </div>

        {/* Exact timestamp inputs and Format */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Start (mm:ss)
            </label>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleStartInputChange(e.target.value)}
              placeholder="00:00"
              className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-stone-200/90 bg-white px-3.5 font-mono text-sm text-stone-900 shadow-2xs dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              End (mm:ss)
            </label>
            <input
              type="text"
              value={endInput}
              onChange={(e) => handleEndInputChange(e.target.value)}
              placeholder="01:00"
              className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-stone-200/90 bg-white px-3.5 font-mono text-sm text-stone-900 shadow-2xs dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Format
            </label>
            <div className="mt-1.5 grid h-11 grid-cols-2 gap-1 rounded-xl border border-stone-200/90 bg-stone-100/70 p-1 dark:border-white/[0.08] dark:bg-[#1C1D18]">
              <button
                type="button"
                onClick={() => setFormat('mp3')}
                className={`focus-ring rounded-lg text-xs font-bold transition ${
                  format === 'mp3'
                    ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                MP3 Audio
              </button>
              <button
                type="button"
                onClick={() => setFormat('mp4')}
                className={`focus-ring rounded-lg text-xs font-bold transition ${
                  format === 'mp4'
                    ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                MP4 Video
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action / Trigger */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 dark:border-white/[0.08] pt-4">
        <span className="text-xs sm:text-sm font-medium text-stone-500 dark:text-stone-400">
          Clip Duration: <strong className="text-stone-900 dark:text-stone-100 font-bold">{formatDuration(selectedDuration)}</strong>
        </span>

        <button
          type="button"
          onClick={handleProcessTrim}
          disabled={isProcessing || selectedDuration <= 0}
          className="focus-ring inline-flex h-11 sm:h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-sm font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
        >
          {isProcessing ? (
            <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
          ) : (
            <ScissorsIcon className="h-4 w-4" />
          )}
          <span>{isProcessing ? 'Trimming Clip…' : 'Export Trimmed Clip'}</span>
        </button>
      </div>

      {/* Success banner */}
      {prepared && (
        <div className="animate-fade-in mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/40 dark:bg-emerald-950/40 p-3.5 text-sm text-emerald-900 dark:text-emerald-200 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <p className="truncate font-bold">{prepared.filename}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Ready · {formatFileSize(prepared.filesize)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => triggerBrowserNativeDownload(prepared.token, prepared.filename)}
            className="focus-ring shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition active:scale-95"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            <span>Download</span>
          </button>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="animate-fade-in mt-3.5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
          <AlertIcon className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
