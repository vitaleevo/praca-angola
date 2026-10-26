import { SiteFooter, SiteHeader } from "./site-header";
import { WorkspaceArea, WorkspaceNavigation } from "./workspace-navigation";

type Props = {
  area: WorkspaceArea;
  children: React.ReactNode;
  services?: boolean;
  crm?: boolean;
  className?: string;
};

export function WorkspacePage({ area, children, services = false, crm = false, className = "" }: Props) {
  return (
    <main className={`${services ? "market-shell services-shell" : ""} ${crm ? "crm-workspace" : ""} ${className}`}>
      <SiteHeader services={services} workspace />
      <div className="workspace-layout">
        <WorkspaceNavigation area={area} />
        <div className={`workspace-content page-wrap ${services ? "service-workspace" : ""}`}>{children}</div>
      </div>
      <SiteFooter />
    </main>
  );
}
