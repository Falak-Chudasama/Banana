import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { playScroll } from '../lib/sound'

export interface SegmentOption<T extends string> {
  id: T
  label: string
  count?: number
  icon?: React.ReactNode
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}

/**
 * SegmentedControl: Fruit Family Standard Segmented Pill Control
 * Follows DESIGN.md Section 5.7 & Section 2.9 (Motion)
 *
 * Dimensions:
 * - Capsule shape 9999px (rounded-full)
 * - Track height: 44px
 * - Dynamic sliding active indicator pill with shadow-xs (motion.pill physics)
 * - Audio: Soft tactile tick (playScroll) on segment switch
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel = 'Segmented options',
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [pillStyle, setPillStyle] = useState<{
    left: number
    top: number
    width: number
    height: number
    opacity: number
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 })
  const [isReady, setIsReady] = useState(false)

  const updatePill = () => {
    const activeEl = itemRefs.current[value]
    const container = containerRef.current
    if (activeEl && container) {
      let left = activeEl.offsetLeft
      let top = activeEl.offsetTop
      if (activeEl.offsetParent !== container) {
        const containerRect = container.getBoundingClientRect()
        const elRect = activeEl.getBoundingClientRect()
        left = Math.round(elRect.left - containerRect.left)
        top = Math.round(elRect.top - containerRect.top)
      }
      const width = Math.round(activeEl.offsetWidth)
      const height = Math.round(activeEl.offsetHeight)

      if (width > 0 && height > 0) {
        setPillStyle({
          left,
          top,
          width,
          height,
          opacity: 1,
        })
      }
    } else {
      setPillStyle((prev) => ({ ...prev, opacity: 0 }))
    }
  }

  useLayoutEffect(() => {
    updatePill()
  }, [value, options])

  useEffect(() => {
    updatePill()
    const timer = setTimeout(() => {
      updatePill()
      setIsReady(true)
    }, 40)
    window.addEventListener('resize', updatePill)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updatePill)
    }
  }, [value, options])

  const handleSelect = (id: T) => {
    if (id === value) return
    playScroll()
    onChange(id)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      ref={containerRef}
      className={`glass-panel relative flex h-11 items-center gap-1 rounded-full p-1 shadow-xs ${className}`}
    >
      {/* Sliding Active Indicator Pill */}
      <div
        className={`absolute top-0 left-0 z-0 rounded-full bg-stone-900 dark:bg-stone-100 shadow-xs pointer-events-none ${
          isReady ? 'transition-[transform,width] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]' : ''
        }`}
        style={{
          transform: `translate3d(${pillStyle.left}px, ${pillStyle.top}px, 0)`,
          width: `${pillStyle.width}px`,
          height: `${pillStyle.height}px`,
          opacity: pillStyle.opacity,
          willChange: 'transform, width',
        }}
        aria-hidden="true"
      />

      {options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            ref={(el) => {
              itemRefs.current[option.id] = el
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => handleSelect(option.id)}
            className={`relative z-10 focus-ring flex h-9 flex-1 min-h-[36px] sm:min-w-[48px] items-center justify-center gap-1.5 rounded-full px-3 text-xs sm:text-sm font-semibold transition-colors duration-200 select-none ${
              isActive
                ? 'text-white dark:text-stone-900 font-bold'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span className="truncate">{option.label}</span>
            {typeof option.count === 'number' && (
              <span
                className={`ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-micro font-bold transition-colors ${
                  isActive
                    ? 'bg-stone-700 text-stone-100 dark:bg-stone-300 dark:text-stone-900'
                    : 'bg-stone-200/80 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
