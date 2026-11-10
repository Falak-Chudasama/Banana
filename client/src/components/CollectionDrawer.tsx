import { formatDuration } from '../lib/media'
import type { TrackItem } from '../lib/types'
import {
  CloseIcon,
  CollectionIcon,
  DownloadIcon,
  PlayIcon,
  TrashIcon,
} from './icons'

interface CollectionDrawerProps {
  collection: TrackItem[]
  isOpen: boolean
  onClose: () => void
  onPlayTrack: (track: TrackItem) => void
  onRemoveTrack: (id: string) => void
  onClearCollection: () => void
  onDownloadTrack: (track: TrackItem) => void
}

export function CollectionDrawer({
  collection,
  isOpen,
  onClose,
  onPlayTrack,
  onRemoveTrack,
  onClearCollection,
  onDownloadTrack,
}: CollectionDrawerProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm dark:bg-black/65 transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="animate-fade-in flex h-full w-full max-w-md sm:max-w-lg flex-col justify-between border-l border-black/[0.08] dark:border-white/[0.08] bg-white/95 dark:bg-[#181915]/95 p-6 sm:p-7 shadow-floating backdrop-blur-2xl"
        role="dialog"
        aria-label="Temporary Collection Drawer"
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-white/[0.08] pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400">
                <CollectionIcon className="h-5 w-5" />
              </div>
              <h3 className="font-sans text-lg font-bold text-stone-900 dark:text-stone-50">Collection</h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">
                {collection.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200 transition"
              aria-label="Close collection drawer"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* List */}
          <div className="mt-5 max-h-[calc(100vh-210px)] space-y-2.5 overflow-y-auto pr-1">
            {collection.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800/80 text-stone-400 dark:text-stone-500 mb-3.5">
                  <CollectionIcon className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">Your collection is empty</p>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 max-w-xs">
                  Save tracks from Downloader, Discover, or Playlists to access them quickly during this session.
                </p>
              </div>
            ) : (
              collection.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1C1D18] p-3 shadow-2xs hover:bg-stone-50/80 dark:hover:bg-[#20211C] transition"
                >
                  <div className="flex min-w-0 items-center gap-3">
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
                      className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-2xs"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{track.title}</p>
                      <p className="truncate text-xs font-medium text-stone-500 dark:text-stone-400">
                        {track.artist} &middot; {formatDuration(track.duration)}
                        {typeof track.match_score === 'number' ? ` · ${track.match_score}% match` : ''}
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
                      className="focus-ring rounded-lg p-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10 transition active:scale-95"
                      title="Download track"
                      aria-label="Download track"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(track.id)}
                      className="focus-ring rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:text-stone-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition active:scale-95"
                      title="Remove from collection"
                      aria-label="Remove track"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer actions */}
        {collection.length > 0 && (
          <div className="border-t border-stone-200/80 dark:border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClearCollection}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/30 py-2.5 text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100/90 dark:hover:bg-rose-900/40 transition active:scale-98"
            >
              <TrashIcon className="h-4 w-4" />
              <span>Clear Collection ({collection.length})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
