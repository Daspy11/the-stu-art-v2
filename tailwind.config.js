/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./quartz/**/*.{ts,tsx,js,jsx}",
    "./content/**/*.{md,mdx}",
  ],
  darkMode: ['class', '[saved-theme="dark"]'],
  theme: {
    extend: {},
  },
  plugins: [],
}