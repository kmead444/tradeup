/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/**/*.html",
    "./frontend/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#7d1e3f',     // soft maroon
        highlight: '#d4af37',   // gold
        dark: '#111827'         // dark grey
      }
    },
  },
  plugins: [],
}
