import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Host Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Unbounded"', 'sans-serif'],
      },
      colors: {
        lychee: {
          // Primary: rich crimson shell
          shell: {
            DEFAULT: '#C81D3A',
            50: '#FCEEF1',
            100: '#FAD8DF',
            200: '#F6C0CB',
            300: '#E87D94',
            400: '#D74261',
            500: '#C81D3A',
            600: '#A81730',
            700: '#841126',
            800: '#630B1C',
            900: '#430612',
          },
          // Secondary: warm seed brown
          seed: {
            DEFAULT: '#8B5E3C',
            100: '#F4ECE6',
            300: '#C4A186',
            500: '#8B5E3C',
            700: '#543823',
            900: '#331F12',
          },
          // Base: delicate sweet membrane & tints
          membrane: {
            DEFAULT: '#FDEEF0',
            50: '#FFFBFC',
            100: '#FDEEF0',
            200: '#F8DEE3',
            300: '#F0C7D0',
          },
          border: 'rgba(241, 184, 196, 0.45)',
          ink: '#3D1522',
        },
      },
      boxShadow: {
        soft: '0 16px 40px -12px rgba(200, 29, 58, 0.14)',
        glass: '0 20px 48px -10px rgba(67, 24, 37, 0.08), 0 1px 2px 0 rgba(255, 255, 255, 0.8) inset',
        'glass-hover': '0 24px 54px -8px rgba(200, 29, 58, 0.16), 0 1px 2px 0 rgba(255, 255, 255, 0.9) inset',
        pop: '0 12px 28px rgba(67, 24, 37, 0.16)',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.97) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
