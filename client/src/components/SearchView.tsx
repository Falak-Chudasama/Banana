import { useState } from 'react'
import { searchVideos, formatCompactNumber } from '../lib/search'
import type { VideoSearchResult } from '../lib/types'
import {
  CheckIcon,
  CloseIcon,
  CollectionIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  PlayIcon,
  SearchIcon,
  SpinnerIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  VideoIcon,
} from './icons'

interface SearchViewProps {
  onPlayVideo: (video: VideoSearchResult) => void
  onDownloadVideo: (video: VideoSearchResult) => void
  onAddToCollection: (video: VideoSearchResult) => void
}

const SAMPLE_QUERIES = [
  'Interstellar Docking Scene',
  'MKBHD Studio Tour',
  '4K Cyberpunk City Walk',
  'James Webb Telescope Discoveries',
  'Formula 1 Best Overtakes',
]

export function SearchView({ onPlayVideo, onDownloadVideo, onAddToCollection }: SearchViewProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VideoSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleSearch = async (overrideQuery?: string) => {
    const targetQuery = (overrideQuery ?? query).trim()
    if (!targetQuery) return

    if (overrideQuery) {
      setQuery(overrideQuery)
    }

    setIsSearching(true)
    setError('')
    setHasSearched(true)

    try {
      const data = await searchVideos(targetQuery, 24)
      setResults(data)
      if (data.length === 0) {
        setError('No videos found for this search. Try different keywords.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not complete video search.')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleCopyUrl = async (video: VideoSearchResult) => {
    try {
      await navigator.clipboard.writeText(video.url)
      setCopiedId(video.id)
      setTimeout(() => {
        setCopiedId((curr) => (curr === video.id ? null : curr))
      }, 2000)
    } catch {
      // Fallback copy using textarea
      const el = document.createElement('textarea')
      el.value = video.url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedId(video.id)
      setTimeout(() => {
        setCopiedId((curr) => (curr === video.id ? null : curr))
      }, 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <section
        aria-label="Video Search Form"
        className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
      >
        <div className="pb-3">
          <div className="flex items-center gap-2">
            <VideoIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Video Search
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-stone-500 dark:text-stone-400">
            Search keywords across YouTube to find, stream full screen, or download high-definition videos.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSearch()
          }}
          className="mt-2"
        >
          <div className="relative flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos (e.g. Inception trailer, MKBHD, 4K documentary)..."
                className="focus-ring h-12 sm:h-13 w-full rounded-xl border border-stone-200/90 bg-stone-50/60 pl-11 pr-10 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 shadow-2xs transition hover:bg-stone-50 focus:bg-white dark:border-white/[0.08] dark:bg-[#121310]/70 dark:text-stone-100 dark:placeholder:text-stone-500 dark:hover:bg-[#121310] dark:focus:bg-[#121310]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                  aria-label="Clear query"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 sm:px-7 text-sm sm:text-base font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300 dark:disabled:bg-stone-800/80 dark:disabled:text-stone-600"
            >
              {isSearching ? (
                <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
              <span>{isSearching ? 'Searching…' : 'Search'}</span>
            </button>
          </div>
        </form>

        {/* Quick query chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Try:
          </span>
          {SAMPLE_QUERIES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => handleSearch(sample)}
              className="focus-ring rounded-lg border border-stone-200/80 bg-stone-50/70 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-300 dark:hover:border-amber-400/40 dark:hover:bg-amber-400/10 dark:hover:text-amber-300 transition"
            >
              {sample}
            </button>
          ))}
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm font-medium text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 shadow-2xs">
          {error}
        </div>
      )}

      {/* Loading state indicator */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 dark:border-white/[0.08] py-16 text-center">
          <SpinnerIcon className="h-8 w-8 animate-spin text-amber-500 dark:text-amber-400" />
          <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
            Searching YouTube video repository…
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">Retrieving metadata, views, and ratings</p>
        </div>
      )}

      {/* Search results grid */}
      {!isSearching && results.length > 0 && (
        <section aria-label="Search Results" className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-heading text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
              Videos Found ({results.length})
            </h3>
            <span className="text-xs text-stone-500 dark:text-stone-400">Click any video to stream</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {results.map((video) => {
              const isCopied = copiedId === video.id

              return (
                <div
                  key={video.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-soft transition-all hover:border-amber-500/40 hover:shadow-lift dark:border-white/[0.08] dark:bg-[#181915] dark:hover:border-amber-400/40"
                >
                  <div>
                    {/* Big & Visible Thumbnail */}
                    <div
                      className="relative aspect-video w-full cursor-pointer overflow-hidden bg-stone-950"
                      onClick={() => onPlayVideo(video)}
                    >
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        onError={(e) => {
                          e.currentTarget.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
                        }}
                      />

                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-all duration-200 group-hover:opacity-100">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xl ring-4 ring-white/30 transition-all duration-200 group-hover:scale-110 group-hover:bg-amber-400 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:ring-black/40">
                          <PlayIcon className="h-7 w-7" />
                        </div>
                      </div>

                      {/* Badges (4K / CC) */}
                      {video.badges && video.badges.length > 0 && (
                        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                          {video.badges.map((b) => (
                            <span
                              key={b}
                              className="rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 backdrop-blur-md"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Duration overlay badge */}
                      {video.duration && (
                        <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/80 px-2 py-0.5 font-mono text-xs font-bold text-white shadow-xs backdrop-blur-md">
                          {video.duration}
                        </span>
                      )}
                    </div>

                    {/* Metadata Content */}
                    <div className="p-4 sm:p-5">
                      {/* Video Title */}
                      <h4
                        onClick={() => onPlayVideo(video)}
                        className="line-clamp-2 cursor-pointer font-sans text-sm sm:text-base font-bold text-stone-900 transition hover:text-amber-600 dark:text-stone-100 dark:hover:text-amber-400"
                        title={video.title}
                      >
                        {video.title}
                      </h4>

                      {/* Channel Row */}
                      <div className="mt-2.5 flex items-center gap-2">
                        {video.channel_thumbnail ? (
                          <img
                            src={video.channel_thumbnail}
                            alt={video.channel}
                            className="h-6 w-6 shrink-0 rounded-full object-cover shadow-2xs"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">
                            {video.channel.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate text-xs font-semibold text-stone-600 dark:text-stone-300">
                          {video.channel}
                        </span>
                      </div>

                      {/* Video Stats Row (Views, Upload Date, Likes, Dislikes) */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-stone-100 dark:border-white/[0.04] pt-3 text-xs text-stone-500 dark:text-stone-400">
                        {/* Views */}
                        <div className="flex items-center gap-1 font-medium" title="Views">
                          <EyeIcon className="h-3.5 w-3.5 text-stone-400" />
                          <span>{video.views || 'Views unavailable'}</span>
                        </div>

                        {/* Upload Date */}
                        {video.upload_date && (
                          <>
                            <span className="text-stone-300 dark:text-stone-700">•</span>
                            <span className="font-medium">{video.upload_date}</span>
                          </>
                        )}

                        {/* Likes */}
                        {video.likes !== null && video.likes !== undefined && (
                          <>
                            <span className="text-stone-300 dark:text-stone-700">•</span>
                            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title="Likes">
                              <ThumbsUpIcon className="h-3.5 w-3.5" />
                              <span>{formatCompactNumber(video.likes)}</span>
                            </div>
                          </>
                        )}

                        {/* Dislikes */}
                        {video.dislikes !== null && video.dislikes !== undefined && (
                          <>
                            <span className="text-stone-300 dark:text-stone-700">•</span>
                            <div className="flex items-center gap-1 text-stone-500 dark:text-stone-400 font-medium" title="Dislikes">
                              <ThumbsDownIcon className="h-3.5 w-3.5" />
                              <span>{formatCompactNumber(video.dislikes)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar beside/under each video */}
                  <div className="flex items-center justify-between gap-2 border-t border-stone-200/80 bg-stone-50/50 p-3 sm:px-5 dark:border-white/[0.08] dark:bg-[#121310]/50">
                    {/* Play Video Button */}
                    <button
                      type="button"
                      onClick={() => onPlayVideo(video)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white shadow-2xs transition hover:bg-amber-600 active:scale-95 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
                    >
                      <PlayIcon className="h-4 w-4" />
                      <span>Play Video</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Copy URL Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(video)}
                        className={`focus-ring inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition active:scale-95 ${
                          isCopied
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-stone-200/90 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#22241E]'
                        }`}
                        title="Copy video link"
                        aria-label="Copy video URL"
                      >
                        {isCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
                      </button>

                      {/* Download Button */}
                      <button
                        type="button"
                        onClick={() => onDownloadVideo(video)}
                        className="focus-ring rounded-xl border border-stone-200/90 bg-white p-2 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 active:scale-95 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#22241E] dark:hover:text-stone-100"
                        title="Download video"
                        aria-label="Download video"
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </button>

                      {/* Add to Collection Button */}
                      <button
                        type="button"
                        onClick={() => onAddToCollection(video)}
                        className="focus-ring rounded-xl border border-stone-200/90 bg-white p-2 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 active:scale-95 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#22241E] dark:hover:text-stone-100"
                        title="Add to temporary collection"
                        aria-label="Add to temporary collection"
                      >
                        <CollectionIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Empty Initial Search State */}
      {!isSearching && results.length === 0 && !hasSearched && (
        <div className="rounded-2xl border border-dashed border-stone-200 dark:border-white/[0.08] p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400 shadow-2xs">
            <VideoIcon className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-heading text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
            Search Any Video
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-xs sm:text-sm text-stone-500 dark:text-stone-400">
            Type keyword terms or video titles in the box above to explore video results with views, likes, dislikes, and fullscreen streaming.
          </p>
        </div>
      )}
    </div>
  )
}

