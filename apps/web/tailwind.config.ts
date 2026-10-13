import type { Config } from "tailwindcss";

// Blue-slate surfaces, bright sky blues, and vivid orange inspired by the supplied reference.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#061321", 900: "#0b1d2e", 800: "#102d43", 700: "#163d59", 600: "#255778", 500: "#3d7395" },
        sky: { DEFAULT: "#55b9ed", light: "#9bdcff", deep: "#177bb6" },
        ember: { DEFAULT: "#ff6a00", 300: "#ffb067", 400: "#ff811c", 600: "#e05200" },
        mist: { DEFAULT: "#a9bed0", strong: "#d8e6f0" },
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
