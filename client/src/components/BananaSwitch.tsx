import React from 'react'
import { playBack, playEnter } from '../lib/sound'

interface BananaSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
  'aria-label'?: string
}

/**
 * BananaSwitch: Fruit Family Standard Toggle Switch
 * Follows DESIGN.md Section 5.2
 *
 * Dimensions:
 * - Track: 50px width x 30px height, rounded-full
 * - Thumb: 26px diameter, 2px inset
 * - Travel: 20px (2px -> 22px)
 * - Touch bounding box: 48px x 48px minimum touch target
 * - Haptics / Audio: Crisp affirmative click on ON, soft descending tone on OFF
 */
export function BananaSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  'aria-label': ariaLabel,
}: BananaSwitchProps) {
  const switchId = id || (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  const handleToggle = () => {
    if (disabled) return
    const next = !checked
    onChange(next)
    if (next) {
      playEnter()
    } else {
      playBack()
    }
  }

  return (
    <div className="inline-flex items-center gap-3">
      {/* 48px x 48px accessible touch target bounding container with tactile spring physics */}
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={handleToggle}
        className={`focus-ring relative inline-flex h-12 w-14 min-h-[48px] min-w-[48px] items-center justify-center rounded-full transition-transform active:scale-[0.96] duration-140 ${
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
        }`}
      >
        {/* Visual Track: 50px x 30px */}
        <span
          className={`relative inline-block h-[30px] w-[50px] rounded-full transition-colors duration-200 shadow-2xs ${
            checked
              ? 'bg-[#F9B04A] dark:bg-[#FCDD82]'
              : 'bg-[#E7E5E4] dark:bg-[#292524]'
          }`}
        >
          {/* Visual Thumb: 26px diameter with 2px offset to 20px travel with spring physics */}
          <span
            className={`absolute top-[2px] left-[2px] inline-block h-[26px] w-[26px] rounded-full bg-white shadow-soft transition-transform duration-240 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${
              checked ? 'translate-x-[20px]' : 'translate-x-0'
            }`}
          />
        </span>
      </button>

      {label && (
        <label
          htmlFor={switchId}
          onClick={handleToggle}
          className={`select-none text-sm font-semibold cursor-pointer ${
            disabled ? 'text-stone-400 dark:text-stone-600' : 'text-stone-700 dark:text-stone-300'
          }`}
        >
          {label}
        </label>
      )}
    </div>
  )
}
