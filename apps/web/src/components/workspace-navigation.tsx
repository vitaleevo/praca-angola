"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceArea = "account" | "seller" | "services" | "admin";

type NavigationItem = { href: string; label: string };
type NavigationGroup = { label: string; items: NavigationItem[] };

const sharedAreas: NavigationGroup = {
  label: "As tuas áreas",
  items: [
    { href: "/conta", label: "A minha conta" },
    { href: "/vendedor", label: "A minha loja" },
    { href: "/profissional", label: "Perfil profissional" },
    { href: "/servicos/pedidos", label: "Serviços e propostas" },
    { href: "/estafeta", label: "Painel do Estafeta" },
  ],
};

const navigation: Record<WorkspaceArea, { title: string; groups: NavigationGroup[] }> = {
  account: {
    title: "Área pessoal",
    groups: [
      { label: "Conta", items: [
        { href: "/conta", label: "Visão geral" },
        { href: "/conta/encomendas", label: "Encomendas" },
        { href: "/conta/mensagens", label: "Mensagens" },
        { href: "/conta/favoritos", label: "Favoritos" },
      ] },
      sharedAreas,
    ],
  },
  seller: {
    title: "Área de vendedor",
    groups: [
      { label: "Loja", items: [
        { href: "/vendedor", label: "Montra e definições" },
        { href: "/vendedor/anuncios/novo", label: "Publicar produto" },
        { href: "/conta/encomendas", label: "Encomendas" },
        { href: "/conta/mensagens", label: "Mensagens" },
      ] },
      { label: "CRM & Vendas", items: [
        { href: "/vendedor/crm", label: "Funil de Vendas (Kanban)" },
        { href: "/vendedor/crm/conversas", label: "Live Inbox Omnichannel" },
        { href: "/vendedor/crm/contactos", label: "Base de Leads" },
        { href: "/vendedor/crm/automacoes", label: "⚡ Automações" },
        { href: "/vendedor/crm/analytics", label: "📊 Analytics & IA" },
        { href: "/vendedor/crm/ia", label: "Configurar IA & Conhecimento" },
      ] },
      sharedAreas,
    ],
  },
  services: {
    title: "Área de serviços",
    groups: [
      { label: "Serviços", items: [
        { href: "/servicos/pedidos", label: "Pedidos e trabalhos" },
        { href: "/servicos/pedidos/novo", label: "Publicar pedido" },
        { href: "/servicos/notificacoes", label: "Notificações" },
        { href: "/profissional", label: "Perfil profissional" },
      ] },
      sharedAreas,
    ],
  },
  admin: {
    title: "Administração",
    groups: [
      { label: "Plataforma", items: [
        { href: "/admin", label: "Painel global" },
        { href: "/admin/moderacao", label: "Moderação de produtos" },
        { href: "/admin/profissionais", label: "Profissionais" },
        { href: "/admin/denuncias-servicos", label: "Denúncias de serviços" },
        { href: "/admin/publicidade", label: "Publicidade" },
      ] },
      sharedAreas,
    ],
  },
};

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.href === "/conta" || item.href === "/admin") return pathname === item.href;
  if (item.href === "/vendedor") {
    return pathname === item.href || (pathname.startsWith("/vendedor/anuncios/") && pathname !== "/vendedor/anuncios/novo");
  }
  if (item.href === "/servicos/pedidos") {
    return pathname === item.href || (pathname.startsWith("/servicos/pedidos/") && pathname !== "/servicos/pedidos/novo");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function WorkspaceNavigation({ area }: { area: WorkspaceArea }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const config = navigation[area];
  const ownAreaLinks = area === "services" ? ["/profissional", "/servicos/pedidos"] : [`/${area === "account" ? "conta" : area === "seller" ? "vendedor" : "admin"}`];
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-heading"><span className="workspace-sidebar-mark" aria-hidden="true">P</span><div><small>PUVO</small><strong>{config.title}</strong></div></div>
      <button className="workspace-menu-toggle" type="button" aria-controls="workspace-nav-list" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? "Fechar navegação" : "Abrir navegação"}<span aria-hidden="true">{mobileOpen ? "−" : "+"}</span></button>
      <nav id="workspace-nav-list" className={mobileOpen ? "workspace-nav-list open" : "workspace-nav-list"} aria-label={`Navegação da ${config.title.toLowerCase()}`}>
        {config.groups.map((group) => (
          <div className="workspace-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.filter((item) => group.label !== "As tuas áreas" || !ownAreaLinks.includes(item.href)).map((item) => {
              const active = group.label !== "As tuas áreas" && isActive(pathname, item);
              return <Link href={item.href} key={item.href} className={active ? "workspace-nav-link active" : "workspace-nav-link"} aria-current={active ? "page" : undefined}>{item.label}</Link>;
            })}
          </div>
        ))}
      </nav>
      <Link className="workspace-sidebar-help" href="/ajuda">Centro de ajuda <span aria-hidden="true">↗</span></Link>
    </aside>
  );
}
