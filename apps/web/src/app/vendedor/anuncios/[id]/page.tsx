import Link from "next/link";
import { EditListingForm } from "../../../../components/seller-dashboard";
import { WorkspacePage } from "../../../../components/workspace-page";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspacePage area="seller"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor">Área de vendedor</Link><span>/</span><span>Editar anúncio</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Edita o teu anúncio</p><h1>Editar anúncio</h1><p>As alterações voltam para revisão antes de serem publicadas.</p></div></div><div className="panel"><EditListingForm listingId={id}/></div></WorkspacePage>;
}
