import Link from "next/link";
import { AccountList } from "../../../components/account-view";
import { WorkspacePage } from "../../../components/workspace-page";

export default function OrdersPage() {
  return <WorkspacePage area="account"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Encomendas</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Compras e vendas</p><h1>Encomendas</h1><p>Acompanha pagamentos, preparação, entregas e reembolsos.</p></div></div><AccountList kind="orders"/></WorkspacePage>;
}
