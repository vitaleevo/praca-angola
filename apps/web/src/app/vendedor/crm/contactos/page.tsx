import Link from "next/link";
import { WorkspacePage } from "../../../../components/workspace-page";
import { CrmContactsView } from "../../../../components/crm-contacts";

export default function CrmContactsPage() {
  return (
    <WorkspacePage area="seller">
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href="/vendedor">Área de vendedor</Link>
        <span>/</span>
        <Link href="/vendedor/crm">CRM</Link>
        <span>/</span>
        <span>Contactos & Leads</span>
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" /> Gestão de Leads
          </p>
          <h1>Contactos e Oportunidades</h1>
          <p>Consulta e pesquisa todos os clientes captados pelos teus canais integrados.</p>
        </div>
      </div>

      <CrmContactsView />
    </WorkspacePage>
  );
}
