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
          // If aborted because still fetching/transitioning source, ignore - onCanPlay/onLoadedMetadata will handle it
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }
          if (err instanceof Error && err.name === 'NotAllowedError') {
            // Browser autoplay policy prevented unmuted autoplay
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
    // When URL or format changes, the user wants to play this media
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
    <div className="glass-panel overflow-hidden rounded-3xl p-6 sm:p-7 shadow-glass transition-all">
      {/* Video display (when in video mode) */}
      {format === 'video' && (
        <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-md">
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
              <SpinnerIcon className="h-10 w-10 animate-spin text-white" />
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
        <div className="flex items-center gap-4 overflow-hidden">
          {thumbnail && format === 'audio' && (
            <img
              src={thumbnail}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
              alt={title}
              className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl object-cover shadow-sm"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base sm:text-lg font-bold text-lychee-ink">{title || 'Media Track'}</h3>
            {artist && <p className="truncate text-xs sm:text-sm font-medium text-lychee-seed-500">{artist}</p>}
          </div>
        </div>

        {/* Audio / Video toggle */}
        <div className="flex items-center self-start sm:self-auto rounded-xl border border-lychee-border/50 bg-lychee-membrane-100 p-1 text-xs sm:text-sm font-bold">
          <button
            type="button"
            onClick={() => setFormat('audio')}
            className={`rounded-lg px-4 py-1.5 transition ${
              format === 'audio' ? 'bg-white font-bold text-lychee-shell shadow-sm' : 'text-lychee-ink/70 hover:text-lychee-ink'
            }`}
          >
            Audio
          </button>
          <button
            type="button"
            onClick={() => setFormat('video')}
            className={`rounded-lg px-4 py-1.5 transition ${
              format === 'video' ? 'bg-white font-bold text-lychee-shell shadow-sm' : 'text-lychee-ink/70 hover:text-lychee-ink'
            }`}
          >
            Video
          </button>
        </div>
      </div>

      {/* Scrubber timeline */}
      <div className="space-y-1.5 py-2">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-lychee-border/50 accent-lychee-shell focus:outline-none"
            aria-label="Seek media"
          />
        </div>
        <div className="flex justify-between text-xs font-semibold text-lychee-seed-500">
          <span>{formatDuration(currentTime)}</span>
          <span>{duration > 0 ? formatDuration(duration) : '—:—'}</span>
        </div>
      </div>

      {/* Main playback control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-lychee-border/25">
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="focus-ring flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-lychee-shell text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95"
          >
            {isLoading ? (
              <SpinnerIcon className="h-6 w-6 animate-spin text-white" />
            ) : isPlaying ? (
              <PauseIcon className="h-6 w-6" />
            ) : (
              <PlayIcon className="h-6 w-6 translate-x-0.5" />
            )}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 pl-2">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-xl p-1.5 text-lychee-seed-500 transition hover:bg-lychee-membrane-100 hover:text-lychee-ink"
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
              className="h-2 w-20 cursor-pointer appearance-none rounded-lg bg-lychee-border/50 accent-lychee-shell sm:w-28"
              aria-label="Volume"
            />
          </div>

          {/* Speed */}
          <button
            type="button"
            onClick={cycleSpeed}
            className="rounded-xl px-2.5 py-1 text-xs font-bold text-lychee-seed-700 hover:bg-lychee-membrane-100 transition"
            title="Playback speed"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* Action buttons directly accessible beneath media */}
        <div className="flex items-center gap-2.5">
          {onTrimRequested && (
            <button
              type="button"
              onClick={onTrimRequested}
              className={`focus-ring inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 ${
                isTrimOpen
                  ? 'border-lychee-shell bg-lychee-shell text-white'
                  : 'border-white/80 bg-white text-lychee-seed-700 hover:bg-lychee-membrane-100'
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
              className="focus-ring inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-lychee-seed-700 shadow-sm transition hover:bg-lychee-membrane-100 active:scale-95"
              title="Add to temporary collection"
            >
              <CollectionIcon className="h-4 w-4 text-lychee-shell" />
              <span className="hidden sm:inline">Collect</span>
            </button>
          )}

          {onDownloadRequested && (
            <button
              type="button"
              onClick={onDownloadRequested}
              className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-lychee-shell px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95"
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

