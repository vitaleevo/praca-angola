import { ListingForm } from "../../../../components/seller-dashboard";
import { SiteFooter, SiteHeader } from "../../../../components/site-header";

export default function NewListingPage() {
  return <main><SiteHeader/><div className="page-wrap narrow-page"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/vendedor">Área de vendedor</a><span>/</span><span>Novo produto</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Publica na praça</p><h1>Novo produto</h1><p>Preenche os detalhes. O anúncio fica público depois da revisão.</p></div></div><div className="panel"><ListingForm/></div></div><SiteFooter/></main>;
}
