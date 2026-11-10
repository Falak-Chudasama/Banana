import { useEffect, useMemo, useRef, useState } from 'react'
import { CollectionDrawer } from './components/CollectionDrawer'
import { DiscoverView } from './components/DiscoverView'
import { MediaPlayer } from './components/MediaPlayer'
import { PlaylistView } from './components/PlaylistView'
import { SearchView } from './components/SearchView'
import { Select } from './components/Select'
import { TrimPanel } from './components/TrimPanel'
import {
  AlertIcon,
  BananaMark,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  CollectionIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  ListMusicIcon,
  MoonIcon,
  PlayIcon,
  ScissorsIcon,
  SearchIcon,
  SparklesIcon,
  SpinnerIcon,
  SunIcon,
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
import type { NavTab, TrackItem, VideoSearchResult } from './lib/types'

type ProcessState = 'idle' | 'fetching_info' | 'preparing' | 'completed' | 'error'

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('download')

  // Dark/Light theme state - default dark
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('banana_theme')
      if (saved === 'light' || saved === 'dark') return saved
    }
    return 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem('banana_theme', theme)
    } catch {}

    const meta = document.getElementById('meta-theme-color')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#121310' : '#F8F9F5')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

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
    format?: 'audio' | 'video'
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
      setError('Please enter a YouTube video or music link first.')
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
    setStatusMessage('Retrieving media details from YouTube…')
    setError('')

    try {
      const data = await fetchMediaInfo(trimmedUrl, controller.signal)
      setTitle(data.title || '')
      setThumbnail(data.thumbnail || '')
      setUploader(data.uploader || '')
      setDuration(typeof data.duration === 'number' ? data.duration : null)
      setStatus('idle')
      setStatusMessage('')

      // Configure in-player stream for instant playback preview
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
      setError('Please enter a YouTube link first.')
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

      setStatusMessage('Stream prepared. Starting download…')
      triggerBrowserNativeDownload(prepared.token, prepared.filename)

      setStatus('completed')
      setStatusMessage('Download started. Media will automatically expire from server cache.')
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

  const handlePlayVideoFromSearch = (video: VideoSearchResult) => {
    setPlayingTrack({
      url: video.url,
      title: video.title,
      artist: video.channel,
      thumbnail: video.thumbnail,
      format: 'video',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDownloadVideoFromSearch = (video: VideoSearchResult) => {
    setUrl(video.url)
    setActiveTab('download')
  }

  const handleAddVideoToCollection = (video: VideoSearchResult) => {
    addToCollection({
      id: video.id,
      title: video.title,
      artist: video.channel,
      thumbnail: video.thumbnail,
      url: video.url,
    })
  }

  return (
    <div className="flex min-h-screen flex-col justify-between font-sans selection:bg-amber-200 selection:text-stone-900 dark:selection:bg-amber-400/30 dark:selection:text-amber-100">
      {/* 
        DESKTOP NAVIGATION: Floating Glass Capsule (>= 640px)
        Follows Kiwi Dual-Mode Navigation Architecture
      */}
      <header className="sticky top-4 z-40 mx-auto hidden w-full max-w-4xl px-4 sm:block">
        <div className="glass-capsule flex items-center justify-between gap-3 rounded-full px-5 py-2.5 shadow-floating">
          {/* Brand Logo & Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white p-1.5 shadow-2xs dark:border-white/[0.08] dark:bg-stone-800">
              <BananaMark className="h-6 w-auto drop-shadow-sm transition-transform hover:scale-105" />
            </div>
            <span className="font-display text-base font-extrabold tracking-tight text-stone-900 dark:text-white">
              Banana
            </span>
          </div>

          {/* Primary Navigation Pill Links */}
          <nav aria-label="Main Navigation" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('download')}
              className={`focus-ring flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'download'
                  ? 'bg-stone-900 text-white shadow-xs dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
              }`}
            >
              <DownloadIcon className="h-4 w-4" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`focus-ring flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'discover'
                  ? 'bg-stone-900 text-white shadow-xs dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
              <span>Discover</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`focus-ring flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-stone-900 text-white shadow-xs dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
              }`}
            >
              <SearchIcon className="h-4 w-4" />
              <span>Search</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('playlists')}
              className={`focus-ring flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'playlists'
                  ? 'bg-stone-900 text-white shadow-xs dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
              }`}
            >
              <ListMusicIcon className="h-4 w-4" />
              <span>Playlists</span>
            </button>
          </nav>

          {/* Right Controls: Collection Drawer + Theme Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCollectionOpen(true)}
              className="focus-ring flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100/80 dark:text-stone-300 dark:hover:bg-stone-800/80 transition"
              title="Open session collection"
              aria-label="Open session collection"
            >
              <CollectionIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span>Collection</span>
              {collection.length > 0 && (
                <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white dark:bg-amber-400 dark:text-stone-950">
                  {collection.length}
                </span>
              )}
            </button>

            <div className="h-4 w-px bg-stone-200 dark:bg-stone-700 mx-1" aria-hidden="true" />

            <button
              type="button"
              onClick={toggleTheme}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 transition"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <SunIcon className="h-4 w-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
              ) : (
                <MoonIcon className="h-4 w-4 text-amber-500 transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 
        MOBILE TOP BAR: Sticky Top Header (< 640px)
      */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/[0.05] bg-white/95 px-4 py-3 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181915]/95 sm:hidden transition-colors duration-200">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.06] bg-white p-1 shadow-2xs dark:border-white/[0.08] dark:bg-stone-800">
            <BananaMark className="h-5 w-auto" />
          </div>
          <span className="font-display text-base font-extrabold tracking-tight text-stone-900 dark:text-white">
            Banana
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsCollectionOpen(true)}
            className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            title="Collection"
            aria-label="Open collection"
          >
            <CollectionIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            {collection.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white dark:bg-amber-400 dark:text-stone-950">
                {collection.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <SunIcon className="h-5 w-5 text-amber-400" />
            ) : (
              <MoonIcon className="h-5 w-5 text-amber-500" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-28 sm:py-8 sm:pb-16 flex-1">
        {/* Global Floating Player (when a track is selected for preview) */}
        {playingTrack && (
          <div className="mb-7 animate-fade-in">
            <div className="flex items-center justify-between pb-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Now Playing Preview
              </span>
              <button
                type="button"
                onClick={() => {
                  setPlayingTrack(null)
                  setIsTrimOpen(false)
                }}
                className="focus-ring rounded-md px-2 py-0.5 text-xs font-semibold text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200 transition"
              >
                Close Player
              </button>
            </div>
            <MediaPlayer
              url={playingTrack.url}
              title={playingTrack.title}
              artist={playingTrack.artist}
              thumbnail={playingTrack.thumbnail}
              initialFormat={playingTrack.format || 'audio'}
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
          <div className="space-y-6">
            {/* Page Header Block following Kiwi PageShell style */}
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Ephemeral Media Extractor
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
                Downloader
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-stone-600 dark:text-stone-400 font-sans">
                Extract high-fidelity MP4 video and MP3 audio directly to your device with zero persistent storage.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Action Panel */}
              <section
                aria-label="Media Downloader Controls"
                className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
              >
                {/* URL Input */}
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="media-url"
                      className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400"
                    >
                      YouTube URL
                    </label>
                    {trimmedUrl && (
                      <span
                        className={`text-xs font-semibold transition ${
                          isUrlValid
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isUrlValid ? 'Valid Link' : 'Invalid Link'}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-2">
                    <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
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
                      className="focus-ring h-12 sm:h-14 w-full rounded-xl border border-stone-200/90 bg-stone-50/60 pl-11 pr-10 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 shadow-2xs transition hover:bg-stone-50 focus:bg-white dark:border-white/[0.08] dark:bg-[#121310]/70 dark:text-stone-100 dark:placeholder:text-stone-500 dark:hover:bg-[#121310] dark:focus:bg-[#121310]"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={handleClearUrl}
                        aria-label="Clear URL"
                        className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Format & Quality Configuration */}
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Output Format
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Media Format"
                      className="mt-2 grid h-12 sm:h-14 grid-cols-2 gap-1 rounded-xl border border-stone-200/90 bg-stone-100/70 p-1 dark:border-white/[0.08] dark:bg-[#1C1D18]"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={format === 'mp4'}
                        onClick={() => handleFormatChange('mp4')}
                        className={`focus-ring flex items-center justify-center rounded-lg text-xs sm:text-sm font-bold transition ${
                          format === 'mp4'
                            ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                            : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
                        }`}
                      >
                        MP4 Video
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={format === 'mp3'}
                        onClick={() => handleFormatChange('mp3')}
                        className={`focus-ring flex items-center justify-center rounded-lg text-xs sm:text-sm font-bold transition ${
                          format === 'mp3'
                            ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                            : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
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
                <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleFetchInfo}
                    disabled={!trimmedUrl || isBusy}
                    className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center gap-2 rounded-xl border border-stone-200/90 bg-white px-5 text-sm font-bold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 active:scale-95 disabled:cursor-not-allowed disabled:border-stone-200/60 disabled:bg-stone-100/60 disabled:text-stone-400 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] dark:hover:text-white dark:disabled:border-white/[0.04] dark:disabled:bg-stone-900/40 dark:disabled:text-stone-600"
                  >
                    {status === 'fetching_info' ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin text-amber-500 dark:text-amber-400" />
                    ) : (
                      <SearchIcon className="h-4 w-4" />
                    )}
                    <span>{status === 'fetching_info' ? 'Checking…' : 'Load Details'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!trimmedUrl || isBusy}
                    className="focus-ring inline-flex h-12 sm:h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-sm sm:text-base font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300 dark:disabled:bg-stone-800/80 dark:disabled:text-stone-600"
                  >
                    {status === 'preparing' ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
                    ) : (
                      <DownloadIcon className="h-4 w-4" />
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
                      className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center gap-1.5 rounded-xl border border-stone-200/90 bg-white px-4 text-xs sm:text-sm font-bold text-stone-700 shadow-2xs hover:bg-stone-50 active:scale-95 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] dark:hover:text-white"
                      title="Trim media clip"
                    >
                      <ScissorsIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      <span>Trim</span>
                    </button>
                  )}

                  {isBusy && (
                    <button
                      type="button"
                      onClick={cancelActiveRequest}
                      className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center rounded-xl border border-stone-200/90 bg-white px-4 text-xs sm:text-sm font-bold text-stone-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-400 dark:hover:bg-[#20211C]"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Status updates / Active progress banner */}
                {statusMessage && (
                  <div
                    className={`animate-fade-in mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold ${
                      status === 'completed'
                        ? 'border border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'
                    }`}
                  >
                    {status === 'completed' ? (
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <SpinnerIcon className="h-4 w-4 shrink-0 animate-spin text-amber-500 dark:text-amber-400" />
                    )}
                    <span>{statusMessage}</span>
                  </div>
                )}

                {/* Error banner */}
                {error && (
                  <div
                    role="alert"
                    className="animate-fade-in mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/40 dark:bg-rose-950/40 px-4 py-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>{error}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setError('')}
                      aria-label="Dismiss error"
                      className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200"
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
                className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-7 shadow-soft dark:border-white/[0.08] dark:bg-[#181915] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Media Preview
                    </span>
                    {duration !== null && (
                      <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 font-mono text-xs font-bold text-stone-700 dark:text-stone-300">
                        {formatDuration(duration)}
                      </span>
                    )}
                  </div>

                  {thumbnail ? (
                    <div className="group relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-stone-200/60 bg-stone-100 shadow-2xs dark:border-white/[0.06] dark:bg-black/30">
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
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                      />
                      {/* Quick Play Trigger Overlay */}
                      <button
                        type="button"
                        onClick={() => {
                          setPlayingTrack({
                            url: trimmedUrl,
                            title: title || 'Media Track',
                            artist: uploader,
                            thumbnail,
                          })
                        }}
                        className="focus-ring absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100"
                        title="Play in preview player"
                      >
                        <div className="flex h-13 w-13 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl ring-4 ring-white/30 transition transform group-hover:scale-110 group-hover:bg-amber-400 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:ring-black/40">
                          <PlayIcon className="h-6 w-6" />
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300/80 bg-stone-50/50 text-center text-xs font-medium text-stone-400 dark:border-stone-700/80 dark:bg-[#121310]/50 dark:text-stone-500">
                      <ImageIcon className="h-8 w-8 text-stone-300 dark:text-stone-600" />
                      <span>Paste a link to load preview</span>
                    </div>
                  )}

                  <div className="mt-4 space-y-3.5">
                    <div>
                      <h3 className="line-clamp-2 font-sans text-base font-bold text-stone-900 dark:text-stone-50">
                        {title || 'No media loaded'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 dark:border-white/[0.06] dark:bg-[#1C1D18]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          <UserIcon className="h-3.5 w-3.5" />
                          Channel
                        </div>
                        <p className="mt-1 truncate text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">
                          {uploader || '—'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 dark:border-white/[0.06] dark:bg-[#1C1D18]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {preparedSize ? 'Size' : 'Duration'}
                        </div>
                        <p className="mt-1 font-mono text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">
                          {preparedSize ? formatFileSize(preparedSize) : formatDuration(duration)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* Tab 2: Discover Screen */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Algorithmic Exploration
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
                Music Discovery
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-stone-600 dark:text-stone-400 font-sans">
                Explore deep cuts, hidden gems, and soundalikes tuned with granular similarity and diversity preferences.
              </p>
            </div>

            <DiscoverView
              onPlayTrack={handlePlayTrackFromExternal}
              onDownloadTrack={handleDownloadTrackFromExternal}
              onAddToCollection={addToCollection}
            />
          </div>
        )}

        {/* Tab 3: Search Screen */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Full Video Catalog
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
                Search Videos
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-stone-600 dark:text-stone-400 font-sans">
                Search keywords, explore rich metadata with views, likes & dislikes, watch in fullscreen, or queue for download.
              </p>
            </div>

            <SearchView
              onPlayVideo={handlePlayVideoFromSearch}
              onDownloadVideo={handleDownloadVideoFromSearch}
              onAddToCollection={handleAddVideoToCollection}
            />
          </div>
        )}

        {/* Tab 4: Playlists Screen */}
        {activeTab === 'playlists' && (
          <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Batch Track Extraction
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
                Playlists
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-stone-600 dark:text-stone-400 font-sans">
                Import YouTube or YouTube Music playlists for batch collection, high-speed sequential download, and playback.
              </p>
            </div>

            <PlaylistView
              onPlayTrack={handlePlayTrackFromExternal}
              onDownloadTrack={handleDownloadTrackFromExternal}
              onAddMultipleToCollection={addMultipleToCollection}
            />
          </div>
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

      {/* 
        MOBILE BOTTOM DOCK: Fixed Floating Pill (< 640px)
        Follows Kiwi Dual-Mode Navigation Architecture
      */}
      <div className="fixed bottom-3 inset-x-3 z-50 grid grid-cols-4 gap-1 rounded-2xl border border-black/[0.08] bg-white/95 py-1.5 px-1.5 shadow-lift backdrop-blur-lg dark:border-white/[0.08] dark:bg-[#181915]/95 sm:hidden transition-colors duration-200">
        <button
          type="button"
          onClick={() => setActiveTab('download')}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'download'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <DownloadIcon className="h-5 w-5 shrink-0" />
          <span>Download</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('discover')}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'discover'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <SparklesIcon className="h-5 w-5 shrink-0" />
          <span>Discover</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'search'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <SearchIcon className="h-5 w-5 shrink-0" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('playlists')}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'playlists'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <ListMusicIcon className="h-5 w-5 shrink-0" />
          <span>Playlists</span>
        </button>
      </div>

      {/* Clean Modern Minimal Footer */}
      <footer className="mx-auto mt-10 flex w-full max-w-4xl items-center justify-between border-t border-stone-200/80 dark:border-white/[0.08] px-4 py-6 text-xs text-stone-500 dark:text-stone-400">
        <div className="flex items-center gap-2">
          <BananaMark className="h-4 w-auto" />
          <span className="font-display font-bold text-stone-800 dark:text-stone-200">Banana</span>
          <span>&middot;</span>
          <span>Fast, Private Media Utility</span>
        </div>
        <span className="font-medium text-stone-400 dark:text-stone-500 hidden sm:inline">
          Zero persistent storage · Ephemeral extraction
        </span>
      </footer>
    </div>
  )
}
