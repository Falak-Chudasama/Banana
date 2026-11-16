import React, { useEffect, useRef, useState } from 'react'
import type { NavTab } from '../lib/types'

const TAB_ORDER: Record<NavTab, number> = {
  download: 0,
  discover: 1,
  search: 2,
  playlists: 3,
}

interface DirectionalTabTransitionProps {
  activeTab: NavTab
  direction?: 'right' | 'left' | 'fade'
  renderTab: (tab: NavTab) => React.ReactNode
}

/**
 * DirectionalTabTransition
 * Fluid, GPU-accelerated directional route transitions (DESIGN.md Section 2.9).
 *
 * When moving rightward (e.g. Download -> Discover):
 * - New view slides in smoothly from the right (animate-slide-from-right)
 * When moving leftward (e.g. Discover -> Download):
 * - New view slides in smoothly from the left (animate-slide-from-left)
 * Initial mount / direct navigation:
 * - Gentle scale and fade enter (animate-page-enter)
 *
 * Single-layer DOM architecture eliminates layout height snapping, prevents
 * duplicate component rendering, and guarantees butter-smooth 60/120fps motion.
 */
export function DirectionalTabTransition({
  activeTab,
  direction: explicitDirection,
  renderTab,
}: DirectionalTabTransitionProps) {
  const prevTabRef = useRef<NavTab>(activeTab)
  const isFirstMountRef = useRef<boolean>(true)
  const [animClass, setAnimClass] = useState<string>('animate-page-enter')

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      return
    }

    if (activeTab !== prevTabRef.current) {
      const prev = prevTabRef.current
      const prevIdx = TAB_ORDER[prev] ?? 0
      const currIdx = TAB_ORDER[activeTab] ?? 0

      let dir: 'right' | 'left' | 'fade' = explicitDirection || 'fade'
      if (!explicitDirection) {
        if (prevIdx === 3 && currIdx === 0) {
          dir = 'right'
        } else if (prevIdx === 0 && currIdx === 3) {
          dir = 'left'
        } else if (currIdx > prevIdx) {
          dir = 'right'
        } else if (currIdx < prevIdx) {
          dir = 'left'
        }
      }

      if (dir === 'right') {
        setAnimClass('animate-slide-from-right')
      } else if (dir === 'left') {
        setAnimClass('animate-slide-from-left')
      } else {
        setAnimClass('animate-page-enter')
      }

      prevTabRef.current = activeTab
    }
  }, [activeTab, explicitDirection])

  return (
    <div
      key={activeTab}
      className={`w-full will-change-[transform,opacity] ${animClass}`}
    >
      {renderTab(activeTab)}
    </div>
  )
}
