import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf5',
          100: '#d8f5e7',
          200: '#b4ead2',
          300: '#7ee2b8',
          400: '#47cea0',
          500: '#23ae86',
          600: '#168b6d',
          700: '#14705a',
          800: '#145948',
          900: '#12493c',
        },
        surface: {
          50: '#faf9f5',
          100: '#f1f0eb',
          800: '#1d2420',
          900: '#121714',
          950: '#0b0f0d',
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
