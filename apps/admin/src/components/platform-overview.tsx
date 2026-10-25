"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminUser } from "./admin-workspace";

type Overview = { generatedAt: string; metrics: Record<string, string> };
type Metric = { key: string; label: string; href?: string; action?: string; attention?: boolean };

const groups: { title: string; description: string; metrics: Metric[] }[] = [
  {
    title: "Marketplaces",
    description: "Atividade e dimensão da plataforma.",
    metrics: [
      { key: "usersActive", label: "Contas ativas" },
      { key: "storesActive", label: "Lojas ativas" },
      { key: "productsPublished", label: "Produtos publicados" },
      { key: "professionalsPublished", label: "Profissionais publicados" },
      { key: "ordersOpen", label: "Encomendas em curso" },
      { key: "adsLive", label: "Campanhas ativas", href: "/publicidade", action: "Gerir campanhas" },
    ],
  },
  {
    title: "Revisão e confiança",
    description: "Itens que precisam de atenção da equipa.",
    metrics: [
      { key: "productsAwaitingReview", label: "Produtos por rever", href: "/moderacao", action: "Abrir moderação", attention: true },
      { key: "reportsOpen", label: "Denúncias de produtos", href: "/moderacao", action: "Ver denúncias", attention: true },
      { key: "professionalsAwaitingReview", label: "Perfis por rever", href: "/profissionais", action: "Rever perfis", attention: true },
      { key: "serviceReportsOpen", label: "Denúncias de serviços", href: "/denuncias-servicos", action: "Analisar relatos", attention: true },
      { key: "notificationsFailed", label: "Notificações falhadas", attention: true },
    ],
  },
];

function roleLabel(roles: string[]): string {
  if (roles.includes("platform_owner")) return "Proprietário da plataforma";
  if (roles.includes("administrator")) return "Administrador";
  if (roles.includes("moderator")) return "Moderador";
  return "Equipa PUVO";
}

function MetricCard({ metric, value }: { metric: Metric; value: string }) {
  const content = <>
    <span className="owner-metric-label">{metric.label}</span>
    <strong className="owner-metric-value">{value}</strong>
    {metric.href && <span className="owner-metric-action">{metric.action}<span aria-hidden="true"> →</span></span>}
  </>;
  const isAttention = metric.attention && Number(value) > 0;
  const className = `owner-metric-card${isAttention ? " has-attention" : ""}${metric.href ? " is-link" : ""}`;
  return metric.href
    ? <Link className={className} href={metric.href}>{content}</Link>
    : <article className={className}>{content}</article>;
}

export function PlatformOverview() {
  const user = useAdminUser();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const isOwner = Boolean(user?.roles.includes("platform_owner"));

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    fetch("/api/v1/platform-owner/overview", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os indicadores da plataforma.");
        return response.json() as Promise<Overview>;
      })
      .then((data) => { if (active) setOverview(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar o painel."); });
    return () => { active = false; };
  }, [isOwner]);

  if (!user) return null;

  const formattedDate = overview?.generatedAt
    ? new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.generatedAt))
    : null;

  return <div className="admin-dashboard owner-dashboard">
    <section className="owner-hero" aria-labelledby="owner-dashboard-title">
      <div className="owner-hero-copy">
        <p className="owner-hero-eyebrow"><span aria-hidden="true" /> Centro de controlo PUVO</p>
        <h1 id="owner-dashboard-title">Gestão dos marketplaces</h1>
        <p>Acompanha a operação, revê conteúdo e mantém a comunidade segura.</p>
        <span className="owner-role-badge">{roleLabel(user.roles)}</span>
      </div>
      <div className="owner-hero-action">
        <span className="owner-hero-action-label">Ação rápida</span>
        <strong>Rever anúncios recentes</strong>
        <span>Analisa os produtos submetidos à equipa.</span>
        <Link className="owner-hero-button" href="/moderacao">Abrir fila de revisão <span aria-hidden="true">→</span></Link>
      </div>
    </section>

    {isOwner && <section className="owner-overview-section" aria-labelledby="overview-title">
      <div className="owner-section-heading">
        <div><span className="owner-section-kicker">Resumo da plataforma</span><h2 id="overview-title">Estado da operação</h2><p>Indicadores para acompanhar o funcionamento dos marketplaces.</p></div>
        {formattedDate && <time dateTime={overview?.generatedAt}>Atualizado {formattedDate}</time>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!overview && !error && <div className="owner-loading" role="status"><span className="owner-loading-dot" /> A carregar os indicadores da plataforma…</div>}
      {overview && <div className="owner-metric-groups">{groups.map((group) => <section className="owner-metric-group" key={group.title} aria-label={group.title}>
        <div className="owner-group-heading"><h3>{group.title}</h3><p>{group.description}</p></div>
        <div className="owner-metric-grid">{group.metrics.map((metric) => <MetricCard key={metric.key} metric={metric} value={new Intl.NumberFormat("pt-AO").format(Number(overview.metrics[metric.key] ?? 0))} />)}</div>
      </section>)}</div>}
    </section>}

    <section className="owner-areas-section" aria-labelledby="work-areas-title">
      <div className="owner-section-heading"><div><span className="owner-section-kicker">Navegação de equipa</span><h2 id="work-areas-title">Áreas de operação</h2><p>Abre uma área para rever conteúdo e gerir a atividade da plataforma.</p></div></div>
      <div className="admin-area-grid">
        <Link className="admin-area-card" href="/moderacao"><span className="owner-area-index">01</span><strong>Produtos e denúncias</strong><span>Rever anúncios e relatos da comunidade.</span><span className="owner-area-arrow" aria-hidden="true">↗</span></Link>
        <Link className="admin-area-card" href="/profissionais"><span className="owner-area-index">02</span><strong>Profissionais</strong><span>Rever perfis e verificar identidade separadamente.</span><span className="owner-area-arrow" aria-hidden="true">↗</span></Link>
        <Link className="admin-area-card" href="/denuncias-servicos"><span className="owner-area-index">03</span><strong>Denúncias de serviços</strong><span>Registar e acompanhar decisões sobre denúncias.</span><span className="owner-area-arrow" aria-hidden="true">↗</span></Link>
        {user.roles.some((role) => ["platform_owner", "administrator"].includes(role)) && <Link className="admin-area-card" href="/publicidade"><span className="owner-area-index">04</span><strong>Publicidade</strong><span>Gerir campanhas dos marketplaces.</span><span className="owner-area-arrow" aria-hidden="true">↗</span></Link>}
      </div>
    </section>
  </div>;
}
