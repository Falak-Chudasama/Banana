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
      colors: {
        banana: {
          peel: '#FCDD82',
          amber: '#F9B04A',
          cream: '#FFF8D1',
          'cream-light': '#FFFAEC',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCDD82',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
          950: '#451A03',
        },
        canvas: {
          light: '#F8F9F5',
          dark: '#121310',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#181915',
          elevated: '#1C1D18',
          well: '#20211C',
        },
      },
      borderRadius: {
        card: '1.25rem',
        'card-lg': '1.5rem',
        capsule: '9999px',
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        lift: '0 12px 32px -4px rgba(0, 0, 0, 0.09)',
        floating: '0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)',
        'banana-glow': '0 0 24px -4px rgba(245, 158, 11, 0.35)',
        'banana-glow-sm': '0 0 16px -2px rgba(249, 176, 74, 0.25)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.18s ease-out',
        'pop-in': 'pop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
