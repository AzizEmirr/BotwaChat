import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        catwa: {
          bg: {
            0: "var(--catwa-bg-0)",
            1: "var(--catwa-bg-1)",
            2: "var(--catwa-bg-2)",
            3: "var(--catwa-bg-3)"
          },
          panel: "var(--catwa-panel)",
          panelAlt: "var(--catwa-panel-alt)",
          border: "var(--catwa-border)",
          text: {
            main: "var(--catwa-text-main)",
            muted: "var(--catwa-text-muted)",
            soft: "var(--catwa-text-soft)"
          },
          accent: {
            DEFAULT: "var(--catwa-accent)",
            soft: "var(--catwa-accent-soft)",
            softest: "var(--catwa-accent-softest)",
            strong: "var(--catwa-accent-strong)",
            ring: "var(--catwa-accent-ring)"
          },
          success: "var(--catwa-success)",
          danger: "var(--catwa-danger)"
        }
      },
      spacing: {
        1.5: "0.375rem",
        2.5: "0.625rem",
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem"
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "30px"
      },
      boxShadow: {
        "catwa-soft": "0 12px 35px -22px rgba(5, 8, 16, 0.7)",
        "catwa-layer": "0 20px 70px -32px rgba(2, 6, 23, 0.85)",
        "catwa-glow": "0 0 0 1px rgba(var(--catwa-accent-rgb), 0.2), 0 0 24px rgba(var(--catwa-accent-rgb), 0.25)"
      },
      fontFamily: {
        sans: ["Sora", "Manrope", "IBM Plex Sans", "Noto Sans", "Segoe UI", "sans-serif"]
      },
      transitionTimingFunction: {
        catwa: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      transitionDuration: {
        180: "180ms",
        220: "220ms"
      }
    }
  },
  plugins: []
} satisfies Config;
