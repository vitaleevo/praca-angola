import { CartView } from "../../components/cart-view";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export default function CartPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><span>Carrinho</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> A tua seleção</p><h1>Carrinho</h1><p>Confirma os produtos antes de criar a encomenda.</p></div></div><CartView/></div><SiteFooter/></main>;
}
