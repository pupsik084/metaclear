import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f6f8',
          100: '#e6eaee',
          200: '#c5cfd8',
          300: '#9fadbc',
          400: '#71839a',
          500: '#506478',
          600: '#384a5e',
          700: '#243446',
          800: '#15212f',
          900: '#0b0f14',
          950: '#070a0f',
        },
        cyan: {
          DEFAULT: '#27e8c4',
          dark: '#1bb999',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Inter',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
