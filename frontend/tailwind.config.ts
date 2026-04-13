import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      colors: {
        // Terminal palette
        bg: {
          primary: "#0D1117",
          secondary: "#151A22",
          tertiary: "#1E232F",
          border: "#2D3347",
        },
        text: {
          primary: "#E6EDF3",
          secondary: "#8B949E",
          muted: "#484F58",
        },
        accent: {
          blue: "#3B82F6",
          orange: "#F5A623",
          green: "#2ECC40",
          red: "#FF4136",
          yellow: "#FFD700",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
