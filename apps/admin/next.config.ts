import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@puvo/ui"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800,
    remotePatterns: [
      { protocol: "https", hostname: "puvo.vitaleevo.ao" },
      { protocol: "https", hostname: "pracaapi-production.up.railway.app" },
    ],
  },
  async rewrites() {
    const api = process.env.VERCEL
      ? process.env.API_PUBLIC_URL ?? "https://pracaapi-production.up.railway.app/api/v1"
      : process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
    return [{ source: "/api/v1/:path*", destination: `${api}/:path*` }];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; img-src 'self' data: blob: https://puvo.vitaleevo.ao https://pracaapi-production.up.railway.app; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report" },
      ],
    }];
  },
};

export default nextConfig;
