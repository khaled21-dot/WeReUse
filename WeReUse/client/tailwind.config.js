/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand colours are sampled from the WeReUse logo (blue #0880CD, green #4FB955)
        ink: { DEFAULT: '#10283A', soft: '#41596B', faint: '#5B6E7B' },
        paper: '#F3F8F5',
        line: '#D8E4DE',
        blue: {
          50: '#EAF5FC', 100: '#D3EAF9', 200: '#A8D4F2', 300: '#6DB8E8', 400: '#2F99DB',
          500: '#0880CD', 600: '#0668A8', 700: '#07528A', 800: '#0B3F6B', 900: '#0A2C4B',
        },
        green: {
          50: '#EDF8EE', 100: '#D6F0D9', 200: '#ADE0B3', 300: '#7ACC85', 400: '#4FB955',
          500: '#3A9E41', 600: '#2D8035', 700: '#26662C', 800: '#1F5026',
        },
        gold: {
          50: '#FFFAE6', 100: '#FFF1B8', 200: '#FFE680', 300: '#FFDC4D', 400: '#FFD700',
          500: '#E6BC00', 600: '#B8860B', 700: '#8A6508', 900: '#4A3600',
        },
        amber: { 50: '#FFF8E4', 100: '#FFEFC2', 600: '#B7791F', 800: '#7A4B00' },
        coral: { 50: '#FDF0ED', 100: '#FBDDD7', 600: '#C0392B', 800: '#8F2418' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: { pass: '28px' },
    },
  },
  plugins: [],
};
