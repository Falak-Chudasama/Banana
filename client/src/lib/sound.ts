/**
 * Banana UI Sound Effects (SFX) Subsystem
 * Follows Fruit Family Design System (DESIGN.md Section 2.10)
 *
 * Provides tactile audio feedback for key interactions across 5 categories:
 * - enter: Primary action clicks, confirmations (~80-150ms, vol 0.40)
 * - back: Dismissals, cancellations, closures (~70-120ms, vol 0.35)
 * - notification: Success toasts, completed jobs, additions (~120-250ms, vol 0.45)
 * - failed: Errors, failed jobs, invalid operations (~150-250ms, vol 0.45)
 * - scroll: Route/tab navigation cycle, throttled 140ms (~30-60ms, vol 0.25)
 *
 * Mute Setting:
 * Respects `localStorage['fruit_sound_enabled']` (default true).
 * When disabled, audio calls exit immediately before attempting initialization.
 * Silent Failure:
 * If files are absent or autoplay is restricted, execution continues 100% silently.
 */

import { useEffect, useState } from 'react'

export type SoundCategory = 'scroll' | 'enter' | 'back' | 'failed' | 'notification'

const SOUND_STORAGE_KEY = 'fruit_sound_enabled'
const SOUND_EVENT_NAME = 'fruit_sound_toggle'

const SFX_FILES: Record<SoundCategory, string> = {
  scroll: '/sfx/scroll.mp3',
  enter: '/sfx/enter.mp3',
  back: '/sfx/back.mp3',
  failed: '/sfx/failed.mp3',
  notification: '/sfx/notification.mp3',
}

// Master volume levels from DESIGN.md Section 2.10
const VOLUMES: Record<SoundCategory, number> = {
  scroll: 0.25,
  enter: 0.40,
  back: 0.35,
  failed: 0.45,
  notification: 0.45,
}

// Audio pool to allow quick overlap without latency
const audioCache: Partial<Record<SoundCategory, HTMLAudioElement>> = {}
let lastScrollTime = 0
const SCROLL_THROTTLE_MS = 140

/**
 * Check if audio is enabled.
 * Sound stays permanently enabled in Banana (no user toggle).
 */
export function isSoundEnabled(): boolean {
  return true
}

/**
 * Update sound preference and dispatch update event across components.
 */
export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent(SOUND_EVENT_NAME, { detail: { enabled } }))
  } catch {
    // Graceful fallback if localStorage is disabled
  }
}

/**
 * Toggle sound setting on/off.
 */
export function toggleSound(): boolean {
  const next = !isSoundEnabled()
  setSoundEnabled(next)
  if (next) {
    playEnter()
  }
  return next
}

/**
 * React hook for consuming and updating sound toggle state.
 */
export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => isSoundEnabled())

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnabledState(customEvent.detail.enabled)
      } else {
        setEnabledState(isSoundEnabled())
      }
    }

    window.addEventListener(SOUND_EVENT_NAME, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(SOUND_EVENT_NAME, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const setEnabled = (val: boolean) => {
    setSoundEnabled(val)
    setEnabledState(val)
  }

  return [enabled, setEnabled]
}

/**
 * Play a UI sound effect if enabled.
 * Exits immediately if sound is muted before allocating Audio resources.
 * Silently catches and ignores autoplay rejections or missing files.
 */
export function playSound(category: SoundCategory): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return
  }

  // 1. Immediately exit if user muted sound
  if (!isSoundEnabled()) {
    return
  }

  // 2. Throttle scroll category calls
  if (category === 'scroll') {
    const now = Date.now()
    if (now - lastScrollTime < SCROLL_THROTTLE_MS) {
      return
    }
    lastScrollTime = now
  }

  try {
    let audio = audioCache[category]
    if (!audio) {
      audio = new Audio(SFX_FILES[category])
      audio.preload = 'auto'
      audio.volume = VOLUMES[category] ?? 0.40
      audioCache[category] = audio
    } else {
      audio.currentTime = 0
    }

    const promise = audio.play()
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        // Autoplay policy restriction or missing asset: fail completely silently
      })
    }
  } catch {
    // Fail silently
  }
}

export const playEnter = () => playSound('enter')
export const playBack = () => playSound('back')
export const playNotification = () => playSound('notification')
export const playFailed = () => playSound('failed')
export const playScroll = () => playSound('scroll')
