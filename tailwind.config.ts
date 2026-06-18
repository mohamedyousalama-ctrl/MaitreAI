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
      },
      colors: {
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
        // Wesaya storefront brand (public /order/[slug])
        "wesaya-red": "#D81E1E",
        "wesaya-red-dark": "#B81818",
        "wesaya-yellow": "#FFD400",
        "wesaya-yellow-soft": "#FFF3C4",
        "wesaya-cream": "#FBF7EF",
        "wesaya-ink": "#2C2C2A",
        "wesaya-brand-ink": "#5A1010",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 24px -6px rgba(15, 23, 42, 0.10), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
        // Warm, layered "glass" elevation for the conversations workspace.
        glass: "0 1px 2px rgba(70, 42, 24, 0.04), 0 6px 20px -8px rgba(70, 42, 24, 0.10)",
        float: "0 2px 6px rgba(70, 42, 24, 0.05), 0 18px 40px -16px rgba(70, 42, 24, 0.18)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
};

export default config;
