import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf3ee',
          100: '#dce8df',
          200: '#bdd3c4',
          300: '#8bb69d',
          400: '#5f9277',
          500: '#3d765b',
          600: '#295f47',
          700: '#204b39',
          800: '#193b2d',
          900: '#112b21',
        },
        surface: {
          50: '#f1f0e9',
          100: '#e8e8df',
          800: '#1d2822',
          900: '#151d19',
          950: '#0e1411',
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
