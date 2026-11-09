import { useEffect, useRef, useState } from 'react'
import { buildStreamPreviewUrl, formatDuration } from '../lib/media'
import {
  CollectionIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  SpinnerIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from './icons'

interface MediaPlayerProps {
  url: string
  title: string
  artist?: string
  thumbnail?: string
  initialFormat?: 'audio' | 'video'
  onTrimRequested?: () => void
  onDownloadRequested?: () => void
  onAddToCollection?: () => void
  isTrimOpen?: boolean
}

export function MediaPlayer({
  url,
  title,
  artist,
  thumbnail,
  initialFormat = 'audio',
  onTrimRequested,
  onDownloadRequested,
  onAddToCollection,
  isTrimOpen = false,
}: MediaPlayerProps) {
  const [format, setFormat] = useState<'audio' | 'video'>(initialFormat)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const shouldPlayRef = useRef(true)

  const streamSrc = buildStreamPreviewUrl(url, format)

  const attemptPlay = () => {
    const el = mediaRef.current
    if (!el) return
    const playPromise = el.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true)
          setIsLoading(false)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }
          if (err instanceof Error && err.name === 'NotAllowedError') {
            shouldPlayRef.current = false
            setIsPlaying(false)
            setIsLoading(false)
            return
          }
          console.warn('Playback error:', err)
        })
    }
  }

  useEffect(() => {
    shouldPlayRef.current = true
    setCurrentTime(0)
    setDuration(0)
    setIsLoading(true)
    setIsPlaying(true)

    const el = mediaRef.current
    if (el) {
      attemptPlay()
    }
  }, [url, format])

  const togglePlay = () => {
    const el = mediaRef.current
    if (!el) return

    if (isPlaying) {
      shouldPlayRef.current = false
      el.pause()
      setIsPlaying(false)
    } else {
      shouldPlayRef.current = true
      setIsLoading(true)
      const playPromise = el.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true)
            setIsLoading(false)
          })
          .catch((err) => {
            console.warn('Playback request failed:', err)
            shouldPlayRef.current = false
            setIsPlaying(false)
            setIsLoading(false)
          })
      }
    }
  }

  const handleSeek = (seconds: number) => {
    const el = mediaRef.current
    if (!el) return
    el.currentTime = seconds
    setCurrentTime(seconds)
  }

  const toggleMute = () => {
    const el = mediaRef.current
    if (!el) return
    el.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const handleVolumeChange = (newVol: number) => {
    const el = mediaRef.current
    if (!el) return
    el.volume = newVol
    setVolume(newVol)
    if (newVol > 0 && isMuted) {
      el.muted = false
      setIsMuted(false)
    }
  }

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIdx]
    setPlaybackSpeed(nextSpeed)
    if (mediaRef.current) {
      mediaRef.current.playbackRate = nextSpeed
    }
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6 shadow-soft dark:border-white/[0.08] dark:bg-[#181915] transition-all">
      {/* Video display (when in video mode) */}
      {format === 'video' && (
        <div className="relative mb-5 aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xs">
          <video
            ref={(ref) => {
              mediaRef.current = ref
            }}
            src={streamSrc}
            autoPlay
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              if (!shouldPlayRef.current) {
                setIsPlaying(false)
              }
            }}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={(e) => {
              setIsLoading(false)
              if (shouldPlayRef.current && e.currentTarget.paused) {
                e.currentTarget.play().catch(() => {})
              }
            }}
            onPlaying={() => {
              setIsLoading(false)
              setIsPlaying(true)
            }}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0)
              if (shouldPlayRef.current && e.currentTarget.paused) {
                e.currentTarget.play().catch(() => {})
              }
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => {
              shouldPlayRef.current = false
              setIsPlaying(false)
              setIsLoading(false)
            }}
            className="h-full w-full object-contain"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <SpinnerIcon className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
      )}

      {/* Hidden audio element (when in audio mode) */}
      {format === 'audio' && (
        <audio
          ref={(ref) => {
            mediaRef.current = ref
          }}
          src={streamSrc}
          autoPlay
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            if (!shouldPlayRef.current) {
              setIsPlaying(false)
            }
          }}
          onWaiting={() => setIsLoading(true)}
          onCanPlay={(e) => {
            setIsLoading(false)
            if (shouldPlayRef.current && e.currentTarget.paused) {
              e.currentTarget.play().catch(() => {})
            }
          }}
          onPlaying={() => {
            setIsLoading(false)
            setIsPlaying(true)
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0)
            if (shouldPlayRef.current && e.currentTarget.paused) {
              e.currentTarget.play().catch(() => {})
            }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => {
            shouldPlayRef.current = false
            setIsPlaying(false)
            setIsLoading(false)
          }}
        />
      )}

      {/* Track info & Format switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3.5 overflow-hidden">
          {thumbnail && format === 'audio' && (
            <img
              src={thumbnail}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
              alt={title}
              className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl object-cover shadow-2xs"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate font-sans text-base sm:text-lg font-bold text-stone-900 dark:text-stone-50">
              {title || 'Media Track'}
            </h3>
            {artist && (
              <p className="truncate text-xs sm:text-sm font-medium text-stone-500 dark:text-stone-400">{artist}</p>
            )}
          </div>
        </div>

        {/* Audio / Video toggle */}
        <div className="flex items-center self-start sm:self-auto rounded-xl border border-stone-200/90 bg-stone-100/70 p-1 text-xs font-bold dark:border-white/[0.08] dark:bg-[#1C1D18]">
          <button
            type="button"
            onClick={() => setFormat('audio')}
            className={`focus-ring rounded-lg px-3.5 py-1.5 transition ${
              format === 'audio'
                ? 'bg-white font-bold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Audio
          </button>
          <button
            type="button"
            onClick={() => setFormat('video')}
            className={`focus-ring rounded-lg px-3.5 py-1.5 transition ${
              format === 'video'
                ? 'bg-white font-bold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Video
          </button>
        </div>
      </div>

      {/* Scrubber timeline */}
      <div className="space-y-1.5 py-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-amber-500 dark:accent-amber-400 focus:outline-none"
            aria-label="Seek media position"
          />
        </div>
        <div className="flex justify-between text-xs font-mono font-medium text-stone-500 dark:text-stone-400">
          <span>{formatDuration(currentTime)}</span>
          <span>{duration > 0 ? formatDuration(duration) : '—:—'}</span>
        </div>
      </div>

      {/* Main playback control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-200/80 dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="focus-ring flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-amber-500 text-white shadow-soft transition hover:bg-amber-600 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
          >
            {isLoading ? (
              <SpinnerIcon className="h-5 w-5 animate-spin text-white dark:text-stone-950" />
            ) : isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5 translate-x-0.5" />
            )}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={toggleMute}
              className="focus-ring rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-200 transition"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeMuteIcon className="h-5 w-5" />
              ) : (
                <VolumeIcon className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="h-1.5 w-16 cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-amber-500 dark:accent-amber-400 sm:w-24"
              aria-label="Volume"
            />
          </div>

          {/* Speed */}
          <button
            type="button"
            onClick={cycleSpeed}
            className="focus-ring rounded-lg border border-stone-200/90 dark:border-white/[0.08] px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/10 transition"
            title="Playback speed"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* Action buttons directly accessible beneath media */}
        <div className="flex items-center gap-2">
          {onTrimRequested && (
            <button
              type="button"
              onClick={onTrimRequested}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-95 ${
                isTrimOpen
                  ? 'border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
                  : 'border-stone-200/90 bg-white text-stone-700 hover:bg-stone-50 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C]'
              }`}
            >
              <ScissorsIcon className="h-4 w-4" />
              <span>Trim</span>
            </button>
          )}

          {onAddToCollection && (
            <button
              type="button"
              onClick={onAddToCollection}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-stone-200/90 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-stone-700 shadow-2xs transition hover:bg-stone-50 active:scale-95 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C]"
              title="Add to session collection"
            >
              <CollectionIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span className="hidden sm:inline">Collect</span>
            </button>
          )}

          {onDownloadRequested && (
            <button
              type="button"
              onClick={onDownloadRequested}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>Download</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
