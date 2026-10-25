"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";

type Listing = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: string;
  condition: string;
  province: string;
  municipality: string;
  category: string;
  store_name: string;
  images: { url: string; alt: string }[];
};

type Report = {
  id: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  reporter: string;
  listing_id: string;
  listing_slug: string;
  listing_title: string;
  store_name: string;
};

type DashboardData = { listings: Listing[]; reports: Report[] };

function formatMessage(message: unknown, fallback: string): string {
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (messages.length) return messages.join(" ");
  }
  return fallback;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as { message?: unknown };
  return formatMessage(data.message, fallback);
}

export function ModerationDashboard() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const readDashboard = useCallback(async (): Promise<DashboardData | null> => {
    const me = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });
    const meData = await me.json().catch(() => ({})) as { user?: { id: string } | null };
    if (me.status === 401 || (me.ok && !meData.user)) return null;
    if (!me.ok) throw new Error("Não foi possível verificar a tua sessão. Tenta novamente.");

    const [listingResponse, reportResponse] = await Promise.all([
      fetch("/api/v1/admin/listings", { credentials: "include" }),
      fetch("/api/v1/admin/reports", { credentials: "include" }),
    ]);
    const [listingData, reportData] = await Promise.all([
      listingResponse.json().catch(() => ({})) as Promise<{ items?: Listing[]; message?: unknown }>,
      reportResponse.json().catch(() => ({})) as Promise<{ items?: Report[]; message?: unknown }>,
    ]);

    if (!listingResponse.ok || !reportResponse.ok) {
      throw new Error(formatMessage(listingData.message ?? reportData.message, "Acesso de moderação não permitido."));
    }

    return { listings: listingData.items ?? [], reports: reportData.items ?? [] };
  }, []);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const dashboard = await readDashboard();
      if (!dashboard) {
        router.replace("/entrar?next=/moderacao");
        return;
      }
      setListings(dashboard.listings);
      setReports(dashboard.reports);
      setHasLoaded(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor. Tenta novamente.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [readDashboard, router]);

  useEffect(() => {
    let active = true;
    readDashboard()
      .then((dashboard) => {
        if (!active) return;
        if (!dashboard) {
          router.replace("/entrar?next=/moderacao");
          return;
        }
        setListings(dashboard.listings);
        setReports(dashboard.reports);
        setHasLoaded(true);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor. Tenta novamente.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [readDashboard, router]);

  async function review(id: string, action: "approved" | "rejected") {
    const reason = action === "rejected" ? window.prompt("Motivo da rejeição (obrigatório)") : "";
    if (action === "rejected" && !reason?.trim()) return;

    setPendingAction(`${id}:${action}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/admin/listings/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason?.trim() ?? "" }),
      });
      if (!response.ok) {
        setError(await responseError(response, "Não foi possível rever o anúncio."));
        return;
      }
      await load();
      setNotice(action === "approved" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado e removido da fila.");
    } catch {
      setError("Não foi possível confirmar a decisão. Atualiza a lista antes de tentar novamente.");
    } finally {
      setPendingAction(null);
    }
  }

  async function resolve(id: string, status: "investigating" | "resolved" | "dismissed") {
    setPendingAction(`${id}:${status}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/admin/reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError(await responseError(response, "Não foi possível atualizar a denúncia."));
        return;
      }
      await load();
      setNotice({
        investigating: "Denúncia encaminhada para investigação.",
        resolved: "Denúncia resolvida.",
        dismissed: "Denúncia ignorada.",
      }[status]);
    } catch {
      setError("Não foi possível confirmar a decisão. Atualiza a lista antes de tentar novamente.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="moderation-dashboard" aria-busy={isLoading || isRefreshing}>
      {error && (
        <div className="moderation-error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button-secondary" onClick={() => void load()} disabled={isRefreshing}>
            {isRefreshing ? "A atualizar…" : "Atualizar lista"}
          </button>
        </div>
      )}
      {notice && <p className="moderation-notice" role="status">{notice}</p>}

      <section className="panel moderation-panel" aria-labelledby="pending-listings-title">
        <div className="section-heading moderation-section-heading">
          <div>
            <span className="moderation-kicker">Fila de revisão</span>
            <h2 id="pending-listings-title">Anúncios pendentes</h2>
            <p>Confirma que a informação e as imagens seguem as regras da PUVO.</p>
          </div>
          <span className="subtle-chip" aria-live="polite">
            {isLoading ? "A carregar" : `${listings.length} ${listings.length === 1 ? "pendente" : "pendentes"}`}
          </span>
        </div>

        {isLoading ? (
          <div className="moderation-loading" role="status" aria-label="A carregar anúncios pendentes">
            <span className="moderation-loading-image" />
            <span className="moderation-loading-copy"><i /><i /><i /></span>
          </div>
        ) : !hasLoaded ? (
          <div className="moderation-unavailable" role="status">Os anúncios não estão disponíveis neste momento.</div>
        ) : listings.length ? (
          <div className="moderation-list">
            {listings.map((listing) => {
              const location = [listing.condition, listing.province, listing.municipality].filter(Boolean).join(" · ");
              const isApproving = pendingAction === `${listing.id}:approved`;
              const isRejecting = pendingAction === `${listing.id}:rejected`;

              return (
                <article className="moderation-item" key={listing.id}>
                  <div className="moderation-listing-content">
                    {listing.images?.[0] ? (
                      <Image
                        className="moderation-listing-image"
                        src={listing.images[0].url}
                        alt={listing.images[0].alt || listing.title}
                        width={132}
                        height={132}
                        unoptimized
                      />
                    ) : (
                      <div className="moderation-listing-placeholder" aria-hidden="true">P</div>
                    )}
                    <div className="moderation-listing-details">
                      <span className="product-category">
                        <span>{listing.category}</span><span aria-hidden="true">·</span><span>{listing.store_name}</span>
                      </span>
                      <h3>{listing.title}</h3>
                      <p className="moderation-listing-price">{kwanza(listing.price)}</p>
                      <small className="moderation-listing-location">{location || "Localização não indicada"}</small>
                      <details className="moderation-description">
                        <summary>Ver descrição completa</summary>
                        <p>{listing.description || "Este anúncio não tem descrição."}</p>
                      </details>
                    </div>
                  </div>
                  <div className="button-row moderation-actions" role="group" aria-label={`Ações para ${listing.title}`}>
                    <button className="button button-primary" onClick={() => void review(listing.id, "approved")} disabled={pendingAction !== null}>
                      {isApproving ? "A publicar…" : "Aprovar e publicar"}
                    </button>
                    <button className="button button-secondary" onClick={() => void review(listing.id, "rejected")} disabled={pendingAction !== null}>
                      {isRejecting ? "A rejeitar…" : "Rejeitar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state moderation-empty-state">
            <span className="moderation-empty-mark" aria-hidden="true">✓</span>
            <b>Sem anúncios pendentes</b>
            <span>Quando um vendedor publicar um anúncio, a revisão aparecerá aqui.</span>
          </div>
        )}
      </section>

      <section className="panel moderation-panel" aria-labelledby="reports-title">
        <div className="section-heading moderation-section-heading">
          <div>
            <span className="moderation-kicker">Comunidade</span>
            <h2 id="reports-title">Denúncias</h2>
            <p>Revê anúncios reportados pela comunidade.</p>
          </div>
          <span className="subtle-chip" aria-live="polite">
            {isLoading ? "A carregar" : `${reports.length} ${reports.length === 1 ? "aberta" : "abertas"}`}
          </span>
        </div>

        {isLoading ? (
          <div className="moderation-loading moderation-loading-compact" role="status" aria-label="A carregar denúncias">
            <span className="moderation-loading-copy"><i /><i /></span>
          </div>
        ) : !hasLoaded ? (
          <div className="moderation-unavailable" role="status">As denúncias não estão disponíveis neste momento.</div>
        ) : reports.length ? (
          <div className="moderation-list">
            {reports.map((report) => {
              const isInvestigating = pendingAction === `${report.id}:investigating`;
              const isResolving = pendingAction === `${report.id}:resolved`;
              const isDismissing = pendingAction === `${report.id}:dismissed`;
              return (
                <article className="report-item" key={report.id}>
                  <div className="report-details">
                    <span className="moderation-kicker">{report.reason.replaceAll("_", " ")}</span>
                    <b>{report.listing_title}</b>
                    <small>{report.store_name} · reportado por {report.reporter}</small>
                    <p>{report.details || "Sem detalhes adicionais."}</p>
                    <Link href={`https://puvo.vitaleevo.ao/produtos/${report.listing_slug}`} target="_blank" rel="noreferrer">
                      Abrir produto <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                  <div className="button-row report-actions" role="group" aria-label={`Ações para a denúncia de ${report.listing_title}`}>
                    <button className="button button-secondary" onClick={() => void resolve(report.id, "investigating")} disabled={pendingAction !== null}>
                      {isInvestigating ? "A investigar…" : "Investigar"}
                    </button>
                    <button className="button button-primary" onClick={() => void resolve(report.id, "resolved")} disabled={pendingAction !== null}>
                      {isResolving ? "A resolver…" : "Resolver"}
                    </button>
                    <button className="text-button" onClick={() => void resolve(report.id, "dismissed")} disabled={pendingAction !== null}>
                      {isDismissing ? "A ignorar…" : "Ignorar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state moderation-empty-state">
            <span className="moderation-empty-mark" aria-hidden="true">✓</span>
            <b>Sem denúncias abertas</b>
            <span>As denúncias recebidas pela equipa serão apresentadas nesta área.</span>
          </div>
        )}
      </section>
    </div>
  );
}
