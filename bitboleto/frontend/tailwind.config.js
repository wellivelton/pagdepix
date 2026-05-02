/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bitcoin: '#F7931A',
        app: {
          bg:           'var(--app-bg)',
          surface:      'var(--app-surface)',
          elevated:     'var(--app-elevated)',
          stroke:       'var(--app-stroke)',
          text:         'var(--app-text)',
          muted:        'var(--app-text-muted)',
          subtle:       'var(--app-text-subtle)',
        },
      },
      minHeight: {
        'dvh': '100dvh',
        'svh': '100svh',
      },
      padding: {
        'safe-t': 'max(1rem, env(safe-area-inset-top))',
        'safe-b': 'max(1.5rem, env(safe-area-inset-bottom))',
        'safe-l': 'max(1rem, env(safe-area-inset-left))',
        'safe-r': 'max(1rem, env(safe-area-inset-right))',
      },
      boxShadow: {
        'card':         '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-md':      '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
        'card-lg':      '0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.05)',
        'card-premium': 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 3px rgba(0,0,0,0.18)',
        'card-inset':   'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}
