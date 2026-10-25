import { AdminWorkspace } from "../../components/admin-workspace";
import { AdManager } from "../../components/ad-manager";
import Link from "next/link";

const administratorRoles = ["platform_owner", "administrator"];

export default function AdvertisingPage() {
  return <AdminWorkspace roles={administratorRoles}><><div className="breadcrumbs"><Link href="/">Visão geral</Link><span>/</span><span>Publicidade</span></div><AdManager /></></AdminWorkspace>;
}
