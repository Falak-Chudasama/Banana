import { useEffect } from 'react'
import { playScroll } from '../lib/sound'
import type { NavTab } from '../lib/types'

export const NAV_TABS: readonly NavTab[] = [
  'download',
  'discover',
  'search',
  'playlists',
] as const

interface UseKeyboardNavOptions {
  activeTab: NavTab
  onTabChange: (nextTab: NavTab, direction?: 'right' | 'left') => void
}

/**
 * Global keyboard navigation hook.
 * Follows Fruit Family Keybindings (DESIGN.md / Kiwi Standard):
 * - Ctrl + ArrowRight (or Cmd + ArrowRight) -> cycle to next tab
 * - Ctrl + ArrowLeft (or Cmd + ArrowLeft) -> cycle to previous tab
 * - Plays throttled tactile scroll SFX on switch
 * - Does not intercept when typing in input, textarea, or contentEditable
 */
export function useKeyboardNav({ activeTab, onTabChange }: UseKeyboardNavOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must hold a Ctrl key (either Left Ctrl or Right Ctrl; e.ctrlKey detects any Ctrl key on all OSes).
      // Also allow e.metaKey for Mac Command key convenience.
      if (!e.ctrlKey && !e.metaKey) return

      // Ignore if user is holding Shift or Alt (to avoid colliding with text selection/system commands)
      if (e.shiftKey || e.altKey) return

      // Don't intercept if user is actively editing text inside an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const isRight = e.key === 'ArrowRight' || e.code === 'ArrowRight'
      const isLeft = e.key === 'ArrowLeft' || e.code === 'ArrowLeft'

      if (!isRight && !isLeft) return

      e.preventDefault()

      const currentIndex = NAV_TABS.indexOf(activeTab)
      if (currentIndex === -1) return

      let nextIndex = currentIndex
      if (isRight) {
        nextIndex = (currentIndex + 1) % NAV_TABS.length
      } else if (isLeft) {
        nextIndex = (currentIndex - 1 + NAV_TABS.length) % NAV_TABS.length
      }

      const nextTab = NAV_TABS[nextIndex]
      if (nextTab && nextTab !== activeTab) {
        playScroll()
        onTabChange(nextTab, isRight ? 'right' : 'left')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTab, onTabChange])
}
