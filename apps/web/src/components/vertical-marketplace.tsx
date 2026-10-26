import Link from "next/link";
import { publicApi, type Listing } from "../lib/api";
import {
  verticalMarketplaces,
  type VerticalCategory,
  type VerticalMarketplace,
} from "../lib/marketplaces";
import { CategoryCarousel } from "./category-carousel";
import { MarketFilters } from "./market-filters";
import { MarketIcon } from "./market-icons";
import { SiteFooter, SiteHeader } from "./site-header";
import { VerticalListingCard } from "./vertical-listing-card";

type Search = Record<string, string | string[] | undefined>;
type Category = { id?: string; name: string; slug: string; description?: string | null };
type ListingResults = { items: Listing[]; total: number; page: number; pages: number };

const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const provinces = ["Luanda", "Benguela", "Huambo", "Huíla", "Cabinda", "Namibe", "Bié", "Uíge", "Zaire", "Malanje", "Cuanza Norte", "Cuanza Sul", "Moxico", "Lunda Norte", "Lunda Sul", "Bengo", "Cuando", "Cubango", "Icolo e Bengo", "Moxico Leste", "Cunene"];
const companyTypes = [["loja", "Loja"], ["fornecedor", "Fornecedor"], ["prestador", "Prestador de serviços"], ["distribuidor", "Distribuidor"], ["fabricante", "Fabricante"]];
const fuelTypes = [["gasolina", "Gasolina"], ["gasoleo", "Gasóleo"], ["eletrico", "Elétrico"], ["hibrido", "Híbrido"], ["gpl", "GPL"]];

function integerInRange(value: string, min: number, max: number): string {
  if (!/^\d+$/.test(value)) return "";
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? String(parsed) : "";
}

function buildQuery(config: VerticalMarketplace, filters: Search): URLSearchParams {
  const query = new URLSearchParams({ marketplace: config.slug });
  const q = one(filters.q).trim().slice(0, 140);
  const category = one(filters.category).slice(0, 80);
  const province = one(filters.province).slice(0, 100);
  const municipality = one(filters.municipality).slice(0, 100);
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (province) query.set("province", province);
  if (municipality) query.set("municipality", municipality);
  for (const key of ["minPrice", "maxPrice"] as const) {
    const value = one(filters[key]);
    if (value && Number.isFinite(Number(value)) && Number(value) >= 0) query.set(key, value);
  }
  const sort = one(filters.sort);
  query.set("sort", ["recent", "price_asc", "price_desc"].includes(sort) ? sort : "recent");
  const page = integerInRange(one(filters.page), 1, 10_000);
  if (page) query.set("page", page);
  if (config.slug === "imoveis") {
    const transaction = one(filters.transaction);
    if (["venda", "arrendamento"].includes(transaction)) query.set("transaction", transaction);
    const bedrooms = integerInRange(one(filters.bedrooms), 0, 50);
    if (bedrooms) query.set("bedrooms", bedrooms);
  }
  if (config.slug === "automoveis") {
    const make = one(filters.make).trim().slice(0, 60);
    if (make) query.set("make", make);
    const fuel = one(filters.fuel);
    if (fuelTypes.some(([value]) => value === fuel)) query.set("fuel", fuel);
    const yearMin = integerInRange(one(filters.yearMin), 1950, new Date().getFullYear() + 1);
    if (yearMin) query.set("yearMin", yearMin);
  }
  if (config.slug === "empresas") {
    const companyType = one(filters.companyType);
    if (companyTypes.some(([value]) => value === companyType)) query.set("companyType", companyType);
    const sector = one(filters.sector).trim().slice(0, 80);
    if (sector) query.set("sector", sector);
  }
  return query;
}

function mergeCategories(config: VerticalMarketplace, apiCategories: Category[]): VerticalCategory[] {
  const fallback = new Map(config.categories.map((category) => [category.slug, category]));
  const source = apiCategories.length > 0
    ? apiCategories
    : config.categories.map((category) => ({ ...category, id: category.slug }));
  return source.map((category) => ({
    slug: category.slug,
    name: category.name,
    icon: fallback.get(category.slug)?.icon ?? "grid",
  }));
}

