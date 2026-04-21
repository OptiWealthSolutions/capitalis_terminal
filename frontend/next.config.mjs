/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Static export for Cloudflare Pages hosting
  // All 17 routes are already prerendered static (○)
  ...(isProd ? { output: "export" } : {}),

  // Rewrites only in dev — proxy /api/* to local backend
  // In prod: NEXT_PUBLIC_API_URL points directly to Railway (no proxy needed)
  ...(!isProd ? {
    async rewrites() {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
    },
  } : {}),
};

export default nextConfig;
