import { publicApi, Store, StoreDirectory } from "../../lib/api";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-header";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function StoresPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 120);
  const province = one(params.province).slice(0, 100);
  const sort = ["featured", "products_desc", "rating_desc", "name_asc"].includes(one(params.sort)) ? one(params.sort) : "featured";
  const page = Math.max(1, Math.min(10000, Number.parseInt(one(params.page), 10) || 1));
  const query = new URLSearchParams({ q, province, sort, page: String(page), limit: "12" });
  const directory = await publicApi<StoreDirectory>("/catalog/stores?" + query.toString(), {
    items: [], page: 1, limit: 12, total: 0, pages: 0, provinces: [],
  });
  const hasFilters = Boolean(q || province);
  function pageHref(nextPage: number) {
    const next = new URLSearchParams({ q, province, sort, page: String(nextPage), limit: "12" });
    return "/lojas?" + next.toString();
  }

  return <main><SiteHeader/><div className="page-wrap store-directory">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Lojas</span></div>
    <header className="store-directory-heading">
      <div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Negócios angolanos</p><h1>Encontra a tua próxima loja</h1><p>Explora montras locais, conhece os vendedores e descobre produtos disponíveis perto de ti.</p></div>
      <a className="button button-primary" href="/vendedor">Abrir a minha loja <span aria-hidden="true">↗</span></a>
    </header>
    <section className="store-directory-tools" aria-label="Pesquisar e filtrar lojas">
      <div className="store-directory-intro"><b>Montras públicas</b><span>{directory.total} {directory.total === 1 ? "loja encontrada" : "lojas encontradas"}</span></div>
      <form className="store-filter-form" action="/lojas" method="get">
        <label>Pesquisar lojas<input type="search" name="q" defaultValue={q} placeholder="Nome da loja ou o que vende"/></label>
        <label>Província<select name="province" defaultValue={province}><option value="">Todas as províncias</option>{directory.provinces.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Ordenar por<select name="sort" defaultValue={sort}><option value="featured">Recomendadas</option><option value="products_desc">Mais produtos</option><option value="rating_desc">Melhor avaliadas</option><option value="name_asc">Nome A–Z</option></select></label>
        <button className="button button-primary" type="submit">Aplicar filtros</button>
      </form>
    </section>
    {directory.items.length ? <>
      <div className="store-directory-results">
        {directory.items.map((store: Store) => <Link className="store-directory-card" href={"/lojas/" + store.slug} key={store.id}>
          <span className="store-mark store-green store-directory-mark" aria-hidden="true">{store.logo_url ? <Image src={store.logo_url} alt="" width={52} height={52} sizes="52px"/> : store.display_name.slice(0, 1).toUpperCase()}</span>
          <span className="store-directory-card-copy">
            <span className="store-directory-name">{store.display_name}{store.is_verified && <span className="verified-badge" aria-label="Loja verificada">✓ Verificada</span>}</span>
            <span className="store-directory-description">{store.description || "Conhece os produtos e as novidades desta loja local."}</span>
            <span className="store-directory-meta"><span>⌖ {store.province} · {store.municipality}</span><span>{store.listing_count ?? 0} {(store.listing_count ?? 0) === 1 ? "produto" : "produtos"}</span>{store.average_rating ? <span aria-label={"Classificação " + store.average_rating + " de 5"}>★ {store.average_rating} · {store.review_count ?? 0} avaliações</span> : <span>Sem avaliações</span>}</span>
          </span>
          <span className="store-directory-arrow" aria-hidden="true">↗</span>
        </Link>)}
      </div>
      {directory.pages > 1 && <nav className="pagination" aria-label="Paginação de lojas"><span>Página {directory.page} de {directory.pages}</span>{directory.page > 1 && <Link href={pageHref(directory.page - 1)}>← Anterior</Link>}{directory.page < directory.pages && <Link href={pageHref(directory.page + 1)}>Seguinte →</Link>}</nav>}
    </> : <div className="empty-state empty-state-large store-directory-empty"><b>{hasFilters ? "Não encontrámos lojas com esses filtros." : "Ainda não há lojas públicas."}</b><span>{hasFilters ? "Experimenta outro nome ou escolhe uma província diferente." : "As lojas vão aparecer aqui quando publicarem a sua montra."}</span><div>{hasFilters && <Link className="button button-secondary" href="/lojas">Limpar filtros</Link>}<Link className="button button-primary" href="/vendedor">Criar uma loja</Link></div></div>}
  </div><SiteFooter/></main>;
}
