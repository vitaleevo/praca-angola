import { AdminWorkspace } from "../components/admin-workspace";
import { PlatformOverview } from "../components/platform-overview";

const staffRoles = ["platform_owner", "administrator", "moderator"];

export default function AdminHomePage() {
  return <AdminWorkspace roles={staffRoles}><PlatformOverview /></AdminWorkspace>;
}
