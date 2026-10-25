"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceSidebar, type WorkspaceNavigationGroup } from "@puvo/ui/workspace-sidebar";

export type AdminUser = { id: string; displayName?: string; roles: string[] };
type Props = { children: ReactNode; roles: string[] };
const AdminUserContext = createContext<AdminUser | null>(null);

export function useAdminUser(): AdminUser | null {
  return useContext(AdminUserContext);
}

const groups: WorkspaceNavigationGroup[] = [
  { label: "Operação", items: [
    { href: "/", label: "Visão geral" },
    { href: "/moderacao", label: "Produtos e denúncias" },
    { href: "/profissionais", label: "Profissionais" },
    { href: "/denuncias-servicos", label: "Denúncias de serviços" },
    { href: "/publicidade", label: "Publicidade" },
  ] },
];

function visibleNavigation(account: AdminUser): WorkspaceNavigationGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.href !== "/publicidade" || account.roles.some((role) => ["platform_owner", "administrator"].includes(role))),
  }));
}

function staffRoleLabel(account: AdminUser): string {
  if (account.roles.includes("platform_owner")) return "Proprietário da plataforma";
  if (account.roles.includes("administrator")) return "Administrador";
  if (account.roles.includes("moderator")) return "Moderador";
  return "Equipa PUVO";
}

export function AdminWorkspace({ children, roles }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { user?: AdminUser | null };
        if (response.status === 401 || !data.user) {
          router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
          return null;
        }
        if (!response.ok) throw new Error("Não foi possível verificar a sessão.");
        return data.user;
      })
      .then((account) => {
        if (!active || !account) return;
        if (!roles.some((role) => account.roles.includes(role))) {
          setError("Esta área está reservada à equipa de operação da PUVO.");
          return;
        }
        setUser(account);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível verificar a sessão."); });
    return () => { active = false; };
  }, [pathname, roles, router]);

  if (error) return <main className="admin-access-error"><h1>Acesso indisponível</h1><p role="alert">{error}</p><Link className="button button-primary" href="/entrar">Entrar com outra conta</Link></main>;
  if (!user) return <p className="admin-loading" role="status">A verificar o acesso…</p>;

  return (
    <main className="admin-console">
      <header className="admin-topbar">
        <Link href="/" className="admin-brand" aria-label="PUVO gestão — início"><span className="brand-mark">P</span><span><strong>PUVO</strong><small>Gestão da plataforma</small></span></Link>
        <div className="admin-account"><span>{user.displayName ?? "Equipa PUVO"}<small>{staffRoleLabel(user)}</small></span><button type="button" onClick={() => { void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).finally(() => router.replace("/entrar")); }}>Terminar sessão</button></div>
      </header>
      <div className="workspace-layout admin-workspace-layout">
        <WorkspaceSidebar title="Gestão da plataforma" groups={visibleNavigation(user)} helpHref="https://puvo.vitaleevo.ao/ajuda" />
        <div className="workspace-content page-wrap admin-workspace-content"><AdminUserContext.Provider value={user}>{children}</AdminUserContext.Provider></div>
      </div>
    </main>
  );
}
