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
      <label htmlFor={triggerId} className="block text-xs font-semibold uppercase tracking-wider text-lychee-ink/70 dark:text-white/70">
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
        className="focus-ring mt-2 flex h-14 sm:h-16 w-full items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-5 text-left text-base font-semibold text-lychee-ink shadow-sm transition hover:bg-white/95 focus:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-black/40 dark:text-white dark:hover:bg-black/55 dark:focus:bg-black/60"
      >
        <span className="truncate">{selectedOption?.label ?? 'Select quality…'}</span>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-lychee-seed-500 transition-transform duration-200 dark:text-lychee-seed-300 ${
            open ? 'rotate-180 text-lychee-shell dark:text-lychee-shell-400' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          className="animate-pop-in absolute z-30 mt-2 max-h-64 w-full origin-top overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-2 shadow-pop backdrop-blur-xl dark:border-white/10 dark:bg-[#180c12]/95 dark:shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
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
                  className={`flex w-full min-h-[44px] items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm sm:text-base font-semibold transition ${
                    isSelected
                      ? 'bg-lychee-shell text-white font-bold shadow-sm'
                      : isHighlighted
                        ? 'bg-lychee-membrane-100 text-lychee-ink dark:bg-white/15 dark:text-white'
                        : 'text-lychee-ink hover:bg-lychee-membrane-50 dark:text-white/80 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-white" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
