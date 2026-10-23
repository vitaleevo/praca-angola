import { ModerationDashboard } from "../../../components/moderation-dashboard";
import { SiteFooter, SiteHeader } from "../../../components/site-header";
import Link from 'next/link';

export default function ModerationPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Moderação</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Operação da praça</p><h1>Moderação</h1><p>Publica anúncios aprovados e encaminha denúncias.</p></div><div className="button-row"><Link className="button button-secondary" href="/admin/profissionais">Moderar profissionais →</Link><Link className="button button-secondary" href="/admin/denuncias-servicos">Denúncias de serviços →</Link><Link className="button button-secondary" href="/admin/publicidade">Gerir publicidade →</Link></div></div><ModerationDashboard/></div><SiteFooter/></main>;
}
