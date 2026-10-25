import { AdminWorkspace } from "../../components/admin-workspace";
import { ProfessionalModeration } from "../../components/professional-moderation";
import Link from "next/link";

const moderationRoles = ["platform_owner", "administrator", "moderator"];

export default function ProfessionalModerationPage() {
  return <AdminWorkspace roles={moderationRoles}><><div className="breadcrumbs"><Link href="/">Visão geral</Link><span>/</span><span>Profissionais</span></div><ProfessionalModeration /></></AdminWorkspace>;
}
