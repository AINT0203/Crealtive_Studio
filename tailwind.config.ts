import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: 'var(--studio-bg)',
          surface: 'var(--studio-surface)',
          border: 'var(--studio-border)',
          text: 'var(--studio-text)',
          muted: 'var(--studio-muted)',
          inset: 'var(--studio-inset)',
          primary: '#1B5E8C',
          secondary: '#2E86C1',
          accent: '#F39C12',
          success: '#27AE60',
          danger: '#E74C3C',
          /** Login / light panels — same hue family as primary, cool neutrals */
          canvas: '#f1f4f9',
          canvasElevated: '#ffffff',
          canvasBorder: '#d3dce8',
          canvasBorderStrong: '#b8c5d6',
          ink: '#0c121c',
          inkMuted: '#5c677a',
          heroFrom: '#060b12',
          heroVia: '#0f2844',
          heroTo: '#17456e',
        },
      },
      borderRadius: {
        studio: '14px',
      },
      boxShadow: {
        lift: '0 10px 30px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px rgba(46,134,193,0.35), 0 0 24px rgba(46,134,193,0.22)',
        glowAccent: '0 0 0 1px rgba(243,156,18,0.45), 0 0 26px rgba(243,156,18,0.18)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        spinSlow: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 150ms ease-out both',
        pulseSoft: 'pulseSoft 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.15s linear infinite',
        spinSlow: 'spinSlow 1s linear infinite',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular'],
      },
    },
  },
  plugins: [],
} satisfies Config

