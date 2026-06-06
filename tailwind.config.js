/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Dark shades (kept for backward compat)
        dark: {
          900: "#0a0a0a",
          800: "#0f0f0f",
          700: "#1a1a1a",
          600: "#252525",
          500: "#333333",
          400: "#555555",
          300: "#888888",
          200: "#aaaaaa",
          100: "#e0e0e0",
          50:  "#f0f0f0",
        },
        // Light theme tokens
        lt: {
          bg:      "#f5f5f5",
          sidebar: "#ffffff",
          card:    "#f9f9f9",
          border:  "#e5e5e5",
          input:   "#ffffff",
          hover:   "#f0f0f0",
          text:    "#1a1a1a",
          sub:     "#555555",
          muted:   "#999999",
          dim:     "#bbbbbb",
        },
        accent: {
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
