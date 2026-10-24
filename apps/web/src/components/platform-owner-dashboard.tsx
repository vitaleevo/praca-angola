"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Overview = {
  generatedAt: string;
  metrics: Record<string, string>;
};

const cards: [string, string][] = [
  ["usersActive", "Contas ativas"],
  ["storesActive", "Lojas ativas"],
  ["productsPublished", "Produtos publicados"],
  ["productsAwaitingReview", "Produtos por rever"],
  ["professionalsPublished", "Profissionais publicados"],
  ["professionalsAwaitingReview", "Perfis por rever"],
  ["ordersOpen", "Encomendas em curso"],
  ["reportsOpen", "Denúncias de produtos abertas"],
  ["serviceReportsOpen", "Denúncias de serviços abertas"],
  ["adsLive", "Anúncios ativos"],
  ["notificationsFailed", "Notificações falhadas"],
];

export function PlatformOwnerDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/platform-owner/overview", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/entrar?next=%2Fadmin");
          return null;
        }
        if (response.status === 403) throw new Error("Acesso reservado ao proprietário global da PUVO.");
        if (!response.ok) throw new Error("Não foi possível carregar o estado da plataforma.");
        return response.json() as Promise<Overview>;
      })
      .then((data) => { if (active && data) setOverview(data); })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Ocorreu um erro ao carregar o painel.");
      });
    return () => { active = false; };
  }, [router]);

  if (error) return <div className="platform-owner-error" role="alert"><strong>Não foi possível abrir o painel.</strong><span>{error}</span></div>;
  if (!overview) return <p className="platform-owner-loading" role="status">A carregar os indicadores da plataforma…</p>;

  return (
    <div className="platform-owner-dashboard">
      <section aria-labelledby="platform-metrics-heading">
        <div className="section-heading platform-owner-section-heading">
          <div><h2 id="platform-metrics-heading">Estado geral</h2><p>Indicadores operacionais atualizados ao abrir este painel.</p></div>
          <time dateTime={overview.generatedAt}>Atualizado {new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.generatedAt))}</time>
        </div>
        <div className="platform-owner-metrics">
          {cards.map(([key, label]) => (
            <article className="platform-owner-metric panel" key={key}>
              <span>{label}</span>
              <strong>{new Intl.NumberFormat("pt-AO").format(Number(overview.metrics[key] ?? 0))}</strong>
            </article>
          ))}
        </div>
      </section>

    </div>
  );
}
