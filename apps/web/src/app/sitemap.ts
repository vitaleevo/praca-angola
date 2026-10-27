import type { MetadataRoute } from "next";
import { publicApi, Listing, Store } from "../lib/api";
import { listingPath } from "../lib/marketplaces";
import { ProfessionalDirectory } from '../lib/services';

const origin = process.env.VERCEL
  ? "https://puvo.vitaleevo.ao"
  : process.env.PUBLIC_SITE_URL?.trim() || "http://localhost:3100";

type ListingFeed = { items: Listing[] };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, empresas, imoveis, automoveis, stores, professionals] = await Promise.all([
    publicApi<ListingFeed>("/catalog/listings?limit=48&marketplace=produtos", { items: [] }),
    publicApi<ListingFeed>("/catalog/listings?limit=48&marketplace=empresas", { items: [] }),
    publicApi<ListingFeed>("/catalog/listings?limit=48&marketplace=imoveis", { items: [] }),
    publicApi<ListingFeed>("/catalog/listings?limit=48&marketplace=automoveis", { items: [] }),
    publicApi<{ items: Store[] }>("/catalog/stores?limit=48", { items: [] }),
    publicApi<ProfessionalDirectory>('/services/professionals',{items:[],page:1,pages:0,total:0}),
  ]);
  const listings = [...products.items, ...empresas.items, ...imoveis.items, ...automoveis.items];
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/produtos`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${origin}/empresas`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/imoveis`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${origin}/automoveis`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${origin}/lojas`, changeFrequency: "daily", priority: 0.7 },
    { url: `${origin}/servicos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${origin}/marketplaces`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${origin}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/eliminar-dados`, changeFrequency: "yearly", priority: 0.3 },
    ...listings.map((item) => ({ url: `${origin}${listingPath(item)}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...stores.items.map((store) => ({ url: `${origin}/lojas/${store.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...professionals.items.map(p=>({url:`${origin}/servicos/profissionais/${p.slug}`,changeFrequency:'daily' as const,priority:0.7})),
  ];
}
