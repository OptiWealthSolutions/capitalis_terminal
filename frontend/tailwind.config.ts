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
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        bg: {
          base:    "#060608",
          surface: "#0C0C0E",
          card:    "#101013",
          hover:   "#151518",
          pop:     "#1A1A1E",
          border:  "rgba(255,255,255,0.05)",
        },
        t: {
          "1": "#FFFFFF",
          "2": "rgba(255,255,255,0.55)",
          "3": "rgba(255,255,255,0.28)",
        },
        orange:  { DEFAULT: "#F97316", hover: "#FB923C", dim: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.22)" },
        positive: "#22C55E",
        negative: "#EF4444",
        warning:  "#EAB308",

        /* legacy aliases — keeps all existing page Tailwind classes working */
        "bg-primary":    "#060608",
        "bg-secondary":  "#101013",
        "bg-tertiary":   "#101013",
        "bg-border":     "rgba(255,255,255,0.05)",
        "bg-hover":      "#151518",
        "text-primary":  "#FFFFFF",
        "text-secondary":"rgba(255,255,255,0.55)",
        "text-muted":    "rgba(255,255,255,0.28)",
        "accent-blue":   "#7AA7E8",
        "accent-orange": "#C9B178",
        "accent-green":  "#22C55E",
        "accent-red":    "#EF4444",
        "accent-yellow": "#EAB308",
      },
      fontSize: {
        xxs: ["0.625rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        /* redesign.md exact system */
        "2xl": "24px",
        xl:    "20px",
        lg:    "16px",   /* data cards */
        DEFAULT: "16px",
        md:    "8px",
        sm:    "8px",    /* buttons, inputs */
        xs:    "4px",    /* badges */
      },
      boxShadow: {
        /* inner glow only — no drop shadows per spec */
        card:  "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(255,255,255,0.015)",
        hover: "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.025)",
        glow:  "0 0 12px rgba(122,167,232,0.18)",
        /* legacy */
        panel: "inset 0 1px 0 rgba(255,255,255,0.09)",
        "glow-sm": "0 0 0 2px rgba(122,167,232,0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
