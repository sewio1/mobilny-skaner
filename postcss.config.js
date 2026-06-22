/**
 * PostCSS Pipeline dla Mobilnego Skanera Inwentaryzacyjnego.
 *
 * KOLEJNOŚĆ PLUGINÓW MA ZNACZENIE:
 * 1. @tailwindcss/postcss  – generuje CSS z klas Tailwind (zastępuje plugin Vite)
 * 2. postcss-preset-env    – konwertuje nowoczesne funkcje CSS na starsze odpowiedniki:
 *                            oklch() → rgb(), color-mix() → fallback, @layer → inline
 * 3. autoprefixer          – dodaje vendor prefiksy (-webkit-, -moz- itp.)
 *
 * Zakres kompatybilności sterowany przez .browserslistrc (Chrome >= 80).
 */
export default {
  plugins: {
    // Plugin Tailwind v4 dla PostCSS (zamiast @tailwindcss/vite)
    '@tailwindcss/postcss': {},

    // Konwersja nowoczesnych funkcji CSS na starsze odpowiedniki
    'postcss-preset-env': {
      // stage: 2 = stabilne propozycje, dobrze przetestowane przez przeglądarki
      stage: 2,
      features: {
        // Konwertuj oklch()/oklab() na rgb() dla Chrome < 111
        'oklab-function': { preserve: true },
        // Konwertuj color-mix() na wartości statyczne
        'color-mix': { preserve: true },
        // Zachowaj CSS custom properties (Tailwind ich potrzebuje)
        'custom-properties': false,
        // Nie przepisuj @layer - Tailwind sam to obsługuje
        'cascade-layers': false,
      },
    },

    // Dodaj vendor prefiksy dla Flexbox, Grid, transform, itp.
    'autoprefixer': {},
  },
};
