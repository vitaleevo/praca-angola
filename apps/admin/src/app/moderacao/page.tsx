import { AdminWorkspace } from "../../components/admin-workspace";
import { ModerationDashboard } from "../../components/moderation-dashboard";
import Link from "next/link";

const moderationRoles = ["platform_owner", "administrator", "moderator"];

export default function ProductModerationPage() {
  return <AdminWorkspace roles={moderationRoles}><><div className="breadcrumbs"><Link href="/">Visão geral</Link><span>/</span><span>Produtos</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Operação da PUVO</p><h1>Produtos e denúncias</h1><p>Rever anúncios e relatos da comunidade.</p></div></div><ModerationDashboard /></></AdminWorkspace>;
}
