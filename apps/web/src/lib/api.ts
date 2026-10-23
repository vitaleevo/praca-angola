const apiBase = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function publicApi<T>(path: string, fallback: T, revalidate = 30): Promise<T> {
  try {
    const response = await fetch(`${apiBase}${path}`, revalidate===0?{cache:'no-store'}:{ next: { revalidate } });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export function kwanza(value: string | number): string {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "— Kz";
  return `${new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 2 }).format(number)} Kz`;
}

export type Listing = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  price: string;
  currency: "AOA";
  condition: "new" | "used" | "refurbished";
  price_negotiable?: boolean;
  available_quantity?: number;
  province: string;
  municipality: string;
  category: string;
  category_slug?: string;
  store_slug: string;
  store_name: string;
  images?: { url: string; alt: string }[];
};

export type Store = {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  province: string;
  municipality: string;
  is_verified: boolean;
  listing_count?: number;
  average_rating?: number | null;
  review_count?: number;
  profile_type?: "individual" | "business";
  logo_url?: string | null;
  cover_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  delivery_policy?: string | null;
  returns_policy?: string | null;
  terms_policy?: string | null;
};

export type StoreDirectory = {
  items: Store[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  provinces: string[];
};

export type StoreCategory = { slug: string; name: string; product_count: number };
