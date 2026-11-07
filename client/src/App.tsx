import { useEffect, useMemo, useRef, useState } from 'react'
import { CollectionDrawer } from './components/CollectionDrawer'
import { DiscoverView } from './components/DiscoverView'
import { MediaPlayer } from './components/MediaPlayer'
import { PlaylistView } from './components/PlaylistView'
import { Select } from './components/Select'
import { TrimPanel } from './components/TrimPanel'
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  CollectionIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  LycheeMark,
  ScissorsIcon,
  SearchIcon,
  SpinnerIcon,
  UserIcon,
} from './components/icons'
import {
  type MediaFormat,
  defaultQualityFor,
  fetchMediaInfo,
  formatDuration,
  formatFileSize,
  isYouTubeUrl,
  mp3Qualities,
  mp4Qualities,
  prepareDownload,
  qualityLabel,
  triggerBrowserNativeDownload,
} from './lib/media'
import type { NavTab, TrackItem } from './lib/types'

type ProcessState = 'idle' | 'fetching_info' | 'preparing' | 'completed' | 'error'

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('download')

  // Download view state
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<MediaFormat>('mp4')
  const [quality, setQuality] = useState<string>(() => defaultQualityFor('mp4'))
  const [status, setStatus] = useState<ProcessState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')

  // Loaded media preview metadata
  const [title, setTitle] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [uploader, setUploader] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [preparedSize, setPreparedSize] = useState<number | null>(null)

  // In-player active track state
  const [playingTrack, setPlayingTrack] = useState<{
    url: string
    title: string
    artist?: string
    thumbnail?: string
  } | null>(null)

  // Trimming panel state
  const [isTrimOpen, setIsTrimOpen] = useState(false)

  // Session-only Temporary Collection
  const [collection, setCollection] = useState<TrackItem[]>([])
  const [isCollectionOpen, setIsCollectionOpen] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const trimmedUrl = url.trim()
  const isUrlValid = useMemo(() => isYouTubeUrl(trimmedUrl), [trimmedUrl])
  const isBusy = status === 'fetching_info' || status === 'preparing'

  const qualityOptions = useMemo(() => {
    const source = format === 'mp4' ? mp4Qualities : mp3Qualities
    return source.map((opt) => ({ value: opt, label: qualityLabel(format, opt) }))
  }, [format])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const cancelActiveRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setStatus('idle')
    setStatusMessage('')
  }

  const resetMediaPreview = () => {
    setTitle('')
    setThumbnail('')
    setUploader('')
    setDuration(null)
    setPreparedSize(null)
    setIsTrimOpen(false)
  }

  const handleUrlChange = (newVal: string) => {
    setUrl(newVal)
    if (error) setError('')
    if (status === 'completed') setStatus('idle')

    if (isBusy) {
      cancelActiveRequest()
    }
    resetMediaPreview()
  }

  const handleClearUrl = () => {
    cancelActiveRequest()
    setUrl('')
    setError('')
    setStatus('idle')
    resetMediaPreview()
  }

  const handleFormatChange = (next: MediaFormat) => {
    setFormat(next)
    setQuality(defaultQualityFor(next))
    if (status === 'completed') setStatus('idle')
  }

  const handleFetchInfo = async () => {
    if (!trimmedUrl) {
      setError('Please paste a YouTube URL first.')
      return
    }

    if (!isUrlValid) {
      setError('Please enter a valid YouTube video or shorts URL.')
      return
    }

    cancelActiveRequest()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStatus('fetching_info')
    setStatusMessage('Reading YouTube metadata…')
    setError('')

    try {
      const data = await fetchMediaInfo(trimmedUrl, controller.signal)
      setTitle(data.title || '')
      setThumbnail(data.thumbnail || '')
      setUploader(data.uploader || '')
      setDuration(typeof data.duration === 'number' ? data.duration : null)
      setStatus('idle')
      setStatusMessage('')

      // Automatically configure in-player stream for instant preview
      setPlayingTrack({
        url: trimmedUrl,
        title: data.title || 'Loaded Media',
        artist: data.uploader || '',
        thumbnail: data.thumbnail || '',
      })
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      resetMediaPreview()
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not retrieve media details.')
    } finally {
      abortControllerRef.current = null
    }
  }

  const handleDownload = async () => {
    if (!trimmedUrl) {
      setError('Please paste a YouTube URL first.')
      return
    }

    if (!isUrlValid) {
      setError('Please enter a valid YouTube video or shorts URL.')
      return
    }

    cancelActiveRequest()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStatus('preparing')
    setStatusMessage(
      format === 'mp4'
        ? `Preparing video stream (${qualityLabel(format, quality)})…`
        : `Extracting audio (${qualityLabel(format, quality)})…`,
    )
    setError('')

    try {
      const prepared = await prepareDownload(trimmedUrl, format, quality, controller.signal)

      if (prepared.filesize) {
        setPreparedSize(prepared.filesize)
      }

      setStatusMessage('Media prepared. Initiating browser stream…')
      triggerBrowserNativeDownload(prepared.token, prepared.filename)

      setStatus('completed')
      setStatusMessage('Download started. Media will auto-expire from server.')
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Processing failed. Please check the URL or try another quality.')
    } finally {
      abortControllerRef.current = null
    }
  }

  // Collection management
  const addToCollection = (track: TrackItem) => {
    setCollection((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev
      return [...prev, track]
    })
  }

  const addMultipleToCollection = (tracks: TrackItem[]) => {
    setCollection((prev) => {
      const existingIds = new Set(prev.map((t) => t.id))
      const novel = tracks.filter((t) => !existingIds.has(t.id))
      return [...prev, ...novel]
    })
  }

  const removeFromCollection = (id: string) => {
    setCollection((prev) => prev.filter((t) => t.id !== id))
  }

  const clearCollection = () => {
    setCollection([])
  }

  // Cross-view playback & download triggers
  const handlePlayTrackFromExternal = (track: TrackItem) => {
    setPlayingTrack({
      url: track.url,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDownloadTrackFromExternal = async (track: TrackItem) => {
    try {
      const prep = await prepareDownload(track.url, 'mp3', 'best')
      triggerBrowserNativeDownload(prep.token, prep.filename)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between px-4 py-8 font-sans sm:px-8 lg:px-12">
      {/* Top Header & Navigation */}
      <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between pb-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <LycheeMark className="h-10 w-10 shrink-0 drop-shadow-sm transition-transform hover:scale-105" />
          <span className="font-display text-2xl font-black tracking-tight text-lychee-ink sm:text-3xl">
            Lychee
          </span>
        </div>

        {/* Primary Three-Item Navigation */}
        <nav
          aria-label="Main Navigation"
          className="flex items-center rounded-2xl border border-white/80 bg-white/80 p-1.5 shadow-glass backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={() => setActiveTab('download')}
            className={`rounded-xl px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-bold transition ${
              activeTab === 'download'
                ? 'bg-lychee-shell text-white shadow-sm'
                : 'text-lychee-ink/75 hover:bg-white/60 hover:text-lychee-ink'
            }`}
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`rounded-xl px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-bold transition ${
              activeTab === 'discover'
                ? 'bg-lychee-shell text-white shadow-sm'
                : 'text-lychee-ink/75 hover:bg-white/60 hover:text-lychee-ink'
            }`}
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('playlists')}
            className={`rounded-xl px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-bold transition ${
              activeTab === 'playlists'
                ? 'bg-lychee-shell text-white shadow-sm'
                : 'text-lychee-ink/75 hover:bg-white/60 hover:text-lychee-ink'
            }`}
          >
            Playlists
          </button>
        </nav>

        {/* Temporary Collection Drawer trigger */}
        <button
          type="button"
          onClick={() => setIsCollectionOpen(true)}
          className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/80 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base font-bold text-lychee-seed-700 shadow-glass backdrop-blur-xl transition hover:bg-white active:scale-95"
          title="Open session collection"
        >
          <CollectionIcon className="h-5 w-5 text-lychee-shell" />
          <span className="hidden sm:inline">Collection</span>
          {collection.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lychee-shell text-xs font-bold text-white">
              {collection.length}
            </span>
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto my-auto w-full max-w-[1400px]">
        {/* Global Floating Player (when a track is selected for preview) */}
        {playingTrack && (
          <div className="mb-8">
            <div className="flex items-center justify-between pb-2 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-lychee-seed-500">
                Now Playing
              </span>
              <button
                type="button"
                onClick={() => {
                  setPlayingTrack(null)
                  setIsTrimOpen(false)
                }}
                className="text-xs font-bold text-lychee-ink/50 hover:text-lychee-shell transition"
              >
                Close Player
              </button>
            </div>
            <MediaPlayer
              url={playingTrack.url}
              title={playingTrack.title}
              artist={playingTrack.artist}
              thumbnail={playingTrack.thumbnail}
              onTrimRequested={() => setIsTrimOpen(!isTrimOpen)}
              onDownloadRequested={() => {
                if (url !== playingTrack.url) {
                  setUrl(playingTrack.url)
                  setActiveTab('download')
                }
                handleDownload()
              }}
              onAddToCollection={() =>
                addToCollection({
                  id: playingTrack.url,
                  title: playingTrack.title,
                  artist: playingTrack.artist || 'Artist',
                  thumbnail: playingTrack.thumbnail,
                  url: playingTrack.url,
                })
              }
              isTrimOpen={isTrimOpen}
            />

            {/* Trimming Panel (opens immediately below player when Trim is clicked) */}
            {isTrimOpen && (
              <TrimPanel
                url={playingTrack.url}
                duration={duration}
                onClose={() => setIsTrimOpen(false)}
              />
            )}
          </div>
        )}

        {/* Tab 1: Download Screen */}
        {activeTab === 'download' && (
          <div className="grid gap-8 lg:grid-cols-[1.18fr_0.82fr]">
            {/* Action Panel */}
            <section
              aria-label="Media Downloader Controls"
              className="glass-panel rounded-3xl p-6 sm:p-10 shadow-glass"
            >
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-lychee-ink">
                  Downloader
                </h1>
              </div>

              {/* URL Input */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <label htmlFor="media-url" className="text-xs font-bold uppercase tracking-wider text-lychee-ink/70">
                    YouTube URL
                  </label>
                  {trimmedUrl && (
                    <span
                      className={`text-xs font-semibold transition ${
                        isUrlValid ? 'text-emerald-700' : 'text-lychee-shell'
                      }`}
                    >
                      {isUrlValid ? 'Valid Link' : 'Invalid Link'}
                    </span>
                  )}
                </div>

                <div className="relative mt-2">
                  <LinkIcon className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-lychee-seed-500" />
                  <input
                    id="media-url"
                    type="url"
                    autoComplete="off"
                    spellCheck="false"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isBusy) {
                        e.preventDefault()
                        if (!title) {
                          handleFetchInfo()
                        } else {
                          handleDownload()
                        }
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="focus-ring h-14 sm:h-16 w-full rounded-2xl border border-white/70 bg-white/80 pl-14 pr-12 text-base sm:text-lg text-lychee-ink placeholder:text-lychee-ink/35 transition hover:bg-white/95 focus:bg-white shadow-sm"
                  />
                  {url && (
                    <button
                      type="button"
                      onClick={handleClearUrl}
                      aria-label="Clear URL"
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-lychee-ink/40 hover:bg-lychee-membrane-100 hover:text-lychee-ink"
                    >
                      <CloseIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Format & Quality Configuration */}
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-lychee-ink/70">
                    Format
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Media Format"
                    className="glass-card mt-2 grid h-14 sm:h-16 grid-cols-2 gap-2 rounded-2xl p-1.5"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={format === 'mp4'}
                      onClick={() => handleFormatChange('mp4')}
                      className={`focus-ring flex items-center justify-center rounded-xl text-base font-bold transition ${
                        format === 'mp4'
                          ? 'bg-lychee-shell text-white shadow-sm'
                          : 'text-lychee-ink/75 hover:bg-white/60 hover:text-lychee-ink'
                      }`}
                    >
                      MP4 Video
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={format === 'mp3'}
                      onClick={() => handleFormatChange('mp3')}
                      className={`focus-ring flex items-center justify-center rounded-xl text-base font-bold transition ${
                        format === 'mp3'
                          ? 'bg-lychee-shell text-white shadow-sm'
                          : 'text-lychee-ink/75 hover:bg-white/60 hover:text-lychee-ink'
                      }`}
                    >
                      MP3 Audio
                    </button>
                  </div>
                </div>

                <Select
                  label="Target Quality"
                  value={quality}
                  options={qualityOptions}
                  onChange={(val) => {
                    setQuality(val)
                    if (status === 'completed') setStatus('idle')
                  }}
                  disabled={isBusy}
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
                <button
                  type="button"
                  onClick={handleFetchInfo}
                  disabled={!trimmedUrl || isBusy}
                  className="focus-ring inline-flex h-14 sm:h-16 items-center justify-center gap-2.5 rounded-2xl border border-white/80 bg-white/80 px-6 text-base font-bold text-lychee-seed-700 shadow-glass transition hover:bg-white hover:text-lychee-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === 'fetching_info' ? (
                    <SpinnerIcon className="h-5 w-5 animate-spin text-lychee-shell" />
                  ) : (
                    <SearchIcon className="h-5 w-5" />
                  )}
                  <span>{status === 'fetching_info' ? 'Checking…' : 'Load Details'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!trimmedUrl || isBusy}
                  className="focus-ring inline-flex h-14 sm:h-16 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-lychee-shell px-8 text-base sm:text-lg font-bold text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95 active:bg-lychee-shell-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === 'preparing' ? (
                    <SpinnerIcon className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <DownloadIcon className="h-5 w-5" />
                  )}
                  <span>
                    {status === 'preparing'
                      ? 'Processing…'
                      : format === 'mp4'
                        ? 'Download MP4'
                        : 'Download MP3'}
                  </span>
                </button>

                {title && (
                  <button
                    type="button"
                    onClick={() => setIsTrimOpen(!isTrimOpen)}
                    className="focus-ring inline-flex h-14 sm:h-16 items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-5 text-sm sm:text-base font-bold text-lychee-seed-700 shadow-glass hover:bg-white active:scale-95"
                    title="Trim media clip"
                  >
                    <ScissorsIcon className="h-5 w-5 text-lychee-shell" />
                    <span>Trim</span>
                  </button>
                )}

                {isBusy && (
                  <button
                    type="button"
                    onClick={cancelActiveRequest}
                    className="focus-ring inline-flex h-14 sm:h-16 items-center justify-center rounded-2xl border border-lychee-border bg-white/80 px-5 text-sm font-bold text-lychee-seed-700 transition hover:bg-white active:scale-95"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Status updates / Active progress banner */}
              {statusMessage && (
                <div
                  className={`animate-fade-in mt-5 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold ${
                    status === 'completed'
                      ? 'border border-emerald-200 bg-emerald-50/80 text-emerald-800'
                      : 'border border-lychee-border bg-lychee-membrane-100/80 text-lychee-seed-700'
                  }`}
                >
                  {status === 'completed' ? (
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <SpinnerIcon className="h-5 w-5 shrink-0 animate-spin text-lychee-shell" />
                  )}
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="animate-fade-in mt-5 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-800"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    aria-label="Dismiss error"
                    className="text-rose-500 hover:text-rose-700"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Trimming Panel (when toggled from download view) */}
              {isTrimOpen && trimmedUrl && (
                <TrimPanel
                  url={trimmedUrl}
                  duration={duration}
                  onClose={() => setIsTrimOpen(false)}
                />
              )}
            </section>

            {/* Media Preview Card */}
            <aside
              aria-label="Media Preview"
              className="glass-panel flex flex-col justify-between rounded-3xl p-6 sm:p-10 shadow-glass"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-lychee-ink/70">
                    Preview
                  </span>
                  {duration !== null && (
                    <span className="rounded-xl bg-lychee-membrane-100 px-3 py-1 text-xs font-bold text-lychee-seed-700">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>

                {thumbnail ? (
                  <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl border border-white/60 bg-black/10 shadow-md">
                    <img
                      src={thumbnail}
                      onError={(e) => {
                        const vid = trimmedUrl.includes('v=')
                          ? trimmedUrl.split('v=')[1]?.split('&')[0]
                          : trimmedUrl.split('/').pop()
                        if (vid) {
                          e.currentTarget.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
                        }
                      }}
                      alt={title || 'Media thumbnail'}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="glass-card mt-5 flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-lychee-border text-center text-sm font-medium text-lychee-ink/40">
                    <ImageIcon className="h-10 w-10 text-lychee-seed-300" />
                    <span>Ready for media</span>
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  <div>
                    <h3 className="line-clamp-2 text-base sm:text-lg font-bold text-lychee-ink">
                      {title || 'No media loaded'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="glass-card rounded-2xl p-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-lychee-seed-500">
                        <UserIcon className="h-3.5 w-3.5" />
                        Channel
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-lychee-ink">
                        {uploader || '—'}
                      </p>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-lychee-seed-500">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {preparedSize ? 'Size' : 'Duration'}
                      </div>
                      <p className="mt-1 text-sm font-bold text-lychee-ink">
                        {preparedSize ? formatFileSize(preparedSize) : formatDuration(duration)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Tab 2: Lychee Discover Screen */}
        {activeTab === 'discover' && (
          <DiscoverView
            onPlayTrack={handlePlayTrackFromExternal}
            onDownloadTrack={handleDownloadTrackFromExternal}
            onAddToCollection={addToCollection}
          />
        )}

        {/* Tab 3: Playlists Screen */}
        {activeTab === 'playlists' && (
          <PlaylistView
            onPlayTrack={handlePlayTrackFromExternal}
            onDownloadTrack={handleDownloadTrackFromExternal}
            onAddMultipleToCollection={addMultipleToCollection}
          />
        )}
      </main>

      {/* Floating Temporary Collection Drawer */}
      <CollectionDrawer
        collection={collection}
        isOpen={isCollectionOpen}
        onClose={() => setIsCollectionOpen(false)}
        onPlayTrack={handlePlayTrackFromExternal}
        onRemoveTrack={removeFromCollection}
        onClearCollection={clearCollection}
        onDownloadTrack={handleDownloadTrackFromExternal}
      />

      {/* Clean Modern Minimal Footer */}
      <footer className="mx-auto mt-12 flex w-full max-w-[1400px] items-center justify-between border-t border-lychee-border/25 pt-6 text-sm text-lychee-seed-500/80">
        <div className="flex items-center gap-2 font-display text-sm font-bold text-lychee-ink/70">
          <LycheeMark className="h-5 w-5" />
          <span>Lychee</span>
        </div>
        <span className="text-xs text-lychee-ink/40 font-medium">Ephemeral Media Utility</span>
      </footer>
    </div>
  )
}
