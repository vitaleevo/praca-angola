import { ModerationDashboard } from "../../../components/moderation-dashboard";
import { WorkspacePage } from "../../../components/workspace-page";
import Link from 'next/link';

export default function ModerationPage() {
  return <WorkspacePage area="admin"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Moderação</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Operação da PUVO</p><h1>Moderação</h1><p>Publica anúncios aprovados e encaminha denúncias.</p></div></div><ModerationDashboard/></WorkspacePage>;
}
