import Link from "next/link";
import { WorkspacePage } from "../../../components/workspace-page";
import { CrmKanban } from "../../../components/crm-kanban";

export default function CrmKanbanPage() {
  return (
    <WorkspacePage area="seller" crm>
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href="/vendedor">Área de vendedor</Link>
        <span>/</span>
        <span>CRM & Funil de Vendas</span>
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" /> Gestão Comercial Integrada
          </p>
          <h1>CRM e Funil de Vendas</h1>
          <p>Acompanha os teus leads do Facebook, Instagram e WhatsApp em tempo real.</p>
        </div>
      </div>

      <CrmKanban />
    </WorkspacePage>
  );
}
