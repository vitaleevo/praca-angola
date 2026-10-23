import { EditListingForm } from "../../../../components/seller-dashboard";
import { SiteFooter, SiteHeader } from "../../../../components/site-header";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><SiteHeader/><div className="page-wrap narrow-page"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/vendedor">Área de vendedor</a><span>/</span><span>Editar produto</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Edita o teu anúncio</p><h1>Editar produto</h1><p>As alterações voltam para revisão antes de serem publicadas.</p></div></div><div className="panel"><EditListingForm listingId={id}/></div></div><SiteFooter/></main>;
}
