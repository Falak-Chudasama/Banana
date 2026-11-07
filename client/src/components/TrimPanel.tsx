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
    <div className="animate-fade-in glass-panel mt-6 rounded-3xl border border-white/80 p-6 sm:p-7 shadow-glass">
      <div className="flex items-center justify-between pb-4 border-b border-lychee-border/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lychee-shell/10 text-lychee-shell">
            <ScissorsIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-lychee-ink">Trim Media</h4>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-lychee-ink/40 hover:bg-lychee-membrane-100 hover:text-lychee-ink transition"
          aria-label="Close trim panel"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Sliders and Range preview */}
      <div className="space-y-5 py-4">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-glass">
          <div className="flex justify-between text-sm font-bold text-lychee-ink">
            <span>Selection: {formatDuration(selectedDuration)}</span>
            <span className="text-lychee-seed-500">Max: {formatDuration(maxDuration)}</span>
          </div>

          <div className="relative mt-4 flex flex-col gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-lychee-seed-500">
              Start Marker ({toTimeString(startTime)})
            </label>
            <input
              type="range"
              min={0}
              max={maxDuration}
              step={1}
              value={startTime}
              onChange={(e) => handleSliderStart(parseFloat(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-lychee-border/50 accent-lychee-shell"
            />

            <label className="mt-2 text-xs font-bold uppercase tracking-wider text-lychee-seed-500">
              End Marker ({toTimeString(endTime)})
            </label>
            <input
              type="range"
              min={0}
              max={maxDuration}
              step={1}
              value={endTime}
              onChange={(e) => handleSliderEnd(parseFloat(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-lychee-border/50 accent-lychee-shell"
            />
          </div>
        </div>

        {/* Exact timestamp inputs and Format */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-lychee-ink/70">Start (mm:ss)</label>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleStartInputChange(e.target.value)}
              placeholder="00:00"
              className="focus-ring mt-1.5 h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-lychee-ink shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-lychee-ink/70">End (mm:ss)</label>
            <input
              type="text"
              value={endInput}
              onChange={(e) => handleEndInputChange(e.target.value)}
              placeholder="01:00"
              className="focus-ring mt-1.5 h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-lychee-ink shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-lychee-ink/70">Clip Format</label>
            <div className="mt-1.5 grid h-12 grid-cols-2 gap-1.5 rounded-2xl border border-lychee-border/50 bg-lychee-membrane-100 p-1">
              <button
                type="button"
                onClick={() => setFormat('mp3')}
                className={`rounded-xl text-xs sm:text-sm font-bold transition ${
                  format === 'mp3' ? 'bg-lychee-shell text-white shadow-sm' : 'text-lychee-ink hover:bg-white/60'
                }`}
              >
                MP3 Audio
              </button>
              <button
                type="button"
                onClick={() => setFormat('mp4')}
                className={`rounded-xl text-xs sm:text-sm font-bold transition ${
                  format === 'mp4' ? 'bg-lychee-shell text-white shadow-sm' : 'text-lychee-ink hover:bg-white/60'
                }`}
              >
                MP4 Video
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action / Trigger */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-lychee-border/30 pt-4">
        <span className="text-sm font-medium text-lychee-seed-500">
          Duration: <strong className="text-lychee-ink font-bold">{formatDuration(selectedDuration)}</strong>
        </span>

        <button
          type="button"
          onClick={handleProcessTrim}
          disabled={isProcessing || selectedDuration <= 0}
          className="focus-ring inline-flex h-12 sm:h-14 items-center justify-center gap-2.5 rounded-2xl bg-lychee-shell px-7 text-sm sm:text-base font-bold text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? (
            <SpinnerIcon className="h-5 w-5 animate-spin text-white" />
          ) : (
            <ScissorsIcon className="h-5 w-5" />
          )}
          <span>{isProcessing ? 'Trimming Media…' : 'Export Trimmed Clip'}</span>
        </button>
      </div>

      {/* Success / Download ready banner */}
      {prepared && (
        <div className="animate-fade-in mt-5 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">{prepared.filename}</p>
              <p className="text-xs text-emerald-700">Size: {formatFileSize(prepared.filesize)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => triggerBrowserNativeDownload(prepared.token, prepared.filename)}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-800 transition active:scale-95"
          >
            <DownloadIcon className="h-4 w-4" />
            <span>Download</span>
          </button>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="animate-fade-in mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertIcon className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

