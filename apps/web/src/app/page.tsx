import { publicApi, Listing, Store } from "../lib/api";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { SiteFooter, SiteHeader } from "../components/site-header";

const marketplaceIcons: Record<string, string> = { produtos: "▦", servicos: "✳", empresas: "▤", imoveis: "⌂", automoveis: "◉" };
const marketplaceTones = ["sage", "sand", "blue", "rose", "lilac"];
const marketplaceDescriptions: Record<string, string> = { produtos: "Compra e venda", servicos: "Encontra profissionais", empresas: "Lojas e fornecedores", imoveis: "Casas e espaços", automoveis: "Viaturas e peças" };
type Marketplace = { slug: string; name: string; status: string; enabled: boolean };

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
}

export default async function Home() {
  const [{ items: products }, stores, marketplaces] = await Promise.all([
    publicApi<{ items: Listing[] }>("/catalog/listings?limit=4", { items: [] }),
    publicApi<{ items: Store[] }>("/catalog/stores?limit=24", { items: [] }),
    publicApi<Marketplace[]>("/marketplaces", []),
  ]);
  return (
    <main>
      <SiteHeader />

      <section className="hero" id="inicio">
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line"/> A plataforma de todos nós</div>
          <h1>O que procuras<br/><span>hoje?</span></h1>
          <p className="hero-copy">Produtos, profissionais e empresas num só lugar.<br className="desktop-break"/> Encontra o que precisas, perto de ti.</p>
          <form className="search-bar" action="/produtos" role="search"><SearchIcon/><label className="sr-only" htmlFor="global-search">Pesquisar na PUVO</label><input id="global-search" name="q" placeholder="O que procuras?"/><span className="search-divider"/><label className="sr-only" htmlFor="search-place">Localização</label><select id="search-place" name="province"><option value="">Em todo o lado</option><option>Luanda</option><option>Benguela</option><option>Huambo</option></select><button type="submit">Pesquisar <span aria-hidden="true">→</span></button></form>
          <div className="popular-searches"><span>Em alta:</span><a href="#produtos">telemóveis</a><a href="#lojas">móveis</a><a href="#marketplaces">emprego</a><a href="#servicos">canalizadores</a></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-sun"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card card-top"><span className="mini-icon">⌂</span><span><b>Casas e espaços</b><small>Descobre o teu lugar</small></span><i>↗</i></div><div className="art-card card-bottom"><span className="mini-avatar">A</span><span><b>Negócios locais</b><small>Feitos aqui, para ti</small></span><i>↗</i></div><div className="art-main"><div className="art-main-top"><span>ANGOLA · LUANDA</span><span className="art-dot"/></div><div className="art-landscape"><div className="art-hill hill-back"/><div className="art-hill hill-front"/><div className="art-building"><i/><i/><i/><i/><i/><i/></div><div className="art-palm palm-one"><i/><b/></div><div className="art-palm palm-two"><i/><b/></div></div><div className="art-caption"><span className="caption-mark">✳</span><span><b>A tua próxima descoberta</b><small>pode estar mesmo aqui</small></span></div></div><div className="art-stamp">AO<br/><span>12°</span></div></div>
      </section>

      <section className="marketplaces section-wrap" id="marketplaces"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Tudo começa aqui</div><h2>Descobre a PUVO</h2><p>Um lugar, muitas possibilidades.</p></div><a className="text-link" href="/marketplaces">Ver todos <span>↗</span></a></div><div className="market-grid">{marketplaces.slice(0, 5).map((item, index) => <a className={`market-card ${marketplaceTones[index % marketplaceTones.length]}`} href={item.enabled ? (item.slug === "servicos" ? "/servicos" : "/produtos") : `/marketplaces?area=${item.slug}`} key={item.slug}><span className="market-icon" aria-hidden="true">{marketplaceIcons[item.slug] ?? "◌"}</span><span className="market-name">{item.name}</span><span className="market-count">{item.enabled ? marketplaceDescriptions[item.slug] ?? "Explorar" : "A preparar"}</span><span className="market-arrow" aria-hidden="true">{item.enabled ? "↗" : "·"}</span></a>)}</div></section>

      <section className="products-section" id="produtos"><div className="section-wrap"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Escolhas da comunidade</div><h2>Produtos em destaque</h2><p>Coisas boas, de quem está perto.</p></div><Link className="text-link" href="/produtos">Ver todos <span>↗</span></Link></div>{products.length ? <div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <div className="empty-state"><b>Estamos a preparar a PUVO.</b><span>Os primeiros produtos publicados vão aparecer aqui.</span></div>}<div className="products-bottom"><span>Uma seleção de vendedores locais</span><Link href="/produtos">Explorar todos os produtos <span>→</span></Link></div></div></section>

      <section className="stores-section section-wrap" id="lojas"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Feito perto, com orgulho</div><h2>Lojas para conhecer</h2><p>Negócios locais com algo especial.</p></div><Link className="text-link" href="/lojas">Ver todas <span>↗</span></Link></div>{stores.items.length ? <div className="store-grid">{stores.items.slice(0, 3).map((store) => <Link className="store-card" href={"/lojas/" + store.slug} key={store.id}><span className="store-mark store-green">{store.logo_url ? <Image src={store.logo_url} alt="" width={52} height={52} sizes="52px"/> : store.display_name.slice(0, 1).toUpperCase()}</span><span className="store-copy"><b>{store.display_name}{store.is_verified && <i aria-label="Loja verificada">✓</i>}</b><small>{store.description || "Loja local na PUVO"}</small><small className="store-location">⌖ {store.province} · {store.municipality}</small><small>{store.listing_count ?? 0} produtos{store.average_rating ? " · ★ " + store.average_rating + " (" + (store.review_count ?? 0) + ")" : ""}</small></span><span className="store-arrow">↗</span></Link>)}</div> : <div className="empty-state"><b>As lojas locais estão a chegar.</b><span>Em breve vais encontrar negócios de toda Angola.</span></div>}</section>

      <section className="join-section" id="vender"><div className="join-pattern" aria-hidden="true">✳</div><div className="join-content"><div className="eyebrow eyebrow-light"><span className="eyebrow-line"/> O teu negócio merece ser visto</div><h2>Há lugar para ti<br/>na nossa PUVO.</h2><p>Mostra o que fazes. Chega a mais pessoas. Cresce ao teu ritmo.</p><a className="join-button" href="/vendedor">Apresenta o teu negócio <span>↗</span></a></div><div className="join-note"><Image className="join-note-mark" src="/brand/puvo-mark-192.png" alt="" width={50} height={50} /><span>Juntos,<br/>fazemos P.U.V.O.</span></div></section>

      <SiteFooter />
    </main>
  );
}
