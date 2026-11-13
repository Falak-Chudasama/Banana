import { useState } from 'react'
import type { JobRecord } from '../lib/jobTypes'
import { formatDuration } from '../lib/media'
import { fetchPlaylistInfo } from '../lib/playlist'
import type { PlaylistData, TrackItem } from '../lib/types'
import { downloadManager } from '../services/downloadManager'
import {
  AlertIcon,
  CheckCircleIcon,
  CloseIcon,
  CollectionIcon,
  DownloadIcon,
  LinkIcon,
  PlayIcon,
  SpinnerIcon,
} from './icons'

interface PlaylistViewProps {
  onPlayTrack: (track: TrackItem) => void
  onDownloadTrack: (track: TrackItem) => void
  onAddMultipleToCollection: (tracks: TrackItem[]) => void
}

export function PlaylistView({
  onPlayTrack,
  onDownloadTrack,
  onAddMultipleToCollection,
}: PlaylistViewProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Batch download state powered by JobManager
  const [activeBatchJob, setActiveBatchJob] = useState<JobRecord | null>(null)
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)

  const handleFetchPlaylist = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!url.trim()) return

    setIsLoading(true)
    setError('')
    setPlaylist(null)
    setSelectedIds(new Set())

    try {
      const data = await fetchPlaylistInfo(url)
      setPlaylist(data)
      setSelectedIds(new Set(data.tracks.map((t) => t.id)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load playlist.')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSelectAll = () => {
    if (!playlist) return
    if (selectedIds.size === playlist.tracks.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(playlist.tracks.map((t) => t.id)))
    }
  }

  const toggleTrack = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleBatchDownload = async () => {
    if (!playlist) return
    const selectedTracks = playlist.tracks.filter((t) => selectedIds.has(t.id))
    if (selectedTracks.length === 0) return

    setIsBatchDownloading(true)
    setError('')

    try {
      const parentJob = await downloadManager.startPlaylistJob(
        url,
        'mp3',
        'best',
        selectedTracks.map((t) => t.id),
      )
      setActiveBatchJob(parentJob)

      const unsub = downloadManager.subscribe((jobs) => {
        const current = jobs.find((j) => j.job_id === parentJob.job_id)
        if (current) {
          setActiveBatchJob(current)
          if (
            current.status === 'completed' ||
            current.status === 'ready' ||
            current.status === 'failed' ||
            current.status === 'cancelled'
          ) {
            setIsBatchDownloading(false)
            unsub()
          }
        }
      })
    } catch (err: any) {
      setIsBatchDownloading(false)
      setError(err?.message || 'Failed to start batch playlist download.')
    }
  }

  const handleCancelBatch = async () => {
    if (activeBatchJob) {
      await downloadManager.cancelJob(activeBatchJob.job_id)
      setIsBatchDownloading(false)
    }
  }

  const handleAddSelectedToCollection = () => {
    if (!playlist) return
    const selectedTracks = playlist.tracks.filter((t) => selectedIds.has(t.id))
    onAddMultipleToCollection(selectedTracks)
  }

  return (
    <div className="space-y-6">
      {/* URL Input Form */}
      <section
        aria-label="Playlist Input Form"
        className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
      >
        <form onSubmit={handleFetchPlaylist}>
          <div className="flex items-center justify-between pb-2">
            <label
              htmlFor="playlist-url"
              className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400"
            >
              YouTube or YouTube Music Playlist URL
            </label>
          </div>

          <div className="relative mt-1.5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
              <input
                id="playlist-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
                className="focus-ring h-12 sm:h-13 w-full rounded-xl border border-stone-200/90 bg-stone-50/60 pl-11 pr-10 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 shadow-2xs transition hover:bg-stone-50 focus:bg-white dark:border-white/[0.08] dark:bg-[#121310]/70 dark:text-stone-100 dark:placeholder:text-stone-500 dark:hover:bg-[#121310] dark:focus:bg-[#121310]"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                  aria-label="Clear URL"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 sm:px-7 text-sm sm:text-base font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300 dark:disabled:bg-stone-800/80 dark:disabled:text-stone-600"
            >
              {isLoading ? (
                <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
              ) : (
                <LinkIcon className="h-4 w-4" />
              )}
              <span>{isLoading ? 'Loading…' : 'Load Playlist'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div
            role="alert"
            className="animate-fade-in mt-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/40 dark:bg-rose-950/40 p-3.5 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
          >
            <AlertIcon className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Playlist Content View */}
      {playlist && (
        <section
          aria-label="Playlist Content"
          className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
        >
          {/* Playlist Summary Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 dark:border-white/[0.08] pb-5">
            <div>
              <h2 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
                {playlist.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-stone-500 dark:text-stone-400 mt-1">
                {playlist.uploader} &middot; {playlist.track_count} tracks &middot; {selectedIds.size} selected
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="focus-ring rounded-xl border border-stone-200/90 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] transition active:scale-95"
              >
                {selectedIds.size === playlist.tracks.length ? 'Deselect All' : 'Select All'}
              </button>

              <button
                type="button"
                onClick={handleAddSelectedToCollection}
                disabled={selectedIds.size === 0}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-stone-200/90 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] transition active:scale-95 disabled:opacity-40"
              >
                <CollectionIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>Collect ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={handleBatchDownload}
                disabled={selectedIds.size === 0 || isBatchDownloading}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-soft hover:bg-amber-600 transition active:scale-95 disabled:opacity-40 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
              >
                {isBatchDownloading ? (
                  <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
                <span>Download ({selectedIds.size})</span>
              </button>
            </div>
          </div>

          {/* Batch Progress Bar */}
          {activeBatchJob && (
            <div className="animate-fade-in my-4 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/30 dark:bg-amber-950/20 p-4 text-xs sm:text-sm font-semibold">
              <div className="flex items-center justify-between text-stone-900 dark:text-stone-100">
                <span className="truncate pr-2">
                  {activeBatchJob.playlist_current_track_title
                    ? `Processing: ${activeBatchJob.playlist_current_track_title}`
                    : activeBatchJob.current_message}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-amber-700 dark:text-amber-400">
                    {activeBatchJob.playlist_current_track_index || 0} / {activeBatchJob.playlist_total_tracks || selectedIds.size}
                  </span>
                  {isBatchDownloading && (
                    <button
                      type="button"
                      onClick={handleCancelBatch}
                      className="rounded-md border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                <div
                  className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                  style={{ width: `${activeBatchJob.percent || 0}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-stone-500 dark:text-stone-400">
                <span>
                  {activeBatchJob.playlist_completed_tracks || 0} completed &middot; {activeBatchJob.playlist_failed_tracks || 0} failed
                </span>
                <span>{activeBatchJob.percent || 0}%</span>
              </div>
            </div>
          )}

          {/* Track List */}
          <div className="mt-4 divide-y divide-stone-100 dark:divide-white/[0.04]">
            {playlist.tracks.map((track, idx) => {
              const isSelected = selectedIds.has(track.id)
              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 py-3 px-2 rounded-xl transition hover:bg-stone-50 dark:hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTrack(track.id)}
                      className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 text-amber-500 accent-amber-500 dark:accent-amber-400 focus:ring-amber-500"
                      aria-label={`Select ${track.title}`}
                    />
                    <span className="w-5 text-center text-xs font-mono font-medium text-stone-400 dark:text-stone-500">
                      {idx + 1}
                    </span>
                    <img
                      src={
                        typeof track.thumbnail === 'string' && track.thumbnail.startsWith('http')
                          ? track.thumbnail
                          : `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`
                      }
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`
                      }}
                      alt={track.title}
                      className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-lg object-cover shadow-2xs"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{track.title}</p>
                      <p className="truncate text-xs font-medium text-stone-500 dark:text-stone-400">
                        {track.artist} {track.duration ? `· ${formatDuration(track.duration)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="focus-ring rounded-full p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10 transition active:scale-95"
                      title="Play track"
                      aria-label="Play track"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadTrack(track)}
                      className="focus-ring rounded-lg p-2 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10 transition active:scale-95"
                      title="Download track"
                      aria-label="Download track"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
