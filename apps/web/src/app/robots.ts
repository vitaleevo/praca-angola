import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.VERCEL
    ? "https://puvo.vitaleevo.ao"
    : process.env.PUBLIC_SITE_URL?.trim() || "http://localhost:3100";
  return { rules: { userAgent: "*", allow: ["/", "/produtos", "/lojas", "/categorias/", "/marketplaces"], disallow: ["/conta/", "/vendedor/", "/admin/", "/api/"] }, sitemap: `${origin}/sitemap.xml` };
}
