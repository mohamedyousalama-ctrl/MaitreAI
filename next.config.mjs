/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-leaflet + @react-leaflet/core are ESM-only; transpile them so the
  // storefront map (client-only, dynamically imported) bundles cleanly.
  transpilePackages: ["react-leaflet", "@react-leaflet/core"],
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
