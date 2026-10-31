import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        ink: {
          900: 'var(--ink-900)',
          600: 'var(--ink-600)',
          400: 'var(--ink-400)',
          200: 'var(--ink-200)',
        },
        surface: 'var(--color-surface)',
        bg: 'var(--color-bg)',
      },
      borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      fontFamily: { sans: 'var(--font-sans)', code: 'var(--font-code)' },
    },
  },
  plugins: [],
} satisfies Config
