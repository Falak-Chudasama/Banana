import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'
import { playBack, playEnter, playScroll } from '../lib/sound'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export function Select({ label, value, options, onChange, disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const triggerId = useId()
  const listboxId = useId()

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) return

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, selectedIndex])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setOpen(true)
      }
      return
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        playBack()
        break
      case 'ArrowDown':
        event.preventDefault()
        playScroll()
        setHighlightedIndex((prev) => (prev + 1 < options.length ? prev + 1 : 0))
        break
      case 'ArrowUp':
        event.preventDefault()
        playScroll()
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : options.length - 1))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          playEnter()
          onChange(options[highlightedIndex].value)
          setOpen(false)
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <label
        htmlFor={triggerId}
        className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400"
      >
        {label}
      </label>

      <button
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          setOpen((prev) => {
            if (!prev) playEnter()
            else playBack()
            return !prev
          })
        }}
        onKeyDown={handleKeyDown}
        className="focus-ring mt-2 flex h-12 sm:h-14 w-full items-center justify-between rounded-xl border border-stone-200/90 bg-stone-50/60 px-4 text-left text-sm font-semibold text-stone-900 shadow-xs transition hover:bg-stone-50 focus:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.08] dark:bg-[#121310]/70 dark:text-stone-100 dark:hover:bg-[#121310]"
      >
        <span className="truncate">{selectedOption?.label ?? 'Select quality…'}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 dark:text-stone-500 ${
            open ? 'rotate-180 text-banana-amber dark:text-banana-peel' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          className="glass-panel animate-scale-in absolute z-30 mt-2 max-h-64 w-full origin-top overflow-y-auto rounded-xl p-1.5 shadow-floating"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isHighlighted = index === highlightedIndex

            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    playEnter()
                    onChange(option.value)
                    setOpen(false)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full min-h-[44px] items-center justify-between rounded-lg px-3.5 py-2 text-left text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-banana-strong text-white font-bold shadow-xs dark:bg-banana-peel dark:text-stone-950'
                      : isHighlighted
                        ? 'bg-stone-100/80 text-stone-900 dark:bg-white/10 dark:text-white'
                        : 'text-stone-700 hover:bg-stone-100/60 dark:text-stone-300 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-white dark:text-stone-950" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
