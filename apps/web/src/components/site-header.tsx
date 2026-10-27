import { BrandLockup } from "@puvo/ui/brand-lockup";
import { HeaderAuth } from "./header-actions";
import Link from "next/link";
import { SiteNav } from './site-nav';
import { HeaderQuickLinks } from "./header-quick-links";

export function SiteHeader({services=false,workspace=false,searchAction,searchPlaceholder}:{services?:boolean;workspace?:boolean;searchAction?:string;searchPlaceholder?:string}={}) {
  const action = searchAction ?? (services ? '/servicos' : '/produtos');
  const placeholder = searchPlaceholder ?? (services ? 'Que serviço procuras?' : 'Pesquisar produtos…');
  return <>
    <div className={`announcement ${services?'service-announcement':''}`}><span className="announcement-dot" /> {services?'Talento e empresas de Angola, num só lugar.':'Todos os canais. Uma só operação.'} <span className="announcement-separator">·</span> {services?'Por uma Angola que faz mais.':'Descobre o que está perto de ti'}</div>
    <header className={`site-header ${services?'service-header':''}`}>
      <BrandLockup className="site-brand" />
      <SiteNav services={services}/>
      <form className="header-market-search" action={action}><label className="sr-only" htmlFor="header-search">Pesquisa rápida</label><input id="header-search" name="q" placeholder={placeholder} maxLength={140}/><button aria-label="Pesquisar" type="submit">⌕</button></form>
      <div className="header-actions"><HeaderQuickLinks services={services} showCart={!services}/><HeaderAuth workspace={workspace}/>{!workspace&&<Link className="sell-button" href={services?'/servicos/pedidos/novo':'/vendedor'}>{services?'Publicar pedido':'Vender'} <span aria-hidden="true">＋</span></Link>}</div>
    </header>
  </>;
}

export function SiteFooter() {
 return <footer className="site-footer-v2"><div className="footer-v2-grid"><div><BrandLockup className="footer-brand" /><p>Todos os canais. Uma só operação.<br/>Produtos, empresas, imóveis, automóveis e talento de Angola.</p></div><nav aria-label="Explorar"><b>Explorar</b><Link href="/produtos">Produtos</Link><Link href="/empresas">Empresas</Link><Link href="/imoveis">Imóveis</Link><Link href="/automoveis">Automóveis</Link><Link href="/lojas">Lojas</Link><Link href="/servicos">Profissionais</Link><Link href="/marketplaces">Todos os mercados</Link></nav><nav aria-label="Vender e trabalhar"><b>Crescer na P.U.V.O.</b><Link href="/vendedor">Criar loja</Link><Link href="/vendedor/anuncios/novo">Publicar anúncio</Link><Link href="/profissional">Criar perfil profissional</Link><Link href="/servicos/pedidos">Pedidos de serviços</Link><Link href="/estafeta">Área do Estafeta</Link></nav><nav aria-label="Apoio"><b>Ajuda</b><Link href="/ajuda">Centro de ajuda</Link><Link href="/privacidade">Privacidade</Link><Link href="/eliminar-dados">Eliminação de dados</Link><Link href="/conta">A minha conta</Link><Link href="/conta/mensagens">Mensagens</Link></nav></div><div className="footer-v2-bottom"><span>© 2026 P.U.V.O. Todos os direitos reservados.</span><span>Feito para conectar Angola.</span></div></footer>;
}
