import Link from "next/link";
import { WorkspacePage } from "../../../../components/workspace-page";
import { CrmAiConfig } from "../../../../components/crm-ai-config";

export default function CrmAiConfigPage() {
  return (
    <WorkspacePage area="seller">
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href="/vendedor">Área de vendedor</Link>
        <span>/</span>
        <Link href="/vendedor/crm">CRM</Link>
        <span>/</span>
        <span>Configurar IA & Conhecimento</span>
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" /> Inteligência Comercial Soberana
          </p>
          <h1>Configuração da Tua IA & Base de Conhecimento</h1>
          <p>
            Escolhe o teu modelo de inteligência artificial favorito (Gemini, OpenAI, Claude, OpenRouter ou Personalizado) e alimenta a IA com as regras da tua loja.
          </p>
        </div>
      </div>

      <CrmAiConfig />
    </WorkspacePage>
  );
}
