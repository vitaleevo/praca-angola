import Link from "next/link";
import { ListingForm } from "../../../../components/seller-dashboard";
import { SiteFooter, SiteHeader } from "../../../../components/site-header";

export default function NewListingPage() {
  return <main><SiteHeader/><div className="page-wrap narrow-page"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor">Área de vendedor</Link><span>/</span><span>Novo produto</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Publica na PUVO</p><h1>Novo produto</h1><p>Preenche os detalhes. O anúncio fica público depois da revisão.</p></div></div><div className="panel"><ListingForm/></div></div><SiteFooter/></main>;
}
