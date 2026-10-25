import Link from "next/link";
import { publicApi } from "../../lib/api";
import { MarketplaceFocusCards, type PublicMarketplace } from "../../components/marketplace-focus-cards";
import { SiteFooter, SiteHeader } from "../../components/site-header";

type Marketplace = PublicMarketplace & {
  status: "active" | "coming_soon" | "suspended";
};

export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const markets = await publicApi<Marketplace[]>("/marketplaces", []);
  const selected = markets.find((market) => market.slug === area && market.status === "coming_soon");
  const planned = markets.filter((market) => market.status === "coming_soon");

  return (
    <main>
      <SiteHeader/>
      <div className="page-wrap marketplace-index">
        <nav className="breadcrumbs" aria-label="Navegação estrutural">
          <Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Mercados</span>
        </nav>

        <header className="marketplace-index-heading">
          <p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> PUVO · Angola</p>
          <h1>Escolhe o que precisas.</h1>
          <p>Explora os mercados disponíveis hoje com a tua conta PUVO.</p>
        </header>

        {selected && (
          <aside className="marketplace-coming-note" aria-live="polite">
            <div><span className="marketplace-coming-status">Em preparação</span><h2>{selected.name}</h2><p>Estamos a preparar este mercado. Enquanto isso, podes explorar os produtos e serviços disponíveis.</p></div>
            <Link className="button button-secondary" href="#marketplace-options">Ver mercados disponíveis</Link>
          </aside>
        )}

        <section id="marketplace-options" aria-label="Marketplaces disponíveis">
          <MarketplaceFocusCards markets={markets}/>
        </section>

        {planned.length > 0 && (
          <details className="marketplace-roadmap">
            <summary>Outros setores em preparação <span>{planned.length}</span></summary>
            <p>Estes setores ainda não recebem anúncios nem pedidos. Vamos disponibilizá-los quando estiverem prontos para funcionar com qualidade.</p>
            <ul>{planned.map((market) => <li key={market.slug}>{market.name}<span>Em preparação</span></li>)}</ul>
          </details>
        )}
      </div>
      <SiteFooter/>
    </main>
  );
}
