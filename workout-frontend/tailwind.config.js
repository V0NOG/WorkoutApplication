/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(217.2 32.6% 17.5%)",
        background: "#0b1220",
        foreground: "#e8eef9",
        primary: { DEFAULT: "#3b82f6", foreground: "#0b1220" },
        muted: { DEFAULT: "hsl(215 16% 35%)", foreground: "hsl(215 20% 85%)" },
      },
      borderRadius: { xl: "1rem", "2xl": "1.25rem" },
    },
  },
  plugins: [],
}