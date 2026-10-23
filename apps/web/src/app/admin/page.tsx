import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-header";
import { PlatformOwnerDashboard } from "../../components/platform-owner-dashboard";

export default function PlatformOwnerPage() {
  return <main>
    <SiteHeader />
    <div className="page-wrap platform-owner-page">
      <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Painel global</span></div>
      <div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Administração da PUVO</p><h1>Painel global</h1><p>Visão operacional e acesso às áreas administrativas da plataforma.</p></div></div>
      <PlatformOwnerDashboard />
    </div>
    <SiteFooter />
  </main>;
}
