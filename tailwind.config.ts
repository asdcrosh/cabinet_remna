import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf0ff',
          100: '#f5ddff',
          200: '#ebbbff',
          300: '#df8cff',
          400: '#d15cff',
          500: '#bc35ee',
          600: '#9f20cf',
          700: '#7f1baa',
          800: '#651889',
          900: '#4f176c',
        },
        surface: {
          50: '#f8f6ff',
          100: '#eeeafa',
          800: '#21183c',
          900: '#15102b',
          950: '#090718',
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
