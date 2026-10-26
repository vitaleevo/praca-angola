"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../app/crm.css";

interface Deal {
  id: string;
  workspace_id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  stage_id: string;
  title: string;
  value_aoa: number;
  status: "open" | "won" | "lost";
  origin_channel: string;
  created_at: string;
}

interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  deals: Deal[];
  count: number;
  totalValueAoa: number;
}

interface PipelineResponse {
  pipeline: { id: string; name: string };
  stages: Stage[];
  summary: {
    totalDeals: number;
    totalPipelineValueAoa: number;
    wonDealsCount: number;
    conversionRatePercent: number;
  };
}

export function CrmKanban() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadChannel, setNewLeadChannel] = useState<"whatsapp" | "instagram" | "facebook_lead" | "puvo_storefront" | "manual">("whatsapp");
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [creating, setCreating] = useState(false);


  async function loadPipeline() {
    try {
      const res = await fetch("/api/v1/crm/pipeline", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao carregar funil de vendas.");
      }
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPipeline();
  }, []);

  async function handleMoveStage(dealId: string, newStageId: string) {
    try {
      const res = await fetch(`/api/v1/crm/deals/${dealId}/stage`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStageId }),
      });
      if (res.ok) {
        await loadPipeline();
      }
    } catch (e) {
      console.error("Erro ao mudar etapa:", e);
    }
  }

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newLeadName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/crm/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newLeadName.trim(),
          phone: newLeadPhone.trim() || undefined,
          originChannel: newLeadChannel,
          initialDealTitle: newDealTitle.trim() || `Interesse · ${newLeadName.trim()}`,
          initialDealValueAoa: newDealValue ? Number(newDealValue) : 0,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setNewLeadName("");
        setNewLeadPhone("");
        setNewDealTitle("");
        setNewDealValue("");
        await loadPipeline();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="loading-state">A carregar o teu CRM e Funil de Vendas…</div>;
  }

  if (error) {
    return <div className="form-error" role="alert">{error}</div>;
  }

  if (!data) return null;

  return (
    <div className="crm-container">
      {/* KPI Stats Bar */}
      <div className="crm-header-stats">
        <div className="crm-stat-card">
          <small>Total de Oportunidades</small>
          <b>{data.summary.totalDeals}</b>
          <span>No funil ativo</span>
        </div>
        <div className="crm-stat-card">
          <small>Pipeline em Negociação</small>
          <b>{data.summary.totalPipelineValueAoa.toLocaleString("pt-AO")} Kz</b>
          <span>Volume potencial</span>
        </div>
        <div className="crm-stat-card">
          <small>Vendas Concluídas</small>
          <b>{data.summary.wonDealsCount}</b>
          <span>Negócios ganhos</span>
        </div>
        <div className="crm-stat-card">
          <small>Taxa de Conversão</small>
          <b>{data.summary.conversionRatePercent}%</b>
          <span>Eficiência do funil</span>
        </div>
      </div>

      {/* Action Header */}
      <div className="crm-section-toolbar">
        <div>
          <h2>Funil de vendas</h2>
          <p>
            Acompanha cada oportunidade desde o primeiro contacto até à venda.
          </p>
        </div>
        <div className="crm-section-actions">
          <Link href="/vendedor/crm/conversas" className="button button-secondary">
            Abrir Live Inbox
          </Link>
          <button type="button" className="button button-primary" onClick={() => setShowModal(true)}>
            + Nova oportunidade
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="crm-kanban-board">
        {data.stages.map((stage) => (
          <div key={stage.id} className="crm-kanban-column">
            <div className="crm-kanban-column-header">
              <div className="crm-kanban-column-title">
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: stage.color }} />
                <span>{stage.name}</span>
              </div>
              <span className="crm-kanban-badge">{stage.count}</span>
            </div>

            <div className="crm-kanban-cards">
              {stage.deals.map((deal) => (
                <div key={deal.id} className="crm-deal-card">
                  <div className="crm-deal-card-header">
                    <span className="crm-deal-title">{deal.title}</span>
                    <span
                      className={`crm-channel-pill ${deal.origin_channel === "whatsapp"
                          ? "channel-whatsapp"
                          : deal.origin_channel === "instagram"
                            ? "channel-instagram"
                            : deal.origin_channel === "facebook_lead"
                              ? "channel-facebook"
                              : "channel-storefront"
                        }`}
                    >
                      {deal.origin_channel === "whatsapp"
                        ? "WhatsApp"
                        : deal.origin_channel === "instagram"
                          ? "Instagram"
                          : deal.origin_channel === "facebook_lead"
                            ? "Facebook Ad"
                            : "Loja"}
                    </span>
                  </div>

                  <div className="crm-deal-contact">
                    👤 {deal.contact_name}
                    {deal.contact_phone && <span style={{ marginLeft: "6px" }}>({deal.contact_phone})</span>}
                  </div>

                  <div className="crm-deal-value">
                    {deal.value_aoa ? `${deal.value_aoa.toLocaleString("pt-AO")} Kz` : "A combinar"}
                  </div>

                  <div className="crm-deal-actions">
                    <select
                      className="crm-deal-stage-select"
                      value={deal.stage_id}
                      onChange={(e) => void handleMoveStage(deal.id, e.target.value)}
                    >
                      {data.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          Mover para: {s.name}
                        </option>
                      ))}
                    </select>

                    <Link
                      href="/vendedor/crm/conversas"
                      style={{ fontSize: "11px", fontWeight: 700, color: "#004bfc", textDecoration: "none" }}
                    >
                      Conversar →
                    </Link>
                  </div>
                </div>
              ))}

              {stage.deals.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px 12px", color: "#7c86a2", fontSize: "12px" }}>
                  Sem cartões nesta fase
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Novo Lead */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "grid", placeItems: "center", padding: "16px" }}>
          <div className="panel" style={{ width: "100%", maxWidth: "480px", background: "#ffffff", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.15rem", fontWeight: 700 }}>Adicionar Novo Lead ao CRM</h3>
            <form onSubmit={handleCreateLead} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Nome do Contacto / Cliente
                <input
                  type="text"
                  required
                  placeholder="Ex.: Carlos Mendes"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c7cfdf" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Número de Telemóvel / WhatsApp
                <input
                  type="tel"
                  placeholder="Ex.: 923456789"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c7cfdf" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Canal de Origem
                <select
                  value={newLeadChannel}
                  onChange={(e) => setNewLeadChannel(e.target.value as any)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c7cfdf" }}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram Direct</option>
                  <option value="facebook_lead">Facebook Lead Ads</option>
                  <option value="puvo_storefront">Montra PUVO</option>
                  <option value="manual">Manual / Indicação</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Título da Oportunidade
                <input
                  type="text"
                  placeholder="Ex.: Compra de Gerador 5kVA"
                  value={newDealTitle}
                  onChange={(e) => setNewDealTitle(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c7cfdf" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Valor Previsto em Kwanzas (Kz)
                <input
                  type="number"
                  placeholder="Ex.: 150000"
                  value={newDealValue}
                  onChange={(e) => setNewDealValue(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #c7cfdf" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button type="button" className="button button-secondary" onClick={() => setShowModal(false)} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className="button button-primary" disabled={creating}>
                  {creating ? "A guardar…" : "Criar Oportunidade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
