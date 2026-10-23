import Link from 'next/link';
import { publicApi } from "../../lib/api";
import { SiteFooter, SiteHeader } from "../../components/site-header";

type Marketplace = { id: string; slug: string; name: string; status: "active" | "coming_soon" | "suspended"; enabled: boolean };
const icons: Record<string, string> = { produtos: "▦", servicos: "✳", empresas: "▤", imoveis: "⌂", automoveis: "◉" };

export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const markets = await publicApi<Marketplace[]>("/marketplaces", []);
  const selected = markets.find((market) => market.slug === area);
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Marketplaces</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Uma praça, várias áreas</p><h1>Explora os marketplaces</h1><p>Cada mercado abre quando estiver pronto para receber anúncios reais.</p></div></div>{selected && !selected.enabled && <div className="empty-state marketplace-coming-soon"><b>{selected.name} está a ser preparado.</b><span>Estamos a organizar este mercado para receber anúncios locais com qualidade. Podes explorar Produtos enquanto isso.</span><Link className="button button-secondary" href="/produtos">Explorar produtos</Link></div>}<div className="market-grid">{markets.map((market, index) => <Link className={`market-card ${["sage", "sand", "blue", "rose", "lilac"][index % 5]}`} href={market.enabled ? (market.slug === "servicos" ? "/servicos" : "/produtos") : `/marketplaces?area=${market.slug}`} key={market.slug}><span className="market-icon" aria-hidden="true">{icons[market.slug] ?? "◌"}</span><span className="market-name">{market.name}</span><span className="market-count">{market.enabled ? "Explorar agora" : "A preparar"}</span><span className="market-arrow" aria-hidden="true">{market.enabled ? "↗" : "·"}</span></Link>)}</div><p className="legal-note market-note">Os mercados que ainda estão a ser preparados não recebem anúncios nem pedidos.</p></div><SiteFooter/></main>;
}

