import Link from "next/link";
import { OrderDetail } from "../../../../components/order-detail";
import { WorkspacePage } from "../../../../components/workspace-page";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspacePage area="account"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/conta/encomendas">Encomendas</Link><span>/</span><span>Detalhe</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Acompanhar pedido</p><h1>A tua encomenda</h1></div></div><OrderDetail id={id}/></WorkspacePage>;
}
