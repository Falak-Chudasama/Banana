import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CollectionDrawer } from './components/CollectionDrawer'
import { DirectionalTabTransition } from './components/DirectionalTabTransition'
import { DiscoverView } from './components/DiscoverView'
import { DownloadItem } from './components/downloads/DownloadItem'
import { DownloadQueue } from './components/downloads/DownloadQueue'
import { MediaPlayer } from './components/MediaPlayer'
import { PlaylistView } from './components/PlaylistView'
import { SearchView } from './components/SearchView'
import { Select } from './components/Select'
import { TrimPanel } from './components/TrimPanel'
import { useDownloadManager } from './hooks/useDownloadManager'
import { useKeyboardNav, NAV_TABS } from './hooks/useKeyboardNav'
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
  playEnter,
  playBack,
  playNotification,
  playFailed,
  playScroll,
} from './lib/sound'
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
  const [tabDirection, setTabDirection] = useState<'right' | 'left' | 'fade'>('fade')

  const handleTabChange = (nextTab: NavTab, direction?: 'right' | 'left') => {
    if (activeTab !== nextTab) {
      playScroll()
      if (direction) {
        setTabDirection(direction)
      } else {
        const prevIdx = NAV_TABS.indexOf(activeTab)
        const nextIdx = NAV_TABS.indexOf(nextTab)
        setTabDirection(nextIdx > prevIdx ? 'right' : 'left')
      }
      setActiveTab(nextTab)
    }
  }

  // Global Ctrl + ArrowLeft / Ctrl + ArrowRight keyboard navigation with direction awareness
  useKeyboardNav({ activeTab, onTabChange: handleTabChange })

  // Desktop header sliding indicator pill state (motion.pill physics)
  const desktopNavContainerRef = useRef<HTMLDivElement>(null)
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [navPillStyle, setNavPillStyle] = useState<{
    left: number
    top: number
    width: number
    height: number
    opacity: number
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 })
  const [isNavPillReady, setIsNavPillReady] = useState(false)

  const updateNavPill = () => {
    const activeEl = navItemRefs.current[activeTab]
    const container = desktopNavContainerRef.current
    if (activeEl && container) {
      let left = activeEl.offsetLeft
      let top = activeEl.offsetTop
      if (activeEl.offsetParent !== container) {
        const navRect = container.getBoundingClientRect()
        const elRect = activeEl.getBoundingClientRect()
        left = Math.round(elRect.left - navRect.left)
        top = Math.round(elRect.top - navRect.top)
      }
      const width = Math.round(activeEl.offsetWidth)
      const height = Math.round(activeEl.offsetHeight)

      if (width > 0 && height > 0) {
        setNavPillStyle({
          left,
          top,
          width,
          height,
          opacity: 1,
        })
      }
    } else {
      setNavPillStyle((prev) => ({ ...prev, opacity: 0 }))
    }
  }

  useLayoutEffect(() => {
    updateNavPill()
  }, [activeTab])

  useEffect(() => {
    updateNavPill()
    const timer = setTimeout(() => {
      updateNavPill()
      setIsNavPillReady(true)
    }, 50)
    window.addEventListener('resize', updateNavPill)
    document.fonts?.ready?.then(() => {
      updateNavPill()
    })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateNavPill)
    }
  }, [activeTab])

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

  // Robust Download Manager hook
  const {
    jobs,
    activeJobs,
    readyJobs,
    activeCount,
    startDownloadJob,
    saveFileToDevice,
    cancelJob,
    retryJob,
    dismissJob,
    clearCompleted,
  } = useDownloadManager()

  const [isDownloadQueueOpen, setIsDownloadQueueOpen] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const activeJob = useMemo(
    () => (activeJobId ? jobs.find((j) => j.job_id === activeJobId) : undefined),
    [jobs, activeJobId],
  )

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
  const isJobBusy =
    Boolean(activeJob &&
    (activeJob.status === 'queued' ||
      activeJob.status === 'fetching_metadata' ||
      activeJob.status === 'downloading' ||
      activeJob.status === 'post_processing' ||
      activeJob.status === 'packaging' ||
      activeJob.status === 'transferring' ||
      activeJob.client_transfer_status === 'saving'))

  const isBusy = status === 'fetching_info' || isJobBusy

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

  // Track loaded URL to avoid redundant auto-fetch calls
  const loadedUrlRef = useRef<string>('')

  const handleUrlChange = (newVal: string) => {
    setUrl(newVal)
    if (error) setError('')
    if (status === 'completed') setStatus('idle')

    if (isBusy) {
      cancelActiveRequest()
    }
    if (!newVal.trim()) {
      loadedUrlRef.current = ''
      resetMediaPreview()
    }
  }

  const handleClearUrl = () => {
    playBack()
    cancelActiveRequest()
    setUrl('')
    setError('')
    setStatus('idle')
    loadedUrlRef.current = ''
    resetMediaPreview()
  }

  const handleFormatChange = (next: MediaFormat) => {
    if (format !== next) {
      playScroll()
      setFormat(next)
      setQuality(defaultQualityFor(next))
      if (status === 'completed') setStatus('idle')
    }
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

    playEnter()
    cancelActiveRequest()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStatus('fetching_info')
    setStatusMessage('Retrieving media details from YouTube…')
    setError('')

    try {
      const data = await fetchMediaInfo(trimmedUrl, controller.signal)
      loadedUrlRef.current = trimmedUrl
      setTitle(data.title || '')
      setThumbnail(data.thumbnail || '')
      setUploader(data.uploader || '')
      setDuration(typeof data.duration === 'number' ? data.duration : null)
      setStatus('idle')
      setStatusMessage('')
      playNotification()

      // Configure in-player stream for instant playback preview
      setPlayingTrack({
        url: trimmedUrl,
        title: data.title || 'Loaded Media',
        artist: data.uploader || '',
        thumbnail: data.thumbnail || '',
        format: format === 'mp4' ? 'video' : 'audio',
      })
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      playFailed()
      resetMediaPreview()
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not retrieve media details.')
    } finally {
      abortControllerRef.current = null
    }
  }

  // Automatically load details whenever any valid YouTube link is entered or pasted
  useEffect(() => {
    if (!trimmedUrl || !isUrlValid) return

    if (loadedUrlRef.current === trimmedUrl || status === 'fetching_info') return

    const timer = window.setTimeout(() => {
      handleFetchInfo()
    }, 380)

    return () => window.clearTimeout(timer)
  }, [trimmedUrl, isUrlValid, status])

  const handleDownload = async () => {
    if (!trimmedUrl) {
      setError('Please enter a YouTube link first.')
      return
    }

    if (!isUrlValid) {
      setError('Please enter a valid YouTube video or shorts URL.')
      return
    }

    playEnter()
    setError('')
    try {
      const job = await startDownloadJob(trimmedUrl, format, quality, {
        title: title || undefined,
        thumbnail: thumbnail || undefined,
        uploader: uploader || undefined,
        duration: duration,
      })
      setActiveJobId(job.job_id)
    } catch (err: unknown) {
      playFailed()
      setError(err instanceof Error ? err.message : 'Failed to initiate download job.')
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
      const job = await startDownloadJob(track.url, 'mp3', 'best', {
        title: track.title,
        thumbnail: track.thumbnail,
        uploader: track.artist,
      })
      setActiveJobId(job.job_id)
      setIsDownloadQueueOpen(true)
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
    <div className="relative flex min-h-screen flex-col justify-between font-sans selection:bg-amber-200 selection:text-stone-900 dark:selection:bg-amber-400/30 dark:selection:text-amber-100 overflow-x-hidden">
      {/* Ambient light fields to enable subtle glass refraction (DESIGN.md Section 2.8) */}
      <div className="pointer-events-none fixed top-12 -left-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-amber-500/[0.05] to-transparent blur-[110px] dark:from-amber-400/[0.06]" />
      <div className="pointer-events-none fixed top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-gradient-to-bl from-amber-400/[0.05] to-transparent blur-[110px] dark:from-amber-500/[0.05]" />
      <div className="pointer-events-none fixed -bottom-32 left-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-600/[0.04] to-transparent blur-[120px] dark:from-amber-300/[0.04]" />

      {/* 
        DESKTOP NAVIGATION: Fixed Floating Glass Capsule (>= 640px)
        Follows Kiwi Dual-Mode Navigation Architecture (Stationary Pinned Header)
      */}
      <header className="fixed top-3 inset-x-0 z-40 mx-auto hidden w-full max-w-6xl xl:max-w-7xl px-4 sm:px-6 lg:px-8 sm:block pointer-events-none">
        <div className="glass-capsule pointer-events-auto flex items-center justify-between gap-4 rounded-full px-5 py-2.5 shadow-floating">
          {/* Brand Logo & Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0 flex-1 justify-start">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white p-1.5 shadow-2xs dark:border-white/[0.08] dark:bg-stone-800">
              <BananaMark className="h-6 w-auto drop-shadow-sm transition-transform hover:scale-105" />
            </div>
            <span className="font-display text-base font-extrabold tracking-tight text-stone-900 dark:text-white">
              Banana
            </span>
          </div>

          {/* Primary Navigation Pill Links with Sliding Active Pill Motion Physics */}
          <nav aria-label="Main Navigation" className="flex items-center justify-center shrink-0">
            <div ref={desktopNavContainerRef} className="relative flex items-center gap-1 sm:gap-1.5">
              {/* Dynamic Sliding Active Indicator Pill (motion.pill: 300ms cubic-bezier(0.2, 0.8, 0.2, 1)) */}
              <div
                className={`absolute top-0 left-0 z-0 rounded-full bg-stone-900 dark:bg-stone-100 shadow-xs pointer-events-none ${
                  isNavPillReady ? 'transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
                }`}
                style={{
                  transform: `translate3d(${navPillStyle.left}px, ${navPillStyle.top}px, 0)`,
                  width: `${navPillStyle.width}px`,
                  height: `${navPillStyle.height}px`,
                  opacity: navPillStyle.opacity,
                  willChange: 'transform, width',
                }}
                aria-hidden="true"
              />

              <button
                type="button"
                ref={(el) => {
                  navItemRefs.current['download'] = el
                }}
                onClick={() => handleTabChange('download')}
                className={`relative z-10 focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-colors duration-200 ${
                  activeTab === 'download'
                    ? 'text-white dark:text-stone-900 font-bold'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                <DownloadIcon className="h-4 w-4" />
                <span>Download</span>
              </button>

              <button
                type="button"
                ref={(el) => {
                  navItemRefs.current['discover'] = el
                }}
                onClick={() => handleTabChange('discover')}
                className={`relative z-10 focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-colors duration-200 ${
                  activeTab === 'discover'
                    ? 'text-white dark:text-stone-900 font-bold'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                <SparklesIcon className="h-4 w-4" />
                <span>Discover</span>
              </button>

              <button
                type="button"
                ref={(el) => {
                  navItemRefs.current['search'] = el
                }}
                onClick={() => handleTabChange('search')}
                className={`relative z-10 focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-colors duration-200 ${
                  activeTab === 'search'
                    ? 'text-white dark:text-stone-900 font-bold'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                <SearchIcon className="h-4 w-4" />
                <span>Search</span>
              </button>

              <button
                type="button"
                ref={(el) => {
                  navItemRefs.current['playlists'] = el
                }}
                onClick={() => handleTabChange('playlists')}
                className={`relative z-10 focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-colors duration-200 ${
                  activeTab === 'playlists'
                    ? 'text-white dark:text-stone-900 font-bold'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                <ListMusicIcon className="h-4 w-4" />
                <span>Playlists</span>
              </button>
            </div>
          </nav>

          {/* Right Controls: Downloads Queue + Collection Drawer + Theme Switcher */}
          <div className="flex items-center justify-end gap-2 shrink-0 flex-1">
            <button
              type="button"
              onClick={() => setIsDownloadQueueOpen(true)}
              className="focus-ring flex items-center gap-2 rounded-full px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-700 hover:bg-stone-100/80 dark:text-stone-300 dark:hover:bg-stone-800/80 transition"
              title="Open downloads manager"
              aria-label="Open downloads manager"
            >
              <DownloadIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span className="hidden md:inline">Downloads</span>
              {jobs.length > 0 && (
                <span
                  className={`flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-micro font-bold ${
                    activeCount > 0
                      ? 'bg-amber-500 text-stone-950 animate-pulse'
                      : 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-300'
                  }`}
                >
                  {activeCount > 0 ? activeCount : jobs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsCollectionOpen(true)}
              className="focus-ring flex items-center gap-2 rounded-full px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-700 hover:bg-stone-100/80 dark:text-stone-300 dark:hover:bg-stone-800/80 transition"
              title="Open session collection"
              aria-label="Open session collection"
            >
              <CollectionIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span className="hidden md:inline">Collection</span>
              {collection.length > 0 && (
                <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-micro font-bold text-white dark:bg-amber-400 dark:text-stone-950">
                  {collection.length}
                </span>
              )}
            </button>

            <div className="h-4 w-px bg-stone-200 dark:bg-stone-700 mx-0.5" aria-hidden="true" />

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
        MOBILE TOP BAR: Fixed Top Header (< 640px)
        Stationary pinned header immune to scrolling
      */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between border-b border-black/[0.05] bg-white/95 px-4 py-3 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181915]/95 sm:hidden transition-colors duration-200">
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
            onClick={() => setIsDownloadQueueOpen(true)}
            className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            title="Downloads"
            aria-label="Open downloads"
          >
            <DownloadIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            {jobs.length > 0 && (
              <span
                className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-micro font-bold ${
                  activeCount > 0 ? 'bg-amber-500 text-stone-950 animate-pulse' : 'bg-stone-500 text-white'
                }`}
              >
                {activeCount > 0 ? activeCount : jobs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCollectionOpen(true)}
            className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            title="Collection"
            aria-label="Open collection"
          >
            <CollectionIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            {collection.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-micro font-bold text-white dark:bg-amber-400 dark:text-stone-950">
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

      {/* Main Content Area - Offsets fixed top header with pt-20 sm:pt-24 */}
      <main className="mx-auto w-full max-w-6xl xl:max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-28 sm:pb-16 flex-1">
        {/* Global Floating Player (when a track is selected for preview) */}
        {playingTrack && (
          <div className="mb-7 animate-scale-in">
            <div className="flex items-center justify-between pb-2 px-1">
              <span className="text-micro font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Now Playing Preview
              </span>
              <button
                type="button"
                onClick={() => {
                  playBack()
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
              initialQuality={quality}
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

        {/* Directional Route Transition between views (Apple-grade 2-layer slide animation) */}
        <DirectionalTabTransition
          activeTab={activeTab}
          direction={tabDirection}
          renderTab={(tab) => {
            switch (tab) {
              case 'download':
                return (
                  <div className="space-y-6">
            {/* Page Header Block following Kiwi PageShell style */}
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Ephemeral Media Extractor
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
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
                        className={`focus-ring flex items-center justify-center rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition ${
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
                        className={`focus-ring flex items-center justify-center rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition ${
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
                <div className="mt-7 flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={handleFetchInfo}
                    disabled={!trimmedUrl || isBusy}
                    className="btn-glass-secondary btn-interactive inline-flex h-12 sm:h-13 shrink-0 items-center justify-center gap-2 rounded-xl px-4 sm:px-5 text-sm font-bold shadow-2xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="btn-glass-primary btn-interactive inline-flex h-12 sm:h-13 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-xl px-5 sm:px-6 text-sm sm:text-base font-bold shadow-soft whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {isJobBusy ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin text-current" />
                    ) : (
                      <DownloadIcon className="h-4 w-4" />
                    )}
                    <span>
                      {isJobBusy
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
                      className="btn-glass-secondary btn-interactive inline-flex h-12 sm:h-13 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs sm:text-sm font-bold shadow-2xs whitespace-nowrap"
                      title="Trim media clip"
                    >
                      <ScissorsIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      <span>Trim</span>
                    </button>
                  )}

                  {isBusy && (
                    <button
                      type="button"
                      onClick={() => {
                        cancelActiveRequest()
                        if (activeJob) cancelJob(activeJob.job_id)
                      }}
                      className="btn-glass-secondary btn-interactive inline-flex h-12 sm:h-13 shrink-0 items-center justify-center rounded-xl px-4 text-xs sm:text-sm font-bold whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Active Download Job Real-Time Progress Card */}
                {activeJob && (
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-micro font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Active Download Progress
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDownloadQueueOpen(true)}
                        className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                      >
                        View All in Queue &rarr;
                      </button>
                    </div>
                    <DownloadItem
                      job={activeJob}
                      onSave={saveFileToDevice}
                      onCancel={cancelJob}
                      onRetry={retryJob}
                      onDismiss={(id) => {
                        dismissJob(id)
                        if (activeJobId === id) setActiveJobId(null)
                      }}
                    />
                  </div>
                )}

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
                          playEnter()
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
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl ring-4 ring-white/30 transition transform group-hover:scale-110 group-hover:bg-amber-400 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:ring-black/40">
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
                        <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          <UserIcon className="h-3.5 w-3.5" />
                          Channel
                        </div>
                        <p className="mt-1 truncate text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200">
                          {uploader || '—'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 dark:border-white/[0.06] dark:bg-[#1C1D18]">
                        <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
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
                )
              case 'discover':
                return (
                  <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Algorithmic Exploration
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
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
                )
              case 'search':
                return (
                  <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Full Video Catalog
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
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
                )
              case 'playlists':
                return (
                  <div className="space-y-6">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans">
                Batch Track Extraction
              </span>
              <h1 className="mt-1 font-sans text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
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
                )
            }
          }}
        />
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

      {/* Floating Download Queue Drawer */}
      <DownloadQueue
        jobs={jobs}
        isOpen={isDownloadQueueOpen}
        onClose={() => setIsDownloadQueueOpen(false)}
        onSave={saveFileToDevice}
        onCancel={cancelJob}
        onRetry={retryJob}
        onDismiss={dismissJob}
        onClearCompleted={clearCompleted}
      />

      {/* 
        MOBILE BOTTOM DOCK: Fixed Floating Pill (< 640px)
        Follows Kiwi Dual-Mode Navigation Architecture with fluid active pill
      */}
      <div className="fixed bottom-3 inset-x-3 z-50 grid grid-cols-4 gap-1 rounded-full glass-capsule py-1.5 px-2 shadow-lift sm:hidden transition-colors duration-200">
        <button
          type="button"
          onClick={() => handleTabChange('download')}
          className={`btn-interactive flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full py-1 text-xs font-semibold transition-all duration-200 ${
            activeTab === 'download'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold scale-[1.02]'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <DownloadIcon className="h-5 w-5 shrink-0" />
          <span>Download</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('discover')}
          className={`btn-interactive flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full py-1 text-xs font-semibold transition-all duration-200 ${
            activeTab === 'discover'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold scale-[1.02]'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <SparklesIcon className="h-5 w-5 shrink-0" />
          <span>Discover</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('search')}
          className={`btn-interactive flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full py-1 text-xs font-semibold transition-all duration-200 ${
            activeTab === 'search'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold scale-[1.02]'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <SearchIcon className="h-5 w-5 shrink-0" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('playlists')}
          className={`btn-interactive flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full py-1 text-xs font-semibold transition-all duration-200 ${
            activeTab === 'playlists'
              ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 font-bold scale-[1.02]'
              : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
          }`}
        >
          <ListMusicIcon className="h-5 w-5 shrink-0" />
          <span>Playlists</span>
        </button>
      </div>

      {/* Clean Modern Minimal Footer */}
      <footer className="mx-auto mt-10 flex w-full max-w-6xl xl:max-w-7xl items-center justify-between border-t border-stone-200/80 dark:border-white/[0.08] px-4 sm:px-6 lg:px-8 py-6 text-xs text-stone-500 dark:text-stone-400">
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
