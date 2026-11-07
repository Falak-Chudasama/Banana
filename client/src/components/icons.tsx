import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.6 4.9a3.6 3.6 0 0 1 5.1 5.1L16 11.6" />
      <path d="M13 17.5 11.4 19.1a3.6 3.6 0 0 1-5.1-5.1L8 12.4" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="m5 13 4 4 10-10" />
    </svg>
  )
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </svg>
  )
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 16.5 4.5-4.5 3.5 3.5 3-3 4 4" />
    </svg>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" strokeWidth="2.5" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export function ShieldLockIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M12 2.5s7 2.5 7 8c0 5-4.5 9-7 11-2.5-2-7-6-7-11 0-5.5 7-8 7-8Z" />
      <path d="M9.5 12h5" />
      <path d="M12 9.5v5" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
    </svg>
  )
}

export function VolumeIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

export function VolumeMuteIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

export function ScissorsIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}

export function CollectionIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
    </svg>
  )
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="m12 3 1.91 5.82a2 2 0 0 0 1.27 1.27L21 12l-5.82 1.91a2 2 0 0 0-1.27 1.27L12 21l-1.91-5.82a2 2 0 0 0-1.27-1.27L3 12l5.82-1.91a2 2 0 0 0 1.27-1.27L12 3Z" />
    </svg>
  )
}

export function ThumbsUpIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

export function ThumbsDownIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

export function LycheeMark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <defs>
        <radialGradient id="lycheeGlow" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#E84A6A" />
          <stop offset="65%" stopColor="#C81D3A" />
          <stop offset="100%" stopColor="#841126" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="17.5" r="10.5" fill="url(#lycheeGlow)" />
      <path
        d="M15.4 7.3c-.5-1.8-.1-3.3 1.3-4.4"
        stroke="#8B5E3C"
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
      <g fill="#570B19" opacity="0.75">
        <circle cx="12" cy="12.6" r="0.85" />
        <circle cx="17" cy="10.8" r="0.85" />
        <circle cx="20.8" cy="13.6" r="0.85" />
        <circle cx="10.3" cy="17.4" r="0.85" />
        <circle cx="14.6" cy="16" r="0.85" />
        <circle cx="19.2" cy="17.1" r="0.85" />
        <circle cx="22.1" cy="18.7" r="0.85" />
        <circle cx="11.7" cy="21.8" r="0.85" />
        <circle cx="16.2" cy="21" r="0.85" />
        <circle cx="20.3" cy="22.1" r="0.85" />
      </g>
    </svg>
  )
}
