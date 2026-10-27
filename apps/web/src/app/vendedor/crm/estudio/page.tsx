import Link from "next/link";
import { WorkspacePage } from "@/components/workspace-page";
import { CrmSocialStudio } from "@/components/crm-social-studio";

export const metadata = { title: "Estúdio de publicações · PUVO" };

export default function SocialStudioPage() {
  return <WorkspacePage area="seller" crm>
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor/crm">CRM</Link><span>/</span><span>Estúdio</span></div>
    <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Conteúdo da loja</p><h1>Estúdio de publicações</h1><p>Prepara, pré-visualiza e agenda conteúdo para Facebook e Instagram.</p></div></div>
    <CrmSocialStudio />
  </WorkspacePage>;
}
