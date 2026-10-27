"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceArea = "account" | "seller" | "services" | "admin";

type NavigationItem = { href: string; label: string };
type NavigationModule = { id: string; label: string; items: NavigationItem[] };
type NavigationGroup = { id: string; label: string; items: NavigationItem[]; modules?: NavigationModule[] };

const userNavigation: NavigationGroup[] = [
  { id: "account", label: "Conta", items: [
    { href: "/conta", label: "Visão geral" },
    { href: "/conta/encomendas", label: "Encomendas" },
    { href: "/conta/mensagens", label: "Mensagens" },
    { href: "/conta/favoritos", label: "Favoritos" },
  ] },
  { id: "commerce", label: "Loja e vendas", items: [
    { href: "/vendedor", label: "A minha loja" },
    { href: "/vendedor/anuncios/novo", label: "Publicar produto" },
  ], modules: [{ id: "crm", label: "CRM e vendas", items: [
    { href: "/vendedor/crm", label: "Funil de vendas" },
    { href: "/vendedor/crm/conversas", label: "Live Inbox" },
    { href: "/vendedor/crm/redes-sociais", label: "Redes sociais" },
    { href: "/vendedor/crm/estudio", label: "Estúdio de publicações" },
    { href: "/vendedor/crm/anuncios-meta", label: "Anúncios Meta" },
    { href: "/vendedor/crm/contactos", label: "Base de leads" },
    { href: "/vendedor/crm/automacoes", label: "Automações" },
    { href: "/vendedor/crm/analytics", label: "Analytics" },
    { href: "/vendedor/crm/ia", label: "Configurar IA" },
  ] }] },
  { id: "services", label: "Serviços", items: [
    { href: "/profissional", label: "Perfil profissional" },
  ], modules: [{ id: "service-work", label: "Pedidos e propostas", items: [
    { href: "/servicos/pedidos", label: "Os meus pedidos" },
    { href: "/servicos/pedidos/novo", label: "Publicar pedido" },
    { href: "/servicos/notificacoes", label: "Notificações" },
  ] }] },
  { id: "other", label: "Outras áreas", items: [
    { href: "/estafeta", label: "Painel do Estafeta" },
  ] },
];

const navigation: Record<WorkspaceArea, { title: string; groups: NavigationGroup[] }> = {
  account: {
    title: "A minha conta",
    groups: userNavigation,
  },
  seller: {
    title: "A minha conta",
    groups: userNavigation,
  },
  services: {
    title: "A minha conta",
    groups: userNavigation,
  },
  admin: {
    title: "Administração",
    groups: [
      { id: "platform", label: "Plataforma", items: [
        { href: "/admin", label: "Painel global" },
        { href: "/admin/moderacao", label: "Moderação de produtos" },
        { href: "/admin/profissionais", label: "Profissionais" },
        { href: "/admin/denuncias-servicos", label: "Denúncias de serviços" },
        { href: "/admin/publicidade", label: "Publicidade" },
      ] },
      ...userNavigation,
    ],
  },
};

function isActive(pathname: string, item: NavigationItem): boolean {
  if (["/conta", "/admin", "/vendedor/crm", "/servicos/pedidos"].includes(item.href)) return pathname === item.href;
  if (item.href === "/vendedor") {
    return pathname === item.href || (pathname.startsWith("/vendedor/anuncios/") && pathname !== "/vendedor/anuncios/novo");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function WorkspaceNavigation({ area }: { area: WorkspaceArea }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const config = navigation[area];
  const hasActiveItem = (items: NavigationItem[]) => items.some((item) => isActive(pathname, item));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const groupIsOpen = (group: NavigationGroup) => openGroups[group.id] ?? (hasActiveItem(group.items) || Boolean(group.modules?.some((module) => hasActiveItem(module.items))));
  const moduleIsOpen = (module: NavigationModule) => openModules[module.id] ?? hasActiveItem(module.items);

  function toggleGroup(group: NavigationGroup) {
    setOpenGroups((current) => ({ ...current, [group.id]: !groupIsOpen(group) }));
  }

  function toggleModule(module: NavigationModule) {
    setOpenModules((current) => ({ ...current, [module.id]: !moduleIsOpen(module) }));
  }

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-heading"><Image className="workspace-sidebar-mark" src="/brand/puvo-mark-192.png" alt="" width={36} height={36} /><div><small>P.U.V.O.</small><strong>{config.title}</strong></div></div>
      <button className="workspace-menu-toggle" type="button" aria-controls="workspace-nav-list" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? "Fechar navegação" : "Abrir navegação"}<span aria-hidden="true">{mobileOpen ? "−" : "+"}</span></button>
      <nav id="workspace-nav-list" className={mobileOpen ? "workspace-nav-list open" : "workspace-nav-list"} aria-label={`Navegação da ${config.title.toLowerCase()}`}>
        {config.groups.map((group) => (
          <div className="workspace-nav-group" key={group.label}>
            <button type="button" className="workspace-nav-group-toggle" aria-expanded={groupIsOpen(group)} aria-controls={`workspace-group-${group.id}`} onClick={() => toggleGroup(group)}>
              <span>{group.label}</span><span aria-hidden="true">{groupIsOpen(group) ? "−" : "+"}</span>
            </button>
            <div id={`workspace-group-${group.id}`} className={groupIsOpen(group) ? "workspace-nav-group-content open" : "workspace-nav-group-content"}>
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return <Link href={item.href} key={item.href} className={active ? "workspace-nav-link active" : "workspace-nav-link"} aria-current={active ? "page" : undefined}>{item.label}</Link>;
              })}
              {group.modules?.map((module) => <div className="workspace-nav-module" key={module.id}>
                <button type="button" className={hasActiveItem(module.items) ? "workspace-nav-module-toggle active" : "workspace-nav-module-toggle"} aria-expanded={moduleIsOpen(module)} aria-controls={`workspace-module-${module.id}`} onClick={() => toggleModule(module)}>
                  <span>{module.label}</span><span aria-hidden="true">{moduleIsOpen(module) ? "⌄" : "›"}</span>
                </button>
                <div id={`workspace-module-${module.id}`} className={moduleIsOpen(module) ? "workspace-nav-module-content open" : "workspace-nav-module-content"}>
                  {module.items.map((item) => {
                    const active = isActive(pathname, item);
                    return <Link href={item.href} key={item.href} className={active ? "workspace-nav-link workspace-nav-sublink active" : "workspace-nav-link workspace-nav-sublink"} aria-current={active ? "page" : undefined}>{item.label}</Link>;
                  })}
                </div>
              </div>)}
            </div>
          </div>
        ))}
      </nav>
      <Link className="workspace-sidebar-help" href="/ajuda">Centro de ajuda <span aria-hidden="true">↗</span></Link>
    </aside>
  );
}
