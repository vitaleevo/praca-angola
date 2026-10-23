import type { MetadataRoute } from "next";
import { publicApi, Listing, Store } from "../lib/api";
import { ProfessionalDirectory } from '../lib/services';

const origin = process.env.VERCEL
  ? "https://puvo.vitaleevo.ao"
  : process.env.PUBLIC_SITE_URL?.trim() || "http://localhost:3100";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, stores, professionals] = await Promise.all([
    publicApi<{ items: Listing[] }>("/catalog/listings?limit=48", { items: [] }),
    publicApi<{ items: Store[] }>("/catalog/stores?limit=48", { items: [] }),
    publicApi<ProfessionalDirectory>('/services/professionals',{items:[],page:1,pages:0,total:0}),
  ]);
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/produtos`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${origin}/lojas`, changeFrequency: "daily", priority: 0.7 },
    { url: `${origin}/servicos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${origin}/marketplaces`, changeFrequency: "weekly", priority: 0.6 },
    ...products.items.map((item) => ({ url: `${origin}/produtos/${item.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...stores.items.map((store) => ({ url: `${origin}/lojas/${store.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...professionals.items.map(p=>({url:`${origin}/servicos/profissionais/${p.slug}`,changeFrequency:'daily' as const,priority:0.7})),
  ];
}
