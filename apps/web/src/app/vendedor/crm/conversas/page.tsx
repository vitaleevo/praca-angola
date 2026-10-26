import Link from "next/link";
import { WorkspacePage } from "../../../../components/workspace-page";
import { CrmLiveInbox } from "../../../../components/crm-live-inbox";

export default function CrmConversationsPage() {
  return (
    <WorkspacePage area="seller" crm>
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href="/vendedor">Área de vendedor</Link>
        <span>/</span>
        <Link href="/vendedor/crm">CRM</Link>
        <span>/</span>
        <span>Live Inbox</span>
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" /> Atendimento Omnichannel
          </p>
          <h1>Live Inbox Multicanal</h1>
          <p>Responde a mensagens do WhatsApp, Instagram Direct e Montra sem sair da plataforma.</p>
        </div>
      </div>

      <CrmLiveInbox />
    </WorkspacePage>
  );
}
