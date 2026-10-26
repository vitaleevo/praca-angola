import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@puvo/ui"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800,
  },
  async rewrites() {
    const api = process.env.VERCEL
      ? process.env.API_PUBLIC_URL ?? "https://pracaapi-production.up.railway.app/api/v1"
      : process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
    return [
      { source: "/api/crm/automations/:path*", destination: `${api}/crm/automations/:path*` },
      { source: "/api/v1/:path*", destination: `${api}/:path*` },
    ];
  },
  async headers() {
    const development = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}; connect-src 'self'${development ? " ws:" : ""}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
