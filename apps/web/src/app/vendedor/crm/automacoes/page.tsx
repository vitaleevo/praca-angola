import CrmAutomations from "@/components/crm-automations";
import Link from "next/link";
import { WorkspacePage } from "@/components/workspace-page";

export const metadata = {
  title: "Automações CRM · PUVO",
  description: "Motor de automações do CRM — respostas automáticas, atribuição de leads e triggers inteligentes.",
};

export default function AutomacoesPage() {
  return <WorkspacePage area="seller">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor">Área de vendedor</Link><span>/</span><Link href="/vendedor/crm">CRM</Link><span>/</span><span>Automações</span></div>
    <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Operações da loja</p><h1>Automações</h1><p>Cria regras para responder e acompanhar os contactos da tua loja.</p></div></div>
    <CrmAutomations />
  </WorkspacePage>;
}
