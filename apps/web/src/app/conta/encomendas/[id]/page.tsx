import { OrderDetail } from "../../../../components/order-detail";
import { SiteFooter, SiteHeader } from "../../../../components/site-header";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/conta/encomendas">Encomendas</a><span>/</span><span>Detalhe</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Acompanhar pedido</p><h1>A tua encomenda</h1></div></div><OrderDetail id={id}/></div><SiteFooter/></main>;
}
