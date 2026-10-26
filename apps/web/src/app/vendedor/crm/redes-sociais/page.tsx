import Link from "next/link";
import { WorkspacePage } from "@/components/workspace-page";
import { CrmSocial } from "@/components/crm-social";

export const metadata = { title: "Redes sociais · PUVO" };

export default function SocialPage() {
  return <WorkspacePage area="seller">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor/crm">CRM</Link><span>/</span><span>Redes sociais</span></div>
    <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Atendimento e conteúdo</p><h1>Redes sociais</h1><p>Consulta as publicações e responde aos comentários das Páginas ligadas à tua loja.</p></div></div>
    <CrmSocial />
  </WorkspacePage>;
}
