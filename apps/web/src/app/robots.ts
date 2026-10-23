import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/", "/produtos", "/lojas", "/categorias/", "/marketplaces"], disallow: ["/conta/", "/vendedor/", "/admin/", "/api/"] }, sitemap: `${process.env.PUBLIC_SITE_URL ?? "http://localhost:3100"}/sitemap.xml` };
}
