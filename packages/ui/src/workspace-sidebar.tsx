"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceNavigationItem = { href: string; label: string; isActive?: (pathname: string) => boolean };
export type WorkspaceNavigationGroup = { label: string; items: WorkspaceNavigationItem[] };

type Props = {
  title: string;
  groups: WorkspaceNavigationGroup[];
  helpHref?: string;
  helpLabel?: string;
};

function isActive(pathname: string, item: WorkspaceNavigationItem): boolean {
  if (item.isActive) return item.isActive(pathname);
  const { href } = item;
  if (href === "/conta" || href === "/admin" || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceSidebar({ title, groups, helpHref, helpLabel = "Centro de ajuda" }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-heading">
        <Image className="workspace-sidebar-mark" src="/brand/puvo-mark-192.png" alt="" width={36} height={36} />
        <div><small>P.U.V.O.</small><strong>{title}</strong></div>
      </div>
      <button className="workspace-menu-toggle" type="button" aria-controls="workspace-nav-list" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>
        {mobileOpen ? "Fechar navegação" : "Abrir navegação"}<span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </button>
      <nav id="workspace-nav-list" className={mobileOpen ? "workspace-nav-list open" : "workspace-nav-list"} aria-label={`Navegação da ${title.toLowerCase()}`}>
        {groups.map((group) => (
          <div className="workspace-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return <Link href={item.href} key={item.href} className={active ? "workspace-nav-link active" : "workspace-nav-link"} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
            })}
          </div>
        ))}
      </nav>
      {helpHref && <Link className="workspace-sidebar-help" href={helpHref}>{helpLabel}<span aria-hidden="true">↗</span></Link>}
    </aside>
  );
}
