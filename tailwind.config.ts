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
        sans: ["var(--font-arabic)", "Cairo", "Tajawal", "system-ui", "sans-serif"],
        // Wesaya storefront type (loaded via Google Fonts <link> on /order/[slug])
        cairo: ['"Cairo"', "var(--font-arabic)", "sans-serif"],
        baloo: ['"Baloo Bhaijaan 2"', '"Cairo"', "sans-serif"],
        // Kivo console (SPEC 00 §1): single family, IBM Plex Sans Arabic 400–800.
        kivo: ["var(--kv-font)"],
        "kivo-mono": ['ui-monospace', '"SF Mono"', "Menlo", "monospace"],
      },
      colors: {
        // ── Kivo design tokens (SPEC 00 §2) — emerald system, NO lime. ──
        // Names are normative: use `kv-*` everywhere on console pages.
        kv: {
          primary: "#0E9F6E",
          deep: "#0A8A5F",
          ink: "#0a3a2a",
          mint: "#34C79C",
          "primary-tint": "rgba(14,159,110,.12)",
          canvas: "#EEF4F1",
          "canvas-2": "#E3EDE8",
          card: "#FFFFFF",
          "card-soft": "#F6FAF8",
          text: "#0F2A20",
          muted: "#5B6B64",
          faint: "#8A988F",
          slate: "#64748B",
          border: "#E7EFEB",
          amber: "#D8972B",
          red: "#C0492F",
          delivery: "#7C5CD0",
          ready: "#2B8FB5",
        },
        // Module accent colors
        dashboard: "#2563eb", // blue
        conversations: "#25D366", // whatsapp green
        orders: "#1d4ed8", // royal blue
        kitchen: "#f97316", // orange
        menu: "#0d9488", // teal
        branches: "#4f46e5", // indigo
        promotions: "#9333ea", // purple
        brain: "#059669", // emerald
        customers: "#06b6d4", // cyan
        settings: "#475569", // slate
        // Wesaya storefront brand (public /order/[slug]) — Claude-Design mockup palette
        "wesaya-red": "#D62300",
        "wesaya-red-dark": "#9E1B0E",
        "wesaya-gold": "#F0A81E",
        "wesaya-cream": "#FBF3E7",
        "wesaya-tint": "#FFF2EC",
        "wesaya-line": "#ECE0CE",
        "wesaya-ink": "#26190F",
        "wesaya-green": "#1E8A52",
        "wesaya-muted": "#8C7B71",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 24px -6px rgba(15, 23, 42, 0.10), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
        // Warm, layered "glass" elevation for the conversations workspace.
        glass: "0 1px 2px rgba(70, 42, 24, 0.04), 0 6px 20px -8px rgba(70, 42, 24, 0.10)",
        float: "0 2px 6px rgba(70, 42, 24, 0.05), 0 18px 40px -16px rgba(70, 42, 24, 0.18)",
        // Kivo console shadows (SPEC 00 §5).
        "kv-card": "0 22px 50px -38px rgba(16,60,44,.36)",
        "kv-panel": "0 16px 40px -34px rgba(16,60,44,.34)",
        "kv-login": "0 60px 130px -50px rgba(13,52,38,.5), 0 10px 30px -18px rgba(13,52,38,.3)",
        "kv-btn": "0 18px 32px -16px rgba(14,159,110,.7)",
        "kv-btn-sm": "0 14px 26px -16px rgba(14,159,110,.7)",
        "kv-frame": "0 50px 120px -50px rgba(13,52,38,.55), 0 8px 24px -16px rgba(13,52,38,.3)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        // Kivo radius scale (SPEC 00 §4).
        "kv-lg": "20px",
        "kv-lg-xl": "24px",
        "kv-md": "14px",
        "kv-md-sm": "13px",
        "kv-md-lg": "16px",
        "kv-pill": "99px",
      },
      backgroundImage: {
        // Kivo gradients (SPEC 00 §3) — mirror of the CSS vars.
        "kv-grad-brand": "linear-gradient(150deg,#12b07a,#0a8a5f)",
        "kv-grad-brand-deep": "linear-gradient(155deg,#0c9468,#0a7a55 55%,#0a5f44)",
      },
    },
  },
  plugins: [],
};

export default config;
