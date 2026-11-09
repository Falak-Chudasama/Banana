import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'

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
        break
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((prev) => (prev + 1 < options.length ? prev + 1 : 0))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : options.length - 1))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
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
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="focus-ring mt-2 flex h-14 w-full items-center justify-between rounded-xl border border-stone-200/90 bg-white px-4 text-left text-sm font-semibold text-stone-900 shadow-2xs transition hover:bg-stone-50/80 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-[#181915] dark:text-stone-100 dark:hover:bg-[#1E1F1A]"
      >
        <span className="truncate">{selectedOption?.label ?? 'Select quality…'}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 dark:text-stone-500 ${
            open ? 'rotate-180 text-amber-500 dark:text-amber-400' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          className="animate-pop-in absolute z-30 mt-2 max-h-64 w-full origin-top overflow-y-auto rounded-xl border border-black/[0.08] bg-white/98 p-1.5 shadow-floating backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#181915]/98 dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isHighlighted = index === highlightedIndex

            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full min-h-[40px] items-center justify-between rounded-lg px-3.5 py-2 text-left text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-amber-500 text-white font-bold shadow-xs dark:bg-amber-400 dark:text-stone-950'
                      : isHighlighted
                        ? 'bg-stone-100 text-stone-900 dark:bg-white/10 dark:text-white'
                        : 'text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-white/5'
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
