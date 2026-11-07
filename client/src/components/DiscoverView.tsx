import { useState } from 'react'
import { fetchDiscoverRecommendations, resolveDiscoverSeed } from '../lib/discover'
import { formatDuration } from '../lib/media'
import type { DiscoverCategory, DiscoverPreferences, TrackItem } from '../lib/types'
import {
  AlertIcon,
  CheckIcon,
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
      setLikedIds((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]))
    } else if (type === 'dislike') {
      setDislikedIds((prev) => [...prev, trackId])
      setRecommendations((prev) => prev.filter((t) => t.id !== trackId))
    } else if (type === 'known') {
      setKnownIds((prev) => [...prev, trackId])
      setRecommendations((prev) => prev.filter((t) => t.id !== trackId))
    }
  }

  return (
    <div className="space-y-8">
      {/* Search Input Area */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10 shadow-glass">
        <form onSubmit={handleSearch} className="relative">
          <div className="flex items-center justify-between pb-3">
            <label htmlFor="discover-input" className="text-xs font-bold uppercase tracking-wider text-lychee-ink/70">
              Discover Seed (Song Title, Artist, or YouTube URL)
            </label>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="rounded-xl px-3 py-1 text-xs sm:text-sm font-bold text-lychee-shell transition hover:bg-lychee-shell-50"
            >
              {showFilters ? 'Hide Preferences' : 'Tune Preferences'}
            </button>
          </div>

          <div className="relative mt-1 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-lychee-seed-500" />
              <input
                id="discover-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Knee Socks Arctic Monkeys or YouTube link..."
                className="focus-ring h-14 sm:h-16 w-full rounded-2xl border border-white/70 bg-white/80 pl-14 pr-12 text-base sm:text-lg text-lychee-ink placeholder:text-lychee-ink/35 transition hover:bg-white/95 focus:bg-white shadow-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-lychee-ink/40 hover:bg-lychee-membrane-100 hover:text-lychee-ink"
                  aria-label="Clear query"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!query.trim() || isResolving}
              className="focus-ring inline-flex h-14 sm:h-16 items-center justify-center gap-2.5 rounded-2xl bg-lychee-shell px-8 text-base font-bold text-white shadow-soft transition hover:bg-lychee-shell-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isResolving ? (
                <SpinnerIcon className="h-5 w-5 animate-spin text-white" />
              ) : (
                <SparklesIcon className="h-5 w-5" />
              )}
              <span>{isResolving ? 'Finding…' : 'Discover'}</span>
            </button>
          </div>
        </form>

        {/* Expandable preferences */}
        {showFilters && (
          <div className="animate-fade-in mt-6 grid grid-cols-1 gap-4 border-t border-lychee-border/40 pt-5 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-lychee-seed-700">Similarity</label>
              <select
                value={prefs.similarity}
                onChange={(e) => handlePrefChange('similarity', e.target.value)}
                className="focus-ring mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-lychee-ink shadow-sm"
              >
                <option value="very_similar">Very Similar</option>
                <option value="balanced">Balanced</option>
                <option value="experimental">Experimental</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-lychee-seed-700">Popularity</label>
              <select
                value={prefs.popularity}
                onChange={(e) => handlePrefChange('popularity', e.target.value)}
                className="focus-ring mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-lychee-ink shadow-sm"
              >
                <option value="underground">Underground / Hidden</option>
                <option value="balanced">Balanced</option>
                <option value="popular">Popular / Mainstream</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-lychee-seed-700">Artist Diversity</label>
              <select
                value={prefs.diversity}
                onChange={(e) => handlePrefChange('diversity', e.target.value)}
                className="focus-ring mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-lychee-ink shadow-sm"
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
          <div className="animate-fade-in mt-6 flex items-center justify-between rounded-2xl border border-white/80 bg-white/80 p-4 shadow-glass">
            <div className="flex items-center gap-4 min-w-0">
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
                className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm"
              />
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-lychee-shell">
                  Seed Song
                </span>
                <p className="truncate text-base font-bold text-lychee-ink">{seed.title}</p>
                <p className="truncate text-xs sm:text-sm font-medium text-lychee-seed-500">
                  {seed.artist} {seed.duration ? `· ${formatDuration(seed.duration)}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onPlayTrack(seed)}
                className="rounded-xl p-2.5 text-lychee-shell hover:bg-lychee-shell-50 transition active:scale-95"
                title="Play seed song"
              >
                <PlayIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onDownloadTrack(seed)}
                className="rounded-xl p-2.5 text-lychee-seed-700 hover:bg-lychee-membrane-100 transition active:scale-95"
                title="Download seed song"
              >
                <DownloadIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="animate-fade-in mt-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm font-medium text-rose-800">
            <AlertIcon className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Category Navigation Pills */}
      {seed && (
        <div className="flex flex-wrap items-center gap-2.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`rounded-2xl px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold shadow-sm transition active:scale-95 ${
                category === cat.id
                  ? 'bg-lychee-shell text-white shadow-soft'
                  : 'glass-panel text-lychee-ink hover:bg-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Recommendation Results List */}
      {seed && (
        <section aria-label="Recommendations" className="glass-panel rounded-3xl p-6 sm:p-10 shadow-glass">
          <div className="flex items-center justify-between pb-4">
            <h3 className="text-lg sm:text-xl font-extrabold text-lychee-ink">
              {CATEGORIES.find((c) => c.id === category)?.label}
            </h3>
            {isLoadingRecs && <SpinnerIcon className="h-5 w-5 animate-spin text-lychee-shell" />}
          </div>

          <div className="divide-y divide-lychee-border/30">
            {recommendations.length === 0 && !isLoadingRecs ? (
              <p className="py-12 text-center text-sm font-medium text-lychee-seed-500">
                No recommendations found for this category. Try another category or adjust preferences.
              </p>
            ) : (
              recommendations.map((track) => (
                <div
                  key={track.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 transition hover:bg-white/50 rounded-2xl px-3 -mx-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
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
                      className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl object-cover shadow-sm"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base sm:text-lg font-bold text-lychee-ink">{track.title}</p>
                      <p className="truncate text-xs sm:text-sm font-medium text-lychee-seed-500">
                        {track.artist} {track.duration ? `· ${formatDuration(track.duration)}` : ''}
                      </p>
                      {track.reason && (
                        <span className="mt-1 inline-block text-xs font-semibold text-lychee-shell bg-lychee-shell-50 rounded-lg px-2.5 py-0.5">
                          {track.reason}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-lychee-shell/10 text-lychee-shell hover:bg-lychee-shell hover:text-white transition-all shadow-sm active:scale-95"
                      title="Play track"
                      aria-label="Play track"
                    >
                      <PlayIcon className="h-5 w-5 translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadTrack(track)}
                      className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-lychee-seed-700 hover:bg-white hover:text-lychee-ink shadow-sm transition-all active:scale-95"
                      title="Download track"
                      aria-label="Download track"
                    >
                      <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddToCollection(track)}
                      className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-lychee-seed-700 hover:bg-white hover:text-lychee-ink shadow-sm transition-all active:scale-95"
                      title="Add to temporary collection"
                      aria-label="Add to collection"
                    >
                      <CollectionIcon className="h-5 w-5" />
                    </button>

                    {/* Feedback controls capsule */}
                    <div className="flex items-center rounded-2xl border border-white/80 bg-white/80 p-1 shadow-glass backdrop-blur-md">
                      <button
                        type="button"
                        onClick={() => handleFeedback(track.id, 'like')}
                        className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all duration-150 active:scale-90 ${
                          likedIds.includes(track.id)
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'text-lychee-seed-700 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                        title="More like this"
                        aria-label="Like track"
                      >
                        <ThumbsUpIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(track.id, 'dislike')}
                        className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-lychee-seed-700 hover:bg-rose-50 hover:text-rose-600 transition-all duration-150 active:scale-90"
                        title="Fewer like this"
                        aria-label="Dislike track"
                      >
                        <ThumbsDownIcon className="h-4 w-4 sm:h-5 sm:w-5" />
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

