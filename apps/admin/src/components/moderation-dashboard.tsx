"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";
import { ModerationAiAnalytics } from "./moderation-ai-analytics";

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
  marketplace?: string;
  marketplace_name?: string;
  attributes?: Record<string, unknown>;
  store_name: string;
  images: { url: string; alt: string }[];
  ai_risk_score: number;
  ai_flagged_reasons: string[];
  ai_suggested_action: string | null;
};

const attributeLabels: Record<string, string> = {
  companyType: "Tipo de empresa",
  sector: "Setor",
  coverage: "Cobertura",
  delivery: "Entrega",
  website: "Website",
  transaction: "Transação",
  bedrooms: "Quartos",
  bathrooms: "Casas de banho",
  areaM2: "Área (m²)",
  parking: "Estacionamento",
  furnished: "Mobilado",
  make: "Marca",
  model: "Modelo",
  year: "Ano",
  mileageKm: "Quilometragem (km)",
  fuel: "Combustível",
  transmission: "Caixa",
  color: "Cor",
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

type ModerationAlert = {
  id: string;
  type: string;
  entityId: string;
  title: string;
  riskScore?: number;
  verdict?: string;
  reasons: string[];
  suggestedAction?: string;
  timestamp: string;
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
  const [activeTab, setActiveTab] = useState<"queue" | "analytics">("queue");
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Bulk moderation state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);

  // Real-time live moderation alerts
  const [liveAlert, setLiveAlert] = useState<ModerationAlert | null>(null);

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

  // Real-time Push Alert SSE Stream for moderators
  useEffect(() => {
    if (typeof window === "undefined" || !window.EventSource) return;

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v1/admin/moderation/stream", { withCredentials: true });
      es.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const alert = raw.data || raw;
          if (alert && alert.title) {
            setLiveAlert(alert);
            // Request or display notification
            if ("Notification" in window && Notification.permission === "default") {
              void Notification.requestPermission();
            }
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`🚨 Alerta PUVO Moderação`, {
                body: `${alert.title} [Risco IA: ${alert.riskScore ?? 0}%]`,
              });
            }
          }
        } catch (e) {
          console.error("Erro ao processar stream de alerta", e);
        }
      };
    } catch (e) {
      console.error("Falha ao abrir stream de alerta", e);
    }

    return () => {
      es?.close();
    };
  }, []);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
      setNotice(action === "approved" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado e removido da fila.");
    } catch {
      setError("Não foi possível confirmar a decisão. Atualiza a lista antes de tentar novamente.");
    } finally {
      setPendingAction(null);
    }
  }

  // Bulk review action
  async function bulkReview(action: "approved" | "rejected") {
    if (selectedIds.size === 0) return;
    const reason =
      action === "rejected"
        ? window.prompt(`Indica o motivo da rejeição em lote para os ${selectedIds.size} anúncios selecionados (obrigatório):`)
        : "";
    if (action === "rejected" && !reason?.trim()) return;

    setIsBulkActing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/listings/bulk", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
          reason: reason?.trim() ?? "",
        }),
      });

      if (!response.ok) {
        setError(await responseError(response, "Não foi possível processar a moderação em lote."));
        return;
      }

      const data = await response.json();
      setSelectedIds(new Set());
      await load();
      setNotice(
        action === "approved"
          ? `Sucesso: ${data.updatedCount} anúncios foram aprovados e publicados em lote.`
          : `Sucesso: ${data.updatedCount} anúncios foram rejeitados em lote.`,
      );
    } catch {
      setError("Não foi possível concluir a ação em lote. Tenta novamente.");
    } finally {
      setIsBulkActing(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === listings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(listings.map((l) => l.id)));
    }
  }

  function selectLowRisk() {
    const lowRiskIds = listings.filter((l) => (l.ai_risk_score ?? 0) < 40).map((l) => l.id);
    setSelectedIds(new Set(lowRiskIds));
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
      {/* Real-Time Live Push Alert Banner */}
      {liveAlert && (
        <div className="moderation-live-alert" role="alert">
          <div className="live-alert-content">
            <span className="live-alert-icon" aria-hidden="true">🚨</span>
            <div>
              <span className="live-alert-title">{liveAlert.title}</span>
              <span className="live-alert-sub">
                {liveAlert.riskScore ? `Risco IA: ${liveAlert.riskScore}% · ` : ""}
                {liveAlert.reasons.join(", ") || "Atenção necessária"}
              </span>
            </div>
          </div>
          <div className="live-alert-actions">
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={() => {
                void load();
                setLiveAlert(null);
              }}
            >
              Rever Fila Agora
            </button>
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={() => setLiveAlert(null)}
            >
              Dispensar
            </button>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="moderation-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "queue"}
          className={`moderation-tab-btn ${activeTab === "queue" ? "active" : ""}`}
          onClick={() => setActiveTab("queue")}
        >
          📋 Fila de Moderação
          <span className="moderation-tab-badge">{listings.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "analytics"}
          className={`moderation-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          📊 Analytics IA & Anti-Fraude
        </button>
      </div>

      {activeTab === "analytics" ? (
        <ModerationAiAnalytics />
      ) : (
        <>
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

            {/* Bulk Moderation Toolbar */}
            {listings.length > 0 && (
              <div className="bulk-moderation-bar">
                <div className="bulk-selection-controls">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === listings.length && listings.length > 0}
                      onChange={selectAll}
                    />
                    <span>{selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : "Selecionar todos"}</span>
                  </label>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectLowRisk}
                    title="Seleciona todos os anúncios com risco IA inferior a 40%"
                  >
                    ⚡ Selecionar Baixo Risco IA
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>

                {selectedIds.size > 0 && (
                  <div className="bulk-action-buttons">
                    <button
                      type="button"
                      className="button button-primary button-sm"
                      onClick={() => void bulkReview("approved")}
                      disabled={isBulkActing}
                    >
                      {isBulkActing ? "A aprovar…" : `✓ Aprovar selecionados (${selectedIds.size})`}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => void bulkReview("rejected")}
                      disabled={isBulkActing}
                    >
                      {isBulkActing ? "A rejeitar…" : `✕ Rejeitar selecionados (${selectedIds.size})`}
                    </button>
                  </div>
                )}
              </div>
            )}

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
                  const riskScore = listing.ai_risk_score ?? 0;
                  const riskLevel = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";
                  const riskLabel = riskLevel === "high" ? "Alto risco" : riskLevel === "medium" ? "Risco médio" : "Baixo risco";
                  const flaggedReasons = Array.isArray(listing.ai_flagged_reasons) ? listing.ai_flagged_reasons : [];
                  const suggestedAction = listing.ai_suggested_action;
                  const actionLabel: Record<string, string> = { auto_reject: "Rejeitar automaticamente", manual_review: "Revisão manual", approve: "Pode aprovar" };
                  const isSelected = selectedIds.has(listing.id);

                  return (
                    <article
                      className={`moderation-item moderation-risk-${riskLevel} ${isSelected ? "moderation-item-selected" : ""}`}
                      key={listing.id}
                      style={{ position: "relative" }}
                    >
                      <input
                        type="checkbox"
                        className="bulk-item-select"
                        checked={isSelected}
                        onChange={() => toggleSelect(listing.id)}
                        aria-label={`Selecionar anúncio ${listing.title}`}
                      />

                      {riskScore > 0 && (
                        <div className={`ai-risk-banner ai-risk-${riskLevel}`} role="status" aria-label={`Risco IA: ${riskLabel}`}>
                          <div className="ai-risk-header">
                            <span className="ai-risk-badge">
                              <span className="ai-risk-icon" aria-hidden="true">{riskLevel === "high" ? "⚠" : riskLevel === "medium" ? "◆" : "✓"}</span>
                              {riskLabel}
                            </span>
                            <span className="ai-risk-score">{riskScore}%</span>
                          </div>
                          {flaggedReasons.length > 0 && (
                            <ul className="ai-risk-reasons">
                              {flaggedReasons.map((reason, i) => <li key={i}>{reason}</li>)}
                            </ul>
                          )}
                          {suggestedAction && (
                            <span className="ai-risk-suggestion">
                              Sugestão IA: <strong>{actionLabel[suggestedAction] ?? suggestedAction}</strong>
                            </span>
                          )}
                        </div>
                      )}
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
                            <span>{listing.marketplace_name ?? "Produtos"}</span><span aria-hidden="true">·</span><span>{listing.category}</span><span aria-hidden="true">·</span><span>{listing.store_name}</span>
                          </span>
                          <h3>{listing.title}</h3>
                          <p className="moderation-listing-price">{kwanza(listing.price)}</p>
                          <small className="moderation-listing-location">{location || "Localização não indicada"}</small>
                          {listing.attributes && Object.keys(listing.attributes).length > 0 && (
                            <details className="moderation-description moderation-attributes">
                              <summary>Ver detalhes do anúncio</summary>
                              <ul>
                                {Object.entries(listing.attributes).map(([key, value]) => (
                                  <li key={key}><b>{attributeLabels[key] ?? key}</b> <span>{typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}</span></li>
                                ))}
                              </ul>
                            </details>
                          )}
                          <details className="moderation-description">
                            <summary>Ver descrição completa</summary>
                            <p>{listing.description || "Este anúncio não tem descrição."}</p>
                          </details>
                        </div>
                      </div>
                      <div className="button-row moderation-actions" role="group" aria-label={`Ações para ${listing.title}`}>
                        <button className="button button-primary" onClick={() => void review(listing.id, "approved")} disabled={pendingAction !== null || isBulkActing}>
                          {isApproving ? "A publicar…" : "Aprovar e publicar"}
                        </button>
                        <button className="button button-secondary" onClick={() => void review(listing.id, "rejected")} disabled={pendingAction !== null || isBulkActing}>
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
        </>
      )}
    </div>
  );
}
