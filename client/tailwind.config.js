/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aqua: {
          25: '#f0fffe',
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2'
        },
        blush: {
          50: '#fff1f7',
          100: '#ffe4f0',
          200: '#ffc7df',
          400: '#fb7185'
        },
        slate: {
          25: '#fafbfc'
        }
      },
      boxShadow: {
        'soft': '0 8px 32px rgba(6, 182, 212, 0.08)',
        'soft-lg': '0 12px 48px rgba(6, 182, 212, 0.12)',
        'soft-xl': '0 20px 64px rgba(6, 182, 212, 0.15)',
        'glow': '0 0 20px rgba(6, 182, 212, 0.25)',
        'inner-soft': 'inset 0 1px 3px rgba(6, 182, 212, 0.08)'
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px'
      },
      animation: {
        pop: 'pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        floatIn: 'floatIn 320ms ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        slideIn: 'slideIn 300ms ease-out'
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        floatIn: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      }
    }
  },
  plugins: []
};
