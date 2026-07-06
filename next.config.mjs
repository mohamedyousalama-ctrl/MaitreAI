/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // console_v2 PR 1 adds an .eslintrc.json (to activate the local Arabic-bidi
  // rule) where before there was none. `next build` auto-lints when a config is
  // present, so keep the build's lint behavior EXACTLY as it was — off — rather
  // than newly gating CI on next/core-web-vitals across the whole mature tree.
  // Lint is run on demand via `npm run lint`; the local rule ships as "warn".
  eslint: { ignoreDuringBuilds: true },
  // react-leaflet + @react-leaflet/core are ESM-only; transpile them so the
  // storefront map (client-only, dynamically imported) bundles cleanly.
  transpilePackages: ["react-leaflet", "@react-leaflet/core"],
  // Kivo migration: the leftover (main) terracotta pages must never be reached by
  // CUTOVER-2: the legacy (console) group is deleted; /c is the one console. These
  // static, unconditional redirects catch every old console URL (bookmarks, other
  // groups' links, external links) and send it to its /c equivalent — leaf names
  // line up; /dashboard + /orders fold to Live Shift; /menu → Knowledge; the
  // kitchen ticket keeps its id. `permanent:false` (307) during cutover so a
  // rollback isn't cached by browsers. The remaining (main) terracotta pages
  // (/maitre, /promotions, /branches) fold to the console home too.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/c/shift", permanent: false },
      { source: "/orders", destination: "/c/shift", permanent: false },
      { source: "/orders/:id/ticket", destination: "/c/orders/:id/ticket", permanent: false },
      { source: "/conversations", destination: "/c/conversations", permanent: false },
      { source: "/customers", destination: "/c/customers", permanent: false },
      { source: "/settings", destination: "/c/settings", permanent: false },
      { source: "/menu", destination: "/c/knowledge", permanent: false },
      { source: "/team", destination: "/c/team", permanent: false },
      { source: "/insights", destination: "/c/insights", permanent: false },
      { source: "/cod", destination: "/c/shift", permanent: false },
      { source: "/cod/close", destination: "/c/shift", permanent: false },
      { source: "/deliveries", destination: "/c/shift", permanent: false },
      { source: "/maitre", destination: "/c/shift", permanent: false },
      { source: "/promotions", destination: "/c/shift", permanent: false },
      { source: "/branches", destination: "/c/shift", permanent: false },
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
