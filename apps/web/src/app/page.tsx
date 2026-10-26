import { publicApi, Listing, Store } from "../lib/api";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { SiteFooter, SiteHeader } from "../components/site-header";
import { MarketplaceFocusCards, type PublicMarketplace } from "../components/marketplace-focus-cards";


function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
}

export default async function Home() {
  const [{ items: products }, stores, marketplaces] = await Promise.all([
    publicApi<{ items: Listing[] }>("/catalog/listings?limit=4", { items: [] }),
    publicApi<{ items: Store[] }>("/catalog/stores?limit=24", { items: [] }),
    publicApi<PublicMarketplace[]>("/marketplaces", []),
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
          <div className="popular-searches"><span>Começa por:</span><Link href="/produtos?q=telem%C3%B3veis">telemóveis</Link><Link href="/produtos?q=m%C3%B3veis">móveis</Link><Link href="/servicos?q=canaliza%C3%A7%C3%A3o">canalizadores</Link></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-sun"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card card-top"><span className="mini-icon">✳</span><span><b>Profissionais locais</b><small>Encontra quem te pode ajudar</small></span><i>↗</i></div><div className="art-card card-bottom"><span className="mini-avatar">A</span><span><b>Negócios locais</b><small>Feitos aqui, para ti</small></span><i>↗</i></div><div className="art-main"><div className="art-main-top"><span>ANGOLA · LUANDA</span><span className="art-dot"/></div><div className="art-landscape"><div className="art-hill hill-back"/><div className="art-hill hill-front"/><div className="art-building"><i/><i/><i/><i/><i/><i/></div><div className="art-palm palm-one"><i/><b/></div><div className="art-palm palm-two"><i/><b/></div></div><div className="art-caption"><span className="caption-mark">✳</span><span><b>A tua próxima descoberta</b><small>pode estar mesmo aqui</small></span></div></div><div className="art-stamp">AO<br/><span>12°</span></div></div>
      </section>

      <section className="marketplaces section-wrap" id="marketplaces"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Começa por aqui</div><h2>Produtos e serviços para o dia a dia</h2><p>Escolhe um mercado e encontra o que precisas.</p></div><Link className="text-link" href="/marketplaces">Ver mercados <span>↗</span></Link></div><MarketplaceFocusCards markets={marketplaces}/></section>

      <section className="products-section" id="produtos"><div className="section-wrap"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Escolhas da comunidade</div><h2>Produtos em destaque</h2><p>Coisas boas, de quem está perto.</p></div><Link className="text-link" href="/produtos">Ver todos <span>↗</span></Link></div>{products.length ? <div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <div className="empty-state"><b>Estamos a preparar a PUVO.</b><span>Os primeiros produtos publicados vão aparecer aqui.</span></div>}<div className="products-bottom"><span>Uma seleção de vendedores locais</span><Link href="/produtos">Explorar todos os produtos <span>→</span></Link></div></div></section>

      <section className="stores-section section-wrap" id="lojas"><div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Feito perto, com orgulho</div><h2>Lojas para conhecer</h2><p>Negócios locais com algo especial.</p></div><Link className="text-link" href="/lojas">Ver todas <span>↗</span></Link></div>{stores.items.length ? <div className="store-grid">{stores.items.slice(0, 3).map((store) => <Link className="store-card" href={"/lojas/" + store.slug} key={store.id}><span className="store-mark store-green">{store.logo_url ? <Image src={store.logo_url} alt="" width={52} height={52} sizes="52px"/> : store.display_name.slice(0, 1).toUpperCase()}</span><span className="store-copy"><b>{store.display_name}{store.is_verified && <i aria-label="Loja verificada">✓</i>}</b><small>{store.description || "Loja local na PUVO"}</small><small className="store-location">⌖ {store.province} · {store.municipality}</small><small>{store.listing_count ?? 0} produtos{store.average_rating ? " · ★ " + store.average_rating + " (" + (store.review_count ?? 0) + ")" : ""}</small></span><span className="store-arrow">↗</span></Link>)}</div> : <div className="empty-state"><b>As lojas locais estão a chegar.</b><span>Em breve vais encontrar negócios de toda Angola.</span></div>}</section>

      <section className="join-section" id="vender"><div className="join-pattern" aria-hidden="true">✳</div><div className="join-content"><div className="eyebrow eyebrow-light"><span className="eyebrow-line"/> O teu negócio merece ser visto</div><h2>Há lugar para ti<br/>na nossa PUVO.</h2><p>Mostra o que fazes. Chega a mais pessoas. Cresce ao teu ritmo.</p><div className="join-actions"><Link className="join-button" href="/vendedor">Começar a vender <span>↗</span></Link><Link className="join-service-link" href="/profissional">Ofereces serviços? Cria o teu perfil <span>→</span></Link></div></div><div className="join-note"><span className="join-note-mark">p.</span><span>Juntos,<br/>fazemos PUVO.</span></div></section>

      <SiteFooter />
    </main>
  );
}
