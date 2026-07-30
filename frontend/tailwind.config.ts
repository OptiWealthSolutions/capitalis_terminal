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
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Manrope", "DM Sans", "system-ui", "sans-serif"],
        mono: ["DM Sans", "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          base:    "#F9F9FF",
          surface: "#F0F3FF",
          card:    "#FFFFFF",
          inner:   "#F7F8FA",
          hover:   "#E7EEFF",
          pop:     "#DEE8FF",
          border:  "rgba(15,23,42,0.08)",
        },
        t: {
          "1": "#0B1C33",
          "2": "rgba(11,28,51,0.74)",
          "3": "rgba(11,28,51,0.50)",
        },
        cobalt:  { DEFAULT: "#004AC6", deep: "#003594", hover: "#003EA8", light: "#1B55D0", soft: "rgba(0,74,198,0.10)", border: "rgba(0,74,198,0.28)" },
        slate:   { DEFAULT: "#0F172A", light: "#1E293B", border: "#1E2D45" },
        positive:"#16A34A",
        negative:"#BA1A1A",
        warning: "#D97706",

        /* legacy aliases — keeps all existing page Tailwind classes working */
        "bg-primary":    "#F9F9FF",
        "bg-secondary":  "#FFFFFF",
        "bg-tertiary":   "#FFFFFF",
        "bg-border":     "rgba(15,23,42,0.08)",
        "bg-hover":      "#E7EEFF",
        "text-primary":  "#0B1C33",
        "text-secondary":"rgba(11,28,51,0.74)",
        "text-muted":    "rgba(11,28,51,0.50)",
        "accent-blue":   "#004AC6",
        "accent-orange": "#D97706",
        "accent-green":  "#16A34A",
        "accent-red":    "#BA1A1A",
        "accent-yellow": "#D97706",
      },
      fontSize: {
        xxs: ["0.625rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        /* DESIGN.md scale */
        none:    "0px",
        xs:      "2px",
        sm:      "4px",
        DEFAULT: "4px",
        md:      "6px",
        lg:      "8px",
        xl:      "12px",
        "2xl":   "16px",
        full:    "9999px",
      },
      boxShadow: {
        /* tonal layering = thin border; shadow only for hover/lift */
        card:  "0 0 0 1px rgba(15,23,42,0.06)",
        hover: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.08)",
        glow:  "0 0 0 4px rgba(0,74,198,0.16)",
        panel: "0 0 0 1px rgba(15,23,42,0.06)",
        "glow-sm": "0 0 0 2px rgba(0,74,198,0.22)",
      },
      maxWidth: {
        "content": "1280px",
      },
      spacing: {
        "gutter": "1.5rem",
        "page":   "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
