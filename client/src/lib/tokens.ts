/**
 * Banana Design System Tokens
 * Authoritative tokens derived from DESIGN.md Section 3 (Accent Derivation)
 * and Section 1 Anti-Bloat Caps.
 *
 * App Icon: banana-icon.svg
 * Measured Seeds:
 * - Primary Flesh / Peel: #F9B04A (OKLCH: L=0.8090, C=0.1431, h=72.03 deg)
 * - Luminous Peel Highlight: #FCDD82 (OKLCH: L=0.9044, C=0.1159, h=91.16 deg)
 * - Highlight Core: #FFF8D1 (OKLCH: L=0.9747, C=0.0510, h=98.84 deg)
 *
 * Derivation Branch: Branch C (High-Lightness Yellow Hues L > 0.75, 70-100 deg)
 * - accent_dark: #FCDD82 (Luminous on obsidian #121310, contrast 14.03:1)
 * - accent_light: #F9B04A (Warm saturated brand amber)
 * - accent_strong_light: #9A5D00 (Branch C formula L - 0.374; White on #9A5D00 contrast 5.33:1, passes WCAG AA >= 4.5:1)
 * - pressed_light: #D97706
 * - pressed_dark: #FBBF24
 * - on_accent_light: #FFFFFF (on accent_strong_light)
 * - on_accent_dark: #121310 (on accent_dark)
 */

export const BANANA_TOKENS = {
  name: 'Banana',
  version: '1.2.0',
  seeds: {
    primary: '#F9B04A',
    luminous: '#FCDD82',
    core: '#FFF8D1',
  },
  accent: {
    light: '#F9B04A',
    dark: '#FCDD82',
    strong_light: '#9A5D00',
    pressed_light: '#D97706',
    pressed_dark: '#FBBF24',
    subtle_light: 'rgba(249, 176, 74, 0.10)',
    subtle_dark: 'rgba(252, 221, 130, 0.10)',
    on_accent_light: '#FFFFFF',
    on_accent_dark: '#121310',
    focus_ring_light: '#F9B04A',
    focus_ring_dark: '#FCDD82',
    glow_light: '0 0 24px -4px rgba(249, 176, 74, 0.25)',
    glow_dark: '0 0 24px -4px rgba(252, 221, 130, 0.35)',
  },
  base: {
    canvas_light: '#F8F9F5',
    canvas_dark: '#121310',
    surface_light: '#FFFFFF',
    surface_dark: '#181915',
    surface_elevated_dark: '#1C1D18',
    surface_well_dark: '#141512',
    surface_well_light: '#FAFAF9',
    ink_primary_light: '#1C1917',
    ink_primary_dark: '#F3F4F1',
    ink_secondary_light: '#57534E',
    ink_secondary_dark: '#A8A29E',
    ink_muted_light: '#78716C',
    ink_muted_dark: '#78716C',
    text_placeholder_light: '#A8A29E',
    text_placeholder_dark: '#78716C',
    separator_light: 'rgba(0, 0, 0, 0.06)',
    separator_dark: 'rgba(255, 255, 255, 0.08)',
  },
  // Anti-bloat hard caps: strictly 7 functional type sizes
  typography: {
    font_sans: 'Host Grotesk',
    font_display: 'Unbounded',
    scales: {
      micro: '10px',      // 0.625rem / 10px / 11sp (line-height 1.2, tracking +0.05em)
      caption: '12px',    // 0.75rem / 12px / 13sp (line-height 1.4, tracking 0.0em)
      body: '14px',       // 0.875rem / 14px / 14sp (line-height 1.5, tracking -0.011em)
      subtitle: '16px',   // 1.0rem / 16px / 16sp (line-height 1.4, tracking -0.015em)
      title: '20px',      // 1.25rem / 20px / 18sp (line-height 1.3, tracking -0.02em)
      page_title: '24px', // 1.5rem / 24px / 26sp (line-height 1.2, tracking -0.025em)
      hero: '36px',       // 2.25rem / 36px / 32sp (line-height 1.1, tracking -0.03em)
    },
  },
  // Anti-bloat hard caps: strictly 6 radii steps
  radii: {
    lg: '8px',       // 0.5rem - tooltips, badges
    xl: '12px',      // 0.75rem - text fields, inputs, tiles
    '2xl': '16px',   // 1.0rem - standard cards, rows, toasts
    '3xl': '24px',   // 1.5rem - large containers, sheets
    modal: '32px',   // 2.0rem - modal popup dialogs
    capsule: '9999px',// full pill - buttons, switches, bottom dock
  },
  // Anti-bloat hard caps: strictly 4 shadow levels (+ flat)
  shadows: {
    none: 'none',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
    floating: '0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)',
    lift: '0 12px 32px -4px rgba(0, 0, 0, 0.09)',
  },
  // Anti-bloat hard caps: strictly 3 optical glass tiers
  glass: {
    card: {
      blur_px: 10,
      saturate_pct: 150,
      fill_light: 'rgba(255, 255, 255, 0.28)',
      fill_dark: 'rgba(22, 23, 19, 0.34)',
      border_light: 'rgba(255, 255, 255, 0.50)',
      border_dark: 'rgba(255, 255, 255, 0.08)',
      inset_light: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.50)',
      inset_dark: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
    },
    panel: {
      blur_px: 12,
      saturate_pct: 160,
      fill_light: 'rgba(255, 255, 255, 0.38)',
      fill_dark: 'rgba(22, 23, 19, 0.40)',
      border_light: 'rgba(255, 255, 255, 0.55)',
      border_dark: 'rgba(255, 255, 255, 0.10)',
      inset_light: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.70)',
      inset_dark: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)',
    },
    capsule: {
      blur_px: 15,
      saturate_pct: 100,
      fill_light: 'rgba(255, 255, 255, 0.20)',
      fill_dark: 'rgba(24, 25, 21, 0.20)',
      border_light: 'rgba(0, 0, 0, 0.07)',
      border_dark: 'rgba(255, 255, 255, 0.09)',
    },
  },
  // Anti-bloat hard caps: strictly 11 spacing grid steps
  spacing: [
    '4px', '6px', '8px', '12px', '16px', '20px', '24px', '28px', '32px', '48px', '64px'
  ],
} as const
