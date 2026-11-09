import { useState } from 'react'
import { fetchDiscoverRecommendations, resolveDiscoverSeed } from '../lib/discover'
import { formatDuration } from '../lib/media'
import type { DiscoverCategory, DiscoverPreferences, TrackItem } from '../lib/types'
import {
  AlertIcon,
  CloseIcon,
  CollectionIcon,
  DownloadIcon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
  SpinnerIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from './icons'

interface DiscoverViewProps {
  onPlayTrack: (track: TrackItem) => void
  onDownloadTrack: (track: TrackItem) => void
  onAddToCollection: (track: TrackItem) => void
}

const CATEGORIES: { id: DiscoverCategory; label: string }[] = [
  { id: 'more_like_this', label: 'More Like This' },
  { id: 'same_vibe', label: 'Same Vibe' },
  { id: 'hidden_gems', label: 'Hidden Gems' },
  { id: 'trending', label: 'Trending' },
  { id: 'explore', label: 'Explore' },
]

export function DiscoverView({ onPlayTrack, onDownloadTrack, onAddToCollection }: DiscoverViewProps) {
  const [query, setQuery] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  const [seed, setSeed] = useState<TrackItem | null>(null)

  const [category, setCategory] = useState<DiscoverCategory>('more_like_this')
  const [prefs, setPrefs] = useState<DiscoverPreferences>({
    similarity: 'balanced',
    popularity: 'balanced',
    diversity: 'normal',
  })
  const [showFilters, setShowFilters] = useState(false)

  const [recommendations, setRecommendations] = useState<TrackItem[]>([])
  const [isLoadingRecs, setIsLoadingRecs] = useState(false)
  const [error, setError] = useState('')

  // In-memory session feedback
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [dislikedIds, setDislikedIds] = useState<string[]>([])
  const [knownIds, setKnownIds] = useState<string[]>([])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!query.trim()) return

    setIsResolving(true)
    setError('')
    setSeed(null)
    setRecommendations([])

    try {
      const seedTrack = await resolveDiscoverSeed(query)
      setSeed(seedTrack)
      loadRecommendations(seedTrack, category, prefs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not find seed track.')
    } finally {
      setIsResolving(false)
    }
  }

  const loadRecommendations = async (
    seedTrack: TrackItem,
    targetCategory: DiscoverCategory,
    targetPrefs: DiscoverPreferences,
  ) => {
    setIsLoadingRecs(true)
    setError('')

    try {
      const recs = await fetchDiscoverRecommendations(
        seedTrack,
        targetCategory,
        targetPrefs,
        { liked: likedIds, disliked: dislikedIds, known: knownIds },
      )
      setRecommendations(recs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations.')
    } finally {
      setIsLoadingRecs(false)
    }
  }

  const handleCategoryChange = (newCat: DiscoverCategory) => {
    setCategory(newCat)
    if (seed) {
      loadRecommendations(seed, newCat, prefs)
    }
  }

  const handlePrefChange = (key: keyof DiscoverPreferences, value: any) => {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    if (seed) {
      loadRecommendations(seed, category, updated)
    }
  }

  const handleFeedback = (trackId: string, type: 'like' | 'dislike' | 'known') => {
    if (type === 'like') {
      setLikedIds((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]))
      setDislikedIds((prev) => prev.filter((id) => id !== trackId))
    } else if (type === 'dislike') {
      setDislikedIds((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]))
      setLikedIds((prev) => prev.filter((id) => id !== trackId))
      // Preserved in list: do not remove the track from recommendations
    } else if (type === 'known') {
      setKnownIds((prev) => [...prev, trackId])
      setRecommendations((prev) => prev.filter((t) => t.id !== trackId))
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Input Area */}
      <section
        aria-label="Discover Seed Form"
        className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
      >
        <form onSubmit={handleSearch}>
          <div className="flex items-center justify-between pb-2">
            <label
              htmlFor="discover-input"
              className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400"
            >
              Seed Track (Title, Artist, or YouTube Link)
            </label>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="focus-ring rounded-lg px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10 transition"
            >
              {showFilters ? 'Hide Preferences' : 'Tune Preferences'}
            </button>
          </div>

          <div className="relative mt-1.5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
              <input
                id="discover-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Arctic Monkeys Knee Socks or YouTube link..."
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
              disabled={!query.trim() || isResolving}
              className="focus-ring inline-flex h-12 sm:h-13 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 sm:px-7 text-sm sm:text-base font-bold text-white shadow-soft transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300 dark:disabled:bg-stone-800/80 dark:disabled:text-stone-600"
            >
              {isResolving ? (
                <SpinnerIcon className="h-4 w-4 animate-spin text-white dark:text-stone-950" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              <span>{isResolving ? 'Searching…' : 'Discover'}</span>
            </button>
          </div>
        </form>

        {/* Expandable preferences */}
        {showFilters && (
          <div className="animate-fade-in mt-5 grid grid-cols-1 gap-3.5 border-t border-stone-200/80 dark:border-white/[0.08] pt-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Similarity
              </label>
              <select
                value={prefs.similarity}
                onChange={(e) => handlePrefChange('similarity', e.target.value)}
                className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-stone-200/90 bg-white px-3 text-xs sm:text-sm font-semibold text-stone-800 shadow-2xs dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-100"
              >
                <option value="very_similar">Very Similar</option>
                <option value="balanced">Balanced</option>
                <option value="experimental">Experimental</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Popularity
              </label>
              <select
                value={prefs.popularity}
                onChange={(e) => handlePrefChange('popularity', e.target.value)}
                className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-stone-200/90 bg-white px-3 text-xs sm:text-sm font-semibold text-stone-800 shadow-2xs dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-100"
              >
                <option value="underground">Underground / Hidden</option>
                <option value="balanced">Balanced</option>
                <option value="popular">Popular / Mainstream</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Artist Diversity
              </label>
              <select
                value={prefs.diversity}
                onChange={(e) => handlePrefChange('diversity', e.target.value)}
                className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-stone-200/90 bg-white px-3 text-xs sm:text-sm font-semibold text-stone-800 shadow-2xs dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-100"
              >
                <option value="high">High (Different Artists)</option>
                <option value="normal">Normal</option>
                <option value="familiar">Familiar</option>
              </select>
            </div>
          </div>
        )}

        {/* Seed track indicator */}
        {seed && (
          <div className="animate-fade-in mt-5 flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 shadow-2xs dark:border-amber-400/20 dark:bg-amber-400/5">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={
                  typeof seed.thumbnail === 'string' && seed.thumbnail.startsWith('http')
                    ? seed.thumbnail
                    : `https://i.ytimg.com/vi/${seed.id}/hqdefault.jpg`
                }
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = `https://i.ytimg.com/vi/${seed.id}/hqdefault.jpg`
                }}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-2xs"
              />
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Seed Track
                </span>
                <p className="truncate text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">{seed.title}</p>
                <p className="truncate text-xs font-medium text-stone-500 dark:text-stone-400">
                  {seed.artist} {seed.duration ? `· ${formatDuration(seed.duration)}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onPlayTrack(seed)}
                className="focus-ring rounded-lg p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-400/10 transition active:scale-95"
                title="Play seed song"
                aria-label="Play seed song"
              >
                <PlayIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDownloadTrack(seed)}
                className="focus-ring rounded-lg p-2 text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-white/10 transition active:scale-95"
                title="Download seed song"
                aria-label="Download seed song"
              >
                <DownloadIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

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

      {/* Category Navigation Pills */}
      {seed && (
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`focus-ring rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition active:scale-95 ${
                category === cat.id
                  ? 'bg-amber-500 text-white font-bold shadow-soft dark:bg-amber-400 dark:text-stone-950'
                  : 'border border-stone-200/90 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/[0.08] dark:bg-[#181915] dark:text-stone-300 dark:hover:bg-[#1E1F1A]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Recommendation Results List */}
      {seed && (
        <section
          aria-label="Recommendations"
          className="rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-8 shadow-soft dark:border-white/[0.08] dark:bg-[#181915]"
        >
          <div className="flex items-center justify-between pb-4 border-b border-stone-200/80 dark:border-white/[0.08]">
            <h3 className="font-sans text-base sm:text-lg font-bold text-stone-900 dark:text-stone-50">
              {CATEGORIES.find((c) => c.id === category)?.label}
            </h3>
            {isLoadingRecs && <SpinnerIcon className="h-4 w-4 animate-spin text-amber-500 dark:text-amber-400" />}
          </div>

          <div className="mt-3 divide-y divide-stone-100 dark:divide-white/[0.04]">
            {recommendations.length === 0 && !isLoadingRecs ? (
              <p className="py-12 text-center text-xs sm:text-sm font-medium text-stone-500 dark:text-stone-400">
                No recommendations found for this category. Try another category or adjust preferences.
              </p>
            ) : (
              recommendations.map((track) => (
                <div
                  key={track.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-2 rounded-xl transition hover:bg-stone-50 dark:hover:bg-white/[0.03]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
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
                      className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-2xs"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">{track.title}</p>
                      <p className="truncate text-xs font-medium text-stone-500 dark:text-stone-400">
                        {track.artist} {track.duration ? `· ${formatDuration(track.duration)}` : ''}
                      </p>
                      {track.reason && (
                        <span className="mt-1 inline-block text-[11px] font-semibold text-amber-800 bg-amber-100/70 dark:bg-amber-400/15 dark:text-amber-300 rounded-md px-2 py-0.5">
                          {track.reason}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-1 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-400 dark:hover:text-stone-950 transition active:scale-95"
                      title="Play track"
                      aria-label="Play track"
                    >
                      <PlayIcon className="h-4 w-4 translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadTrack(track)}
                      className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200/90 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] dark:hover:text-white shadow-2xs transition active:scale-95"
                      title="Download track"
                      aria-label="Download track"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddToCollection(track)}
                      className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200/90 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:border-white/[0.08] dark:bg-[#1C1D18] dark:text-stone-300 dark:hover:bg-[#20211C] dark:hover:text-white shadow-2xs transition active:scale-95"
                      title="Add to session collection"
                      aria-label="Add to collection"
                    >
                      <CollectionIcon className="h-4 w-4" />
                    </button>

                    {/* Feedback controls capsule */}
                    <div className="flex items-center rounded-xl border border-stone-200/90 bg-stone-50 dark:border-white/[0.08] dark:bg-[#1C1D18] p-0.5">
                      <button
                        type="button"
                        onClick={() => handleFeedback(track.id, 'like')}
                        className={`focus-ring flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-90 ${
                          likedIds.includes(track.id)
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'text-stone-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-stone-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/40'
                        }`}
                        title="More like this"
                        aria-label="Like track"
                      >
                        <ThumbsUpIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(track.id, 'dislike')}
                        className={`focus-ring flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-90 ${
                          dislikedIds.includes(track.id)
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:text-stone-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/40'
                        }`}
                        title={dislikedIds.includes(track.id) ? 'Disliked (will inform future recommendations)' : 'Fewer like this'}
                        aria-label="Dislike track"
                      >
                        <ThumbsDownIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
