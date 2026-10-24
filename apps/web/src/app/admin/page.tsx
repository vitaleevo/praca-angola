import Link from "next/link";
import { WorkspacePage } from "../../components/workspace-page";
import { PlatformOwnerDashboard } from "../../components/platform-owner-dashboard";

export default function PlatformOwnerPage() {
  return <WorkspacePage area="admin" className="platform-owner-page">
      <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Painel global</span></div>
      <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Administração da PUVO</p><h1>Painel global</h1><p>Visão operacional e acesso às áreas administrativas da plataforma.</p></div></div>
      <PlatformOwnerDashboard />
  </WorkspacePage>;
}
