import { useState } from 'react'
import { formatDuration, prepareDownload, triggerBrowserNativeDownload } from '../lib/media'
import { fetchPlaylistInfo } from '../lib/playlist'
import type { PlaylistData, TrackItem } from '../lib/types'
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
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

  // Batch download state
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentTitle: string } | null>(null)

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
      // By default select all tracks
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
    setBatchProgress({ current: 0, total: selectedTracks.length, currentTitle: '' })

    for (let i = 0; i < selectedTracks.length; i++) {
      const track = selectedTracks[i]
      setBatchProgress({ current: i + 1, total: selectedTracks.length, currentTitle: track.title })

      try {
        const prep = await prepareDownload(track.url, 'mp3', 'best')
        triggerBrowserNativeDownload(prep.token, prep.filename)
        // Give a brief window between downloads so browser doesn't block multi-downloads
        await new Promise((r) => setTimeout(r, 600))
      } catch (err) {
        console.error(`Failed downloading ${track.title}:`, err)
      }
    }

    setIsBatchDownloading(false)
    setBatchProgress(null)
  }

  const handleAddSelectedToCollection = () => {
    if (!playlist) return
    const selectedTracks = playlist.tracks.filter((t) => selectedIds.has(t.id))
    onAddMultipleToCollection(selectedTracks)
  }

  return (
    <div className="space-y-8">
      {/* URL Input Form */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10 shadow-glass">
        <form onSubmit={handleFetchPlaylist}>
          <label htmlFor="playlist-url" className="text-xs font-bold uppercase tracking-wider text-lychee-ink/70">
            YouTube or YouTube Music Playlist URL
          </label>

          <div className="relative mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <LinkIcon className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-lychee-seed-500" />
              <input
                id="playlist-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
                className="focus-ring h-14 sm:h-16 w-full rounded-2xl border border-white/70 bg-white/80 pl-14 pr-12 text-base sm:text-lg text-lychee-ink placeholder:text-lychee-ink/35 transition hover:bg-white/95 focus:bg-white shadow-sm"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-lychee-ink/40 hover:bg-lychee-membrane-100 hover:text-lychee-ink"
                  aria-label="Clear URL"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="focus-ring inline-flex h-14 sm:h-16 items-center justify-center gap-2.5 rounded-2xl bg-lychee-shell px-8 text-base font-bold text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? (
                <SpinnerIcon className="h-5 w-5 animate-spin text-white" />
              ) : (
                <LinkIcon className="h-5 w-5" />
              )}
              <span>{isLoading ? 'Loading…' : 'Load Playlist'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="animate-fade-in mt-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm font-medium text-rose-800">
            <AlertIcon className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Playlist Content View */}
      {playlist && (
        <section aria-label="Playlist Content" className="glass-panel rounded-3xl p-6 sm:p-10 shadow-glass">
          {/* Playlist Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-lychee-border/40 pb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-lychee-ink">{playlist.title}</h2>
              <p className="text-sm font-medium text-lychee-seed-500 mt-0.5">
                {playlist.uploader} &middot; {playlist.track_count} tracks
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="rounded-2xl border border-white/80 bg-white/80 px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-bold text-lychee-seed-700 shadow-glass hover:bg-white transition active:scale-95"
              >
                {selectedIds.size === playlist.tracks.length ? 'Deselect All' : 'Select All'}
              </button>

              <button
                type="button"
                onClick={handleAddSelectedToCollection}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-bold text-lychee-seed-700 shadow-glass hover:bg-white transition active:scale-95 disabled:opacity-40"
              >
                <CollectionIcon className="h-4 w-4 text-lychee-shell" />
                <span>Collect ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={handleBatchDownload}
                disabled={selectedIds.size === 0 || isBatchDownloading}
                className="inline-flex items-center gap-2 rounded-2xl bg-lychee-shell px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold text-white shadow-soft hover:bg-lychee-shell-600 transition active:scale-95 disabled:opacity-40"
              >
                {isBatchDownloading ? (
                  <SpinnerIcon className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
                <span>Download ({selectedIds.size})</span>
              </button>
            </div>
          </div>

          {/* Batch Progress Bar */}
          {batchProgress && (
            <div className="animate-fade-in my-5 rounded-2xl border border-lychee-border/60 bg-lychee-membrane-100/80 p-4 text-sm font-semibold">
              <div className="flex justify-between text-lychee-ink">
                <span>Downloading: {batchProgress.currentTitle}</span>
                <span>
                  {batchProgress.current} / {batchProgress.total}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-lychee-border/40">
                <div
                  className="h-full bg-lychee-shell transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Track List */}
          <div className="mt-5 divide-y divide-lychee-border/30">
            {playlist.tracks.map((track, idx) => {
              const isSelected = selectedIds.has(track.id)
              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-4 py-3.5 transition hover:bg-white/50 rounded-2xl px-3 -mx-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTrack(track.id)}
                      className="h-5 w-5 rounded-md border-lychee-border text-lychee-shell accent-lychee-shell focus:ring-lychee-shell"
                      aria-label={`Select ${track.title}`}
                    />
                    <span className="w-6 text-center text-xs font-bold text-lychee-seed-500">
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
                      className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl object-cover shadow-sm"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-lychee-ink">{track.title}</p>
                      <p className="truncate text-xs sm:text-sm font-medium text-lychee-seed-500">
                        {track.artist} {track.duration ? `· ${formatDuration(track.duration)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="rounded-xl p-2.5 text-lychee-shell hover:bg-lychee-shell-50 transition active:scale-95"
                      title="Play track"
                    >
                      <PlayIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadTrack(track)}
                      className="rounded-xl p-2.5 text-lychee-seed-700 hover:bg-lychee-membrane-100 transition active:scale-95"
                      title="Download track"
                    >
                      <DownloadIcon className="h-5 w-5" />
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

