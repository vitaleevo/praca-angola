import { AdminWorkspace } from "../../components/admin-workspace";
import { ServiceReportModeration } from "../../components/service-report-moderation";
import Link from "next/link";

const moderationRoles = ["platform_owner", "administrator", "moderator"];

export default function ServiceReportsPage() {
  return <AdminWorkspace roles={moderationRoles}><><div className="breadcrumbs"><Link href="/">Visão geral</Link><span>/</span><span>Denúncias de serviços</span></div><ServiceReportModeration /></></AdminWorkspace>;
}
