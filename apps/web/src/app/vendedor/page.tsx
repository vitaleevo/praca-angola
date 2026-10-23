import Link from "next/link";
import { SellerDashboard } from "../../components/seller-dashboard";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export default function SellerPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Área de vendedor</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> A tua loja</p><h1>Área de vendedor</h1><p>Gere a montra, os produtos e as encomendas recebidas.</p></div></div><SellerDashboard/></div><SiteFooter/></main>;
}
