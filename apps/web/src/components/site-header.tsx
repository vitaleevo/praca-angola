import { CartLink, HeaderAuth } from "./header-actions";
import Link from "next/link";
import { SiteNav } from './site-nav';

export function SiteHeader({services=false}:{services?:boolean}={}) {
  return <>
    <div className={`announcement ${services?'service-announcement':''}`}><span className="announcement-dot" /> {services?'Conectamos pessoas, talento e empresas':'A praça digital de Angola'} <span className="announcement-separator">·</span> {services?'Por uma Angola que faz mais.':'Descobre o que está perto de ti'}</div>
    <header className={`site-header ${services?'service-header':''}`}>
      <Link className="brand" href="/" aria-label="Praça Angola, início"><span className="brand-mark">p<span>.</span></span><span>praça<span className="brand-angola">angola</span></span></Link>
      <SiteNav services={services}/>
      <form className="header-market-search" action={services?'/servicos':'/produtos'}><label className="sr-only" htmlFor="header-search">Pesquisa rápida</label><input id="header-search" name="q" placeholder={services?'Que serviço procuras?':'Pesquisar produtos, lojas ou serviços…'} maxLength={140}/><button aria-label="Pesquisar" type="submit">⌕</button></form>
      <div className="header-actions"><Link className="header-messages" href={services?'/servicos/pedidos':'/conta/mensagens'}>Mensagens</Link><HeaderAuth/><Link className="sell-button" href={services?'/servicos/pedidos/novo':'/vendedor'}>{services?'Publicar pedido':'Vender'} <span aria-hidden="true">＋</span></Link>{!services&&<CartLink/>}</div>
    </header>
  </>;
}

export function SiteFooter() {
 return <footer className="site-footer-v2"><div className="footer-v2-grid"><div><Link className="brand" href="/"><span className="brand-mark">p<span>.</span></span><span>praça<span className="brand-angola">angola</span></span></Link><p>Uma praça, muitas histórias.<br/>Produtos, talento e negócios de Angola.</p></div><nav aria-label="Explorar"><b>Explorar</b><Link href="/produtos">Produtos</Link><Link href="/lojas">Lojas</Link><Link href="/servicos">Profissionais</Link><Link href="/marketplaces">Todos os mercados</Link></nav><nav aria-label="Vender e trabalhar"><b>Crescer na Praça</b><Link href="/vendedor">Criar loja</Link><Link href="/vendedor/anuncios/novo">Vender produto</Link><Link href="/profissional">Criar perfil profissional</Link><Link href="/servicos/pedidos">Pedidos de serviços</Link></nav><nav aria-label="Apoio"><b>Ajuda</b><Link href="/ajuda">Centro de ajuda</Link><Link href="/privacidade">Privacidade</Link><Link href="/conta">A minha conta</Link><Link href="/conta/mensagens">Mensagens</Link></nav></div><div className="footer-v2-bottom"><span>© 2026 Praça Angola. Todos os direitos reservados.</span><span>Feito para conectar Angola.</span></div></footer>;
}