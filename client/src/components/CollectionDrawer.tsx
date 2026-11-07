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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
      <div className="animate-fade-in flex h-full w-full max-w-md sm:max-w-lg flex-col justify-between border-l border-white/80 bg-white/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-lychee-border/40 pb-5">
            <div className="flex items-center gap-3">
              <CollectionIcon className="h-6 w-6 text-lychee-shell" />
              <h3 className="text-lg font-extrabold text-lychee-ink">Collection</h3>
              <span className="rounded-full bg-lychee-shell-50 px-2.5 py-0.5 text-xs font-bold text-lychee-shell">
                {collection.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-lychee-ink/40 hover:bg-lychee-membrane-100 hover:text-lychee-ink transition"
              aria-label="Close collection"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* List */}
          <div className="mt-6 max-h-[calc(100vh-220px)] space-y-3 overflow-y-auto pr-1">
            {collection.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-sm font-medium text-lychee-seed-500">
                <CollectionIcon className="mb-3 h-10 w-10 text-lychee-seed-300" />
                <span>No tracks in collection yet</span>
              </div>
            ) : (
              collection.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3.5 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-glass transition hover:bg-white"
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
                      className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-lychee-ink">{track.title}</p>
                      <p className="truncate text-xs font-medium text-lychee-seed-500">
                        {track.artist} &middot; {formatDuration(track.duration)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="rounded-xl p-2 text-lychee-shell hover:bg-lychee-shell-50 transition active:scale-95"
                      title="Play track"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadTrack(track)}
                      className="rounded-xl p-2 text-lychee-seed-700 hover:bg-lychee-membrane-100 transition active:scale-95"
                      title="Download track"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(track.id)}
                      className="rounded-xl p-2 text-rose-500 hover:bg-rose-50 transition active:scale-95"
                      title="Remove from collection"
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
          <div className="border-t border-lychee-border/40 pt-5">
            <button
              type="button"
              onClick={onClearCollection}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100 transition active:scale-95"
            >
              <TrashIcon className="h-4 w-4" />
              <span>Clear Collection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