export async function VerticalMarketplacePage({ config, searchParams }: { config: VerticalMarketplace; searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const query = buildQuery(config, filters);
  const [apiCategories, results] = await Promise.all([
    publicApi<Category[]>(`/catalog/categories?marketplace=${config.slug}`, []),
    publicApi<ListingResults>(`/catalog/listings?${query.toString()}`, { items: [], total: 0, page: 1, pages: 0 }),
  ]);
  const categories = mergeCategories(config, apiCategories);
  const selectedCategory = categories.find((category) => category.slug === query.get("category"));
  const resultNoun = results.total === 1 ? config.singular : config.name.toLowerCase();
  const resultVerb = config.slug === "empresas"
    ? (results.total === 1 ? "encontrada" : "encontradas")
    : (results.total === 1 ? "encontrado" : "encontrados");
  const currentPage = results.page || 1;
  const hrefFor = (next: Record<string, string>) => {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `/${config.slug}?${params.toString()}`;
  };

  return (
    <main className={`market-shell vertical-market vertical-market-${config.slug}`}>
      <SiteHeader searchAction={`/${config.slug}`} searchPlaceholder={config.searchPlaceholder} />
      <section className={`vertical-hero vertical-hero-${config.slug}`}>
        <div className="vertical-hero-content">
          <p className="market-kicker">{config.kicker}</p>
          <h1>{config.headline}<br /><em>{config.highlight}</em></h1>
          <p>{config.description}</p>
          <form action={`/${config.slug}`} className="market-search" role="search">
            <label>
              <MarketIcon name="search" />
              <span className="sr-only">Pesquisar {config.name.toLowerCase()}</span>
              <input name="q" maxLength={140} defaultValue={query.get("q") ?? ""} placeholder={config.searchPlaceholder} />
            </label>
            <label>
              <MarketIcon name="pin" />
              <span className="sr-only">Localização</span>
              <select name="province" defaultValue={query.get("province") ?? ""}>
                <option value="">Toda Angola</option>
                {provinces.slice(0, 6).map((province) => <option key={province}>{province}</option>)}
              </select>
            </label>
            <button type="submit">Pesquisar <span aria-hidden="true">→</span></button>
          </form>
          <div className="vertical-hero-facts">
            <span><i aria-hidden="true">✓</i> Anúncios locais</span>
            <span><i aria-hidden="true">✓</i> Contacto direto</span>
            <span><i aria-hidden="true">✓</i> Em toda Angola</span>
          </div>
          <CategoryCarousel
            categories={categories}
            path={`/${config.slug}`}
            services={false}
            ariaLabel={`Categorias de ${config.name.toLowerCase()}`}
            allLabel="Ver todos"
          />
        </div>
        <div className="vertical-hero-art" aria-hidden="true">
          <div className="vertical-art-panel">
            <span className="vertical-art-kicker">PUVO · {config.name}</span>
            <div className="vertical-art-icon"><MarketIcon name={config.categories[0]?.icon ?? "grid"} /></div>
            <div className="vertical-art-lines"><i /><i /><i /></div>
            <span className="vertical-art-label">{config.headline} {config.highlight}</span>
          </div>
          <div className="vertical-art-chip vertical-art-chip-top"><b>{config.categories[1]?.name}</b><span>Explorar ↗</span></div>
          <div className="vertical-art-chip vertical-art-chip-bottom"><b>{config.categories[2]?.name}</b><span>Explorar ↗</span></div>
        </div>
      </section>

      <div className="market-layout">
        <div className="market-sidebar">
          <MarketFilters>
            <form action={`/${config.slug}`} className="market-filter-form">
              <Link className="filter-reset" href={`/${config.slug}`}>Limpar filtros</Link>
              <input type="hidden" name="q" value={query.get("q") ?? ""} />
              <input type="hidden" name="sort" value={query.get("sort") ?? "recent"} />
              <label>
                Categoria
                <select name="category" defaultValue={query.get("category") ?? ""}>
                  <option value="">Todas as categorias</option>
                  {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                </select>
              </label>
              <label>
                Província
                <select name="province" defaultValue={query.get("province") ?? ""}>
                  <option value="">Todas as províncias</option>
                  {provinces.map((province) => <option key={province}>{province}</option>)}
                </select>
              </label>
              <label>
                Município
                <input name="municipality" defaultValue={query.get("municipality") ?? ""} placeholder="Todos os municípios" maxLength={100} />
              </label>
              {config.slug === "imoveis" && (
                <>
                  <label>
                    Transação
                    <select name="transaction" defaultValue={query.get("transaction") ?? ""}>
                      <option value="">Comprar ou arrendar</option>
                      <option value="venda">Comprar</option>
                      <option value="arrendamento">Arrendar</option>
                    </select>
                  </label>
                  <label>
                    Quartos (mínimo)
                    <input name="bedrooms" type="number" min="0" max="50" defaultValue={query.get("bedrooms") ?? ""} placeholder="Qualquer" />
                  </label>
                </>
              )}
              {config.slug === "automoveis" && (
                <>
                  <label>
                    Marca
                    <input name="make" defaultValue={query.get("make") ?? ""} placeholder="Ex.: Toyota" maxLength={60} />
                  </label>
                  <label>
                    Combustível
                    <select name="fuel" defaultValue={query.get("fuel") ?? ""}>
                      <option value="">Todos</option>
                      {fuelTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Ano mínimo
                    <input name="yearMin" type="number" min="1950" max={new Date().getFullYear() + 1} defaultValue={query.get("yearMin") ?? ""} placeholder="Qualquer" />
                  </label>
                </>
              )}
              {config.slug === "empresas" && (
                <>
                  <label>
                    Tipo de empresa
                    <select name="companyType" defaultValue={query.get("companyType") ?? ""}>
                      <option value="">Todos</option>
                      {companyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Setor
                    <input name="sector" defaultValue={query.get("sector") ?? ""} placeholder="Ex.: Construção" maxLength={80} />
                  </label>
                </>
              )}
              <fieldset>
                <legend>{config.slug === "imoveis" ? "Preço ou renda (Kz)" : "Preço (Kz)"}</legend>
                <div className="filter-price-pair">
                  <label><span className="sr-only">Preço mínimo</span><input name="minPrice" type="number" min="0" defaultValue={query.get("minPrice") ?? ""} placeholder="Mínimo" /></label>
                  <label><span className="sr-only">Preço máximo</span><input name="maxPrice" type="number" min="0" defaultValue={query.get("maxPrice") ?? ""} placeholder="Máximo" /></label>
                </div>
              </fieldset>
              <button className="button button-primary" type="submit">Aplicar filtros</button>
            </form>
          </MarketFilters>
          <aside className="vertical-sidebar-cta">
            <span className="vertical-sidebar-cta-icon"><MarketIcon name={config.categories[0]?.icon ?? "grid"} /></span>
            <b>Tens algo para publicar?</b>
            <p>Chega a quem procura {config.name.toLowerCase()} em toda Angola.</p>
            <Link className="button button-primary" href={`/vendedor/anuncios/novo?marketplace=${config.slug}`}>{config.cta} <span aria-hidden="true">↗</span></Link>
          </aside>
        </div>

        <div className="market-results">
          <div className="market-location-strip">
            ⌖ Estás a explorar <b>{selectedCategory?.name ?? config.name.toLowerCase()}</b> em <b>{query.get("province") || "toda Angola"}</b>
            <a href="#market-filter-fields">Alterar filtros</a>
          </div>
          <div className="market-results-toolbar">
            <h2>{results.total} {resultNoun} {resultVerb}</h2>
            <form action={`/${config.slug}`}>
              {[...query].filter(([key]) => key !== "sort" && key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
              <label>
                Ordenar por
                <select name="sort" defaultValue={query.get("sort") ?? "recent"}>
                  <option value="recent">Mais recentes</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                </select>
              </label>
              <button className="button button-secondary">Ordenar</button>
            </form>
          </div>

          {results.items.length > 0 ? (
            <div className="vertical-listing-grid">
              {results.items.map((listing) => <VerticalListingCard key={listing.id} listing={listing} marketplace={config.slug} />)}
            </div>
          ) : (
            <div className="empty-state empty-state-large vertical-empty-state">
              <span className="vertical-empty-icon"><MarketIcon name={config.categories[0]?.icon ?? "grid"} /></span>
              <b>Os primeiros anúncios de {config.name.toLowerCase()} estão a chegar.</b>
              <span>Publica o teu ou ajusta os filtros para descobrir outras oportunidades.</span>
              <div className="vertical-empty-actions">
                <Link className="button button-primary" href={`/vendedor/anuncios/novo?marketplace=${config.slug}`}>{config.cta}</Link>
                <Link className="button button-secondary" href={`/${config.slug}`}>Limpar filtros</Link>
              </div>
            </div>
          )}

          {results.pages > 1 && (
            <nav className="pagination" aria-label={`Paginação de ${config.name.toLowerCase()}`}>
              {currentPage > 1 && <Link href={hrefFor({ page: String(currentPage - 1) })}>← Anterior</Link>}
              <span>Página {currentPage} de {results.pages}</span>
              {currentPage < results.pages && <Link href={hrefFor({ page: String(currentPage + 1) })}>Seguinte →</Link>}
            </nav>
          )}

          <section className="vertical-safety-note">
            <span className="vertical-safety-icon" aria-hidden="true">✓</span>
            <div><b>Negocia com confiança.</b><p>{config.safetyNote}</p></div>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

export function verticalMetadata(slug: "empresas" | "imoveis" | "automoveis") {
  const config = verticalMarketplaces[slug];
  return {
    title: config.name,
    description: config.description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: `${config.name} — P.U.V.O.`, description: config.description, url: `/${slug}` },
  };
}
