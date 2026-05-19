import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brass: {
          50: "#fdf8ec",
          100: "#faf0d0",
          200: "#f5dfa0",
          300: "#eec966",
          400: "#e3aa33",
          500: "#c9a84c",
          600: "#a88a3a",
          700: "#7a5f30",
          800: "#5a4428",
          900: "#3d2f1e",
        },
        teal: {
          50: "#e8f4f4",
          100: "#c5e4e3",
          200: "#9acfcb",
          300: "#6ab5b1",
          400: "#3d9490",
          500: "#1a4a4a",
          600: "#153c3c",
          700: "#112f2f",
          800: "#0c2121",
          900: "#081515",
        },
      },
      fontFamily: {
        display: ["Playfair Display", "Georgia", "serif"],
        body: ["Plus Jakarta Sans", "DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "waveform": "waveform 1.2s ease-in-out infinite",
        "vu-swing": "vu-swing 2s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out forwards",
        "deco-reveal": "deco-reveal 0.7s ease-out forwards",
        "brass-shimmer": "brass-shimmer 3s ease-in-out infinite",
      },
      keyframes: {
        waveform: {
          "0%, 100%": { height: "4px" },
          "50%": { height: "24px" },
        },
        "vu-swing": {
          "0%, 100%": { transform: "rotate(-8deg)" },
          "50%": { transform: "rotate(8deg)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "deco-reveal": {
          from: { opacity: "0", transform: "scaleX(0)" },
          to: { opacity: "1", transform: "scaleX(1)" },
        },
        "brass-shimmer": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
