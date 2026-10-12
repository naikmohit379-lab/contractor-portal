import type { Config } from "tailwindcss";

// Palette taken from the reference UI: deep blue-black surfaces, one burnt-orange accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#090d12", 900: "#0e131a", 800: "#141b24", 700: "#1c2531", 600: "#2a3543", 500: "#3a4757" },
        ember: { DEFAULT: "#e8701a", 300: "#f6a76a", 400: "#f08a3a", 600: "#c95d0f" },
        mist: { DEFAULT: "#a3adb9", strong: "#c8d0d9" },
        ok: "#4cc38a",
        warn: "#f2c14e",
        bad: "#ef6a5b",
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      keyframes: {
        draw: { from: { strokeDashoffset: "1" }, to: { strokeDashoffset: "0" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        draw: "draw 1.6s cubic-bezier(.6,0,.2,1) forwards",
        rise: "rise .6s ease-out .9s both",
      },
    },
  },
  plugins: [],
};
export default config;
