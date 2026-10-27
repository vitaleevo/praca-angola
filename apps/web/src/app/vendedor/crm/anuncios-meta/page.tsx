import Link from "next/link";
import { WorkspacePage } from "@/components/workspace-page";
import { CrmMetaAds } from "@/components/crm-meta-ads";

export const metadata = { title: "Anúncios Meta · PUVO" };

export default function MetaAdsPage() {
  return <WorkspacePage area="seller" crm>
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor/crm">CRM</Link><span>/</span><span>Anúncios Meta</span></div>
    <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Crescimento da loja</p><h1>Anúncios Meta</h1><p>Prepara campanhas e acompanha os resultados associados à tua loja.</p></div></div>
    <CrmMetaAds />
  </WorkspacePage>;
}
