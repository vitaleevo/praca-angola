"use client";

import { useState, useEffect, useCallback } from "react";
import "../app/crm.css";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
  totalValue: number;
}

interface AnalyticsData {
  pipeline: {
    totalDeals: number;
    totalPipelineValue: number;
    wonDeals: number;
    wonValue: number;
    lostDeals: number;
    lostValue: number;
    winRate: number;
    stages: PipelineStage[];
  };
  contacts: {
    totalContacts: number;
    byChannel: Array<{ channel: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
  chatbot: {
    totalSessions: number;
    convertedSessions: number;
    conversionRate: number;
    totalMessages: number;
    guardrailInterventions: number;
    violationsByCategory: Record<string, number>;
  };
  insights: Array<{
    type: "opportunity" | "alert" | "success";
    message: string;
  }>;
}

export default function CrmAiAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/crm/analytics/overview");
      if (!res.ok) {
        throw new Error("Erro ao carregar dados de analytics.");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar as métricas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const channelLabels: Record<string, string> = {
    whatsapp: "WhatsApp Direct",
    instagram: "Instagram Direct",
    facebook_lead: "Facebook Leads",
    puvo_storefront: "Chatbot Loja PUVO",
    service_request: "Pedidos de Serviço",
    manual: "Prospeção Manual",
  };

  const violationLabels: Record<string, string> = {
    prompt_injection: "Tentativa de Injeção / Jailbreak",
    pii: "Dados Pessoais / BI / Cartões (PII)",
    off_topic: "Pergunta Fora do Âmbito Comercial",
    commercial_risk: "Tentativa de Desconto Não Autorizado",
    leakage: "Prevenção de Vazamento de Prompt",
    flood: "Mensagem Excessivamente Longa",
  };

  if (loading) {
    return (
      <div className="crm-analytics-loading">
        <div className="crm-loading-spinner" />
        <p>A compilar métricas analíticas e insights de Inteligência Artificial...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="crm-analytics-error">
        <p>{error || "Dados indisponíveis."}</p>
        <button onClick={fetchAnalytics} className="crm-btn crm-btn-primary">
          Tentar Novamente
        </button>
      </div>
    );
  }

  const { pipeline, contacts, chatbot, insights } = data;

  return (
    <div className="crm-analytics-container">
      {/* ──── Header ──── */}
      <div className="crm-analytics-header">
        <div>
          <h2 className="crm-analytics-title">Indicadores da loja</h2>
          <p className="crm-analytics-subtitle">
            Visão consolidada de performance de vendas, conversão do chatbot e métricas de proteção por IA.
          </p>
        </div>
        <button onClick={fetchAnalytics} className="crm-btn crm-btn-outline" title="Atualizar dados">
          Atualizar
        </button>
      </div>

      {/* ──── KPI Cards ──── */}
      <div className="crm-analytics-kpis">
        <div className="crm-kpi-card">
          <span className="crm-kpi-label">Volume no Funil</span>
          <span className="crm-kpi-value">
            {pipeline.totalPipelineValue.toLocaleString("pt-AO")} <small>Kz</small>
          </span>
          <span className="crm-kpi-sub">
            {pipeline.totalDeals} negócio(s) em aberto ou fechado(s)
          </span>
        </div>

        <div className="crm-kpi-card">
          <span className="crm-kpi-label">Receita Concretizada (Ganhos)</span>
          <span className="crm-kpi-value crm-text-success">
            {pipeline.wonValue.toLocaleString("pt-AO")} <small>Kz</small>
          </span>
          <span className="crm-kpi-sub">
            Taxa de conversão do funil: <strong>{pipeline.winRate}%</strong>
          </span>
        </div>

        <div className="crm-kpi-card">
          <span className="crm-kpi-label">Chatbot IA de Loja</span>
          <span className="crm-kpi-value crm-text-primary">
            {chatbot.conversionRate}% <small>conversão</small>
          </span>
          <span className="crm-kpi-sub">
            {chatbot.convertedSessions} de {chatbot.totalSessions} visitantes viraram leads
          </span>
        </div>

        <div className="crm-kpi-card">
          <span className="crm-kpi-label">Intervenções Guardrails</span>
          <span className="crm-kpi-value crm-text-shield">
            {chatbot.guardrailInterventions}
          </span>
          <span className="crm-kpi-sub">
            Defesas activadas contra burlas e jailbreaks
          </span>
        </div>
      </div>

      {/* ──── AI Strategic Insights ──── */}
      <div className="crm-insights-box">
        <div className="crm-insights-title">
          <span>Recomendações comerciais</span>
          <span className="crm-badge-ai">Dados atuais</span>
        </div>
        <div className="crm-insights-list">
          {insights.map((insight, idx) => (
            <div key={idx} className={`crm-insight-item crm-insight-${insight.type}`}>
              <span className="crm-insight-icon" aria-hidden="true">●</span>
              <span className="crm-insight-text">{insight.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ──── Pipeline & Stages Breakdown ──── */}
      <div className="crm-analytics-grid">
        <div className="crm-analytics-panel">
          <h2 className="crm-panel-heading">Distribuição por etapa do funil</h2>
          <div className="crm-stages-progress-list">
            {pipeline.stages.map((stage) => {
              const maxVal = Math.max(...pipeline.stages.map((s) => s.totalValue), 1);
              const percent = Math.min(100, Math.round((stage.totalValue / maxVal) * 100));

              return (
                <div key={stage.id} className="crm-stage-stat-row">
                  <div className="crm-stage-stat-header">
                    <span className="crm-stage-name">
                      <span
                        className="crm-stage-color-dot"
                        style={{ backgroundColor: stage.color || "#004bfc" }}
                      />
                      {stage.name}
                    </span>
                    <span className="crm-stage-values">
                      <strong>{stage.dealCount}</strong> negócio(s) •{" "}
                      {stage.totalValue.toLocaleString("pt-AO")} Kz
                    </span>
                  </div>
                  <div className="crm-stage-bar-track">
                    <div
                      className="crm-stage-bar-fill"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: stage.color || "#004bfc",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ──── Lead Channels ──── */}
        <div className="crm-analytics-panel">
          <h2 className="crm-panel-heading">Origem dos contactos</h2>
          <div className="crm-channels-list">
            {contacts.byChannel.map((ch) => {
              const pct = contacts.totalContacts > 0 ? Math.round((ch.count / contacts.totalContacts) * 100) : 0;
              return (
                <div key={ch.channel} className="crm-channel-stat-item">
                  <div className="crm-channel-stat-info">
                    <span className="crm-channel-name">
                      {channelLabels[ch.channel] || ch.channel}
                    </span>
                    <span className="crm-channel-count">
                      {ch.count} ({pct}%)
                    </span>
                  </div>
                  <div className="crm-channel-bar-track">
                    <div className="crm-channel-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ──── Guardrails & Chatbot Telemetry ──── */}
      <div className="crm-analytics-panel crm-mt-6">
        <h2 className="crm-panel-heading">Proteção do assistente</h2>
        <p className="crm-panel-desc">
          O assistente de vendas opera com filtros ativos para proteger a loja contra injeção de prompts maliciosos, vazamento de bilhetes de identidade (BI), IBAN e promessas de descontos ilegítimos.
        </p>

        {Object.keys(chatbot.violationsByCategory).length === 0 ? (
          <div className="crm-guardrails-empty">
            <span aria-hidden="true">●</span>
            <p>Nenhuma violação ou anomalia registada nas últimas conversas. As interações dos visitantes com o chatbot mantêm-se dentro dos parâmetros de segurança normais.</p>
          </div>
        ) : (
          <div className="crm-guardrails-grid">
            {Object.entries(chatbot.violationsByCategory).map(([cat, count]) => (
              <div key={cat} className="crm-guardrail-card">
                <span className="crm-guardrail-cat-name">
                  {violationLabels[cat] || cat}
                </span>
                <span className="crm-guardrail-cat-count">{count}</span>
                <span className="crm-guardrail-cat-status">Intervenção preventiva</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
