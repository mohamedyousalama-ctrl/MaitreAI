/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-leaflet + @react-leaflet/core are ESM-only; transpile them so the
  // storefront map (client-only, dynamically imported) bundles cleanly.
  transpilePackages: ["react-leaflet", "@react-leaflet/core"],
  // Kivo migration: the leftover (main) terracotta pages must never be reached by
  // normal navigation (they render the old shell with a sidebar that links into
  // the Kivo console). Redirect each to its Kivo equivalent, else to the Kivo
  // Home (/dashboard). /dashboard itself is now the Kivo Home in (console).
  // NOTE: /menu, /cod, /deliveries are intentionally NOT redirected — they are
  // linked from the live console (ConsoleSidebar) and must serve their real
  // (main) pages (menu+zones editor, COD ledger, deliveries). They render in the
  // old shell for now (reachability over skin); the rest stay redirected.
  async redirects() {
    return [
      { source: "/maitre", destination: "/dashboard", permanent: false },
      { source: "/promotions", destination: "/dashboard", permanent: false },
      { source: "/branches", destination: "/dashboard", permanent: false },
      { source: "/ai-review", destination: "/dashboard", permanent: false },
      { source: "/restaurant-brain", destination: "/dashboard", permanent: false },
    ];
  },
  experimental: {
    // @resvg/resvg-js ships a native .node addon webpack can't bundle — require
    // it at runtime instead (the receipt/kitchen-ticket PNG renderer).
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
    // The renderer reads the Arabic font files at runtime; make sure they're
    // traced into the serverless function bundle (Vercel does not bundle
    // public/ into lambdas by default).
    outputFileTracingIncludes: {
      "/api/orders/**": ["./public/fonts/**"],
      "/api/agent/promo": ["./public/fonts/**"],
    },
  },
};

export default nextConfig;
