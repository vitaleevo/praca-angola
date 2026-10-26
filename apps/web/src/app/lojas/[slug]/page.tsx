import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { publicApi, Listing, Store, StoreCategory } from "../../../lib/api";
import { ProductCard } from "../../../components/product-card";
import { ShareStoreButton } from "../../../components/share-store-button";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

type StorefrontResult = { store: Store; listings: Listing[]; categories: StoreCategory[]; page: number; pages: number; total: number };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await publicApi<StorefrontResult | null>("/catalog/stores/" + encodeURIComponent(slug), null);
  return result ? {
    title: result.store.display_name,
    description: result.store.description || "Descobre produtos de " + result.store.display_name + " na PUVO.",
    alternates: { canonical: "/lojas/" + result.store.slug },
    openGraph: { title: result.store.display_name + " — P.U.V.O.", description: result.store.description || "Conhece a montra pública desta loja angolana.", type: "website" },
  } : { title: "Loja não encontrada" };
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const [{ slug }, paramsQuery] = await Promise.all([params, searchParams]);
  const q = one(paramsQuery.q).trim().slice(0, 140);
  const category = one(paramsQuery.category).slice(0, 80);
  const sort = ["recent", "price_asc", "price_desc"].includes(one(paramsQuery.sort)) ? one(paramsQuery.sort) : "recent";
  const page = Math.max(1, Math.min(10000, Number.parseInt(one(paramsQuery.page), 10) || 1));
  const query = new URLSearchParams({ q, category, sort, page: String(page), limit: "24" });
  const result = await publicApi<StorefrontResult | null>("/catalog/stores/" + encodeURIComponent(slug) + "?" + query.toString(), null);
  if (!result) notFound();
  const { store, listings, categories } = result;
  const storePolicies = [
    ["Entrega", store.delivery_policy],
    ["Trocas e devoluções", store.returns_policy],
    ["Condições de venda", store.terms_policy],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim()));
  function catalogHref(next: { q?: string; category?: string; sort?: string; page?: number }) {
    const values = new URLSearchParams({
      q: next.q ?? q,
      category: next.category ?? category,
      sort: next.sort ?? sort,
      page: String(next.page ?? 1),
    });
    return "/lojas/" + store.slug + "?" + values.toString() + "#catalogo";
  }

  return <main><SiteHeader/><div className="page-wrap store-front">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/lojas">Lojas</Link><span>/</span><span>{store.display_name}</span></div>
    <header className="store-front-cover">
      {store.cover_url && <Image className="store-front-cover-image" src={store.cover_url} alt="" fill sizes="(max-width: 900px) 100vw, 1160px" priority/>}
      <div className="store-cover-pattern" aria-hidden="true"><span>p.</span></div>
      <div className="store-front-brand">
        <span className="store-mark store-green store-mark-large store-front-logo" aria-hidden="true">{store.logo_url ? <Image src={store.logo_url} alt="" width={68} height={68} sizes="68px"/> : store.display_name.slice(0, 1).toUpperCase()}</span>
        <div className="store-front-identity"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/>{store.profile_type === "individual" ? "Vendedor local" : "Loja na PUVO"}</p>
          <h1>{store.display_name}{store.is_verified && <span className="verified-badge" aria-label="Loja verificada">✓ Verificada</span>}</h1>
          <p className="store-front-description">{store.description || "Conhece os produtos e as novidades desta loja local."}</p>
          <span className="detail-location">⌖ {store.province} · {store.municipality}</span>
        </div>
      </div>
      <div className="store-front-actions"><a className="button button-primary" href="#catalogo">Explorar produtos <span aria-hidden="true">↓</span></a><ShareStoreButton/></div>
    </header>
    <section className="store-trust-row" aria-label="Informação da loja">
      <div><b>{store.listing_count ?? listings.length}</b><span>produtos publicados</span></div>
      <div><b>{store.average_rating ? <><span aria-hidden="true">★</span> {store.average_rating} / 5</> : "—"}</b><span>{store.review_count ? store.review_count + " avaliações de compradores" : "Sem avaliações ainda"}</span></div>
      <div><b>{store.is_verified ? "Verificada" : "Perfil público"}</b><span>{store.is_verified ? "Identidade confirmada pela PUVO" : "Informações publicadas pela loja"}</span></div>
    </section>
    {(store.contact_email || store.contact_phone || storePolicies.length > 0) && <section className="store-information-grid" aria-label="Contactos e condições da loja">
      {(store.contact_email || store.contact_phone) && <div className="store-information-card store-contact-card"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Fala com a loja</p><h2>Contacto comercial</h2><p>Usa estes canais públicos para esclarecer dúvidas sobre os produtos e a entrega.</p><div className="store-contact-links">{store.contact_phone && <a href={`tel:${store.contact_phone.replace(/\s/g, "")}`}><span aria-hidden="true">☎</span><span><small>Telefone</small><b>{store.contact_phone}</b></span></a>}{store.contact_email && <a href={`mailto:${store.contact_email}`}><span aria-hidden="true">✉</span><span><small>E-mail</small><b>{store.contact_email}</b></span></a>}</div></div>}
      {storePolicies.length > 0 && <div className="store-information-card store-policy-card"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Antes de encomendar</p><h2>Entrega e condições</h2><div className="store-policy-list">{storePolicies.map(([title, text]) => <details key={title}><summary>{title}</summary><p>{text}</p></details>)}</div></div>}
    </section>}
    <section className="store-catalog-section" id="catalogo">
      <div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Montra da loja</div><h2>Produtos disponíveis</h2><p>{result.total} {result.total === 1 ? "produto corresponde" : "produtos correspondem"} à tua pesquisa</p></div><Link className="text-link" href="/lojas">Descobrir outras lojas <span>↗</span></Link></div>
      <nav className="store-category-chips" aria-label="Categorias da loja"><Link className={!category ? "active" : ""} href={catalogHref({ category: "" })}>Todos <span>{store.listing_count ?? listings.length}</span></Link>{categories.filter((item) => item.product_count > 0).map((item) => <Link className={category === item.slug ? "active" : ""} href={catalogHref({ category: item.slug })} key={item.slug}>{item.name} <span>{item.product_count}</span></Link>)}</nav>
      <form className="store-product-filters" action={"/lojas/" + store.slug + "#catalogo"} method="get">
        <label>Pesquisar nesta loja<input type="search" name="q" defaultValue={q} placeholder="Nome de produto ou palavra-chave"/></label>
        <input type="hidden" name="category" value={category}/>
        <label>Ordenar por<select name="sort" defaultValue={sort}><option value="recent">Mais recentes</option><option value="price_asc">Menor preço</option><option value="price_desc">Maior preço</option></select></label>
        <button className="button button-secondary" type="submit">Pesquisar</button>
        {(q || category) && <a className="store-clear-filter" href={catalogHref({ q: "", category: "" })}>Limpar filtros</a>}
      </form>
      {listings.length ? <><div className="product-grid">{listings.map((product) => <ProductCard key={product.id} product={{ ...product, store_slug: store.slug, store_name: store.display_name }}/>)}</div>{result.pages > 1 && <nav className="pagination" aria-label="Paginação de produtos da loja"><span>Página {result.page} de {result.pages}</span>{result.page > 1 && <Link href={catalogHref({ page: result.page - 1 })}>← Anterior</Link>}{result.page < result.pages && <Link href={catalogHref({ page: result.page + 1 })}>Seguinte →</Link>}</nav>}</> : <div className="empty-state empty-state-large"><b>{q || category ? "Não encontrámos produtos com estes filtros." : "Esta montra ainda está a preparar os seus primeiros produtos."}</b><span>{q || category ? "Experimenta outra pesquisa ou vê todos os produtos desta loja." : "Volta em breve para descobrir novidades."}</span>{(q || category) && <Link className="button button-secondary" href={catalogHref({ q: "", category: "" })}>Ver todos os produtos</Link>}</div>}
    </section>
    <aside className="store-about-note"><span className="store-about-icon" aria-hidden="true">✓</span><p><b>Compra com informação clara.</b><span>Confirma os detalhes e combina a entrega diretamente com a loja. As avaliações só aparecem após encomendas concluídas.</span></p></aside>
  </div><SiteFooter/></main>;
}
