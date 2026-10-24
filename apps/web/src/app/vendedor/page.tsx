import Link from "next/link";
import { SellerDashboard } from "../../components/seller-dashboard";
import { WorkspacePage } from "../../components/workspace-page";

export default function SellerPage() {
  return <WorkspacePage area="seller"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Área de vendedor</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> A tua loja</p><h1>Área de vendedor</h1><p>Gere a montra, os produtos e as encomendas recebidas.</p></div></div><SellerDashboard/></WorkspacePage>;
}
