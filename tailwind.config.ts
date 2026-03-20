import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'navy': {
          50: '#e8edf4',
          100: '#c5d2e4',
          200: '#9fb4d2',
          300: '#7895bf',
          400: '#5a7eb2',
          500: '#3d67a5',
          600: '#355f9d',
          700: '#2b5493',
          800: '#224889',
          900: '#1B365D',
        },
        'accent': '#2E75B6',
        'warning': '#D4760A',
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
