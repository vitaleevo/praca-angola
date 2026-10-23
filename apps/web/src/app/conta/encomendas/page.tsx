import Link from "next/link";
import { AccountList } from "../../../components/account-view";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

export default function OrdersPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Encomendas</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Compras e vendas</p><h1>Encomendas</h1><p>Acompanha pagamentos, preparação, entregas e reembolsos.</p></div></div><AccountList kind="orders"/></div><SiteFooter/></main>;
}
