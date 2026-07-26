import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#12b8d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          800: '#202630',
          900: '#12171f',
          950: '#080b10',
        },
      },
      fontFamily: {
        sans: ['Onest', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
