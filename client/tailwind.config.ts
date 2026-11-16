import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Host Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Unbounded"', 'sans-serif'],
      },
      // Hard Anti-Bloat Cap 1: Strictly 7 Functional Type Scales
      fontSize: {
        micro: ['10px', { lineHeight: '1.2', letterSpacing: '+0.05em' }],
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '0.0em' }],
        body: ['14px', { lineHeight: '1.5', letterSpacing: '-0.011em' }],
        subtitle: ['16px', { lineHeight: '1.4', letterSpacing: '-0.015em' }],
        title: ['20px', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'page-title': ['24px', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        hero: ['36px', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        // Standard tailwind mappings constrained to the literal 7-step scale
        xs: ['12px', { lineHeight: '1.4', letterSpacing: '0.0em' }],
        sm: ['14px', { lineHeight: '1.5', letterSpacing: '-0.011em' }],
        base: ['16px', { lineHeight: '1.4', letterSpacing: '-0.015em' }],
        lg: ['16px', { lineHeight: '1.4', letterSpacing: '-0.015em' }], // Subtitle step
        xl: ['20px', { lineHeight: '1.3', letterSpacing: '-0.02em' }], // Title step
        '2xl': ['24px', { lineHeight: '1.2', letterSpacing: '-0.025em' }], // PageTitle step
        '3xl': ['24px', { lineHeight: '1.2', letterSpacing: '-0.025em' }], // PageTitle step
        '4xl': ['36px', { lineHeight: '1.1', letterSpacing: '-0.03em' }], // Hero step
      },
      colors: {
        // Authoritative Banana Accent Tokens (DESIGN.md Section 3)
        banana: {
          peel: '#FCDD82',       // luminous dark accent (Seed_Dark)
          amber: '#F9B04A',      // light accent (Seed_Light)
          cream: '#FFF8D1',      // pastel highlight core
          strong: '#9A5D00',     // Branch C accessible dark button fill (5.33:1 contrast for white text)
          'cream-light': '#FFFAEC',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCDD82',
          400: '#FBBF24',
          500: '#F9B04A',
          600: '#D97706',
          700: '#9A5D00',
          800: '#78350F',
          900: '#451A03',
          950: '#2A0E02',
          subtle: 'rgba(249, 176, 74, 0.10)',
          'subtle-dark': 'rgba(252, 221, 130, 0.10)',
        },
        accent: {
          light: '#F9B04A',
          dark: '#FCDD82',
          strong: '#9A5D00',
          'pressed-light': '#D97706',
          'pressed-dark': '#FBBF24',
          'subtle-light': 'rgba(249, 176, 74, 0.10)',
          'subtle-dark': 'rgba(252, 221, 130, 0.10)',
          'on-light': '#FFFFFF',
          'on-dark': '#121310',
        },
        canvas: {
          light: '#F8F9F5',
          dark: '#121310',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#181915',
          elevated: '#1C1D18',
          well: '#141512',
          'well-light': '#FAFAF9',
        },
      },
      // Hard Anti-Bloat Cap 2: Strictly 6 Radii Steps
      borderRadius: {
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
        modal: '32px',
        capsule: '9999px',
        card: '16px',       // System standardized to 16px (2xl)
        'card-lg': '24px',  // System standardized to 24px (3xl)
        md: '8px',          // Mapped to 8px (lg)
      },
      // Hard Anti-Bloat Cap 3: Strictly 4 Elevation Levels (+ none)
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // Alias for xs
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        floating: '0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)',
        lift: '0 12px 32px -4px rgba(0, 0, 0, 0.09)',
        'banana-glow': '0 0 24px -4px rgba(252, 221, 130, 0.35)',
        'banana-glow-sm': '0 0 16px -2px rgba(249, 176, 74, 0.25)',
      },
      // Hard Anti-Bloat Cap 4: Strictly 3 Glass Blurs (10px card, 12px panel, 15px capsule)
      backdropBlur: {
        card: '10px',
        panel: '12px',
        capsule: '15px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'page-enter': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.996)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-out-to-left': {
          '0%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
          '100%': { opacity: '0', transform: 'translate3d(-60px, 0, 0)' },
        },
        'slide-in-from-right': {
          '0%': { opacity: '0', transform: 'translate3d(60px, 0, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'slide-out-to-right': {
          '0%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
          '100%': { opacity: '0', transform: 'translate3d(60px, 0, 0)' },
        },
        'slide-in-from-left': {
          '0%': { opacity: '0', transform: 'translate3d(-60px, 0, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'slide-from-right': {
          '0%': { opacity: '0', transform: 'translate3d(40px, 0, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'slide-from-left': {
          '0%': { opacity: '0', transform: 'translate3d(-40px, 0, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.18s ease-out',
        'page-enter': 'page-enter 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-out-to-left': 'slide-out-to-left 260ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-in-from-right': 'slide-in-from-right 260ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-out-to-right': 'slide-out-to-right 260ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-in-from-left': 'slide-in-from-left 260ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-from-right': 'slide-from-right 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-from-left': 'slide-from-left 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config