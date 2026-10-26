import CrmAiAnalytics from "@/components/crm-ai-analytics";
import Link from "next/link";
import { WorkspacePage } from "@/components/workspace-page";

export const metadata = {
  title: "Analytics & IA Insights · CRM",
  description: "Métricas consolidadas de vendas, performance de conversão do chatbot e proteção de guardrails por IA.",
};

export default function CrmAnalyticsPage() {
  return <WorkspacePage area="seller">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor">Área de vendedor</Link><span>/</span><Link href="/vendedor/crm">CRM</Link><span>/</span><span>Analytics</span></div>
    <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Inteligência comercial</p><h1>Analytics do CRM</h1><p>Acompanha o funil, os contactos e o atendimento da tua loja.</p></div></div>
    <CrmAiAnalytics />
  </WorkspacePage>;
}
