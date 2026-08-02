import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f2ff',
          100: '#e4e5ff',
          200: '#cdd0ff',
          300: '#a9adff',
          400: '#8184ff',
          500: '#6262f4',
          600: '#5250df',
          700: '#4542b9',
          800: '#393793',
          900: '#313174',
        },
        surface: {
          50: '#f6f7fa',
          100: '#eef0f5',
          800: '#20232b',
          900: '#16181f',
          950: '#0d0f14',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
