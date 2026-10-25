"use client";

import { useCallback, useEffect, useState } from "react";
import { kwanza } from "../lib/api";

interface ModerationAnalyticsData {
  generatedAt: string;
  listings: {
    totalListings: number;
    pendingReview: number;
    published: number;
    rejected: number;
    highRiskPending: number;
    mediumRiskPending: number;
    lowRiskPending: number;
    avgRiskScore: number;
  };
  topReasons: { reason: string; count: number }[];
  fraud: {
    totalInspections: number;
    highRisk: number;
    suspicious: number;
    lowRisk: number;
    tamperingDetected: number;
    amountProtectedAoa: string;
  };
  topBanks: { bank: string; count: number }[];
  performance: {
    avgReviewTimeMinutes: number;
    aiAlignmentRate: number;
    totalActionsRecorded: number;
  };
}

export function ModerationAiAnalytics() {
  const [data, setData] = useState<ModerationAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    }
    try {
      const res = await fetch("/api/v1/admin/moderation/analytics", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Não foi possível carregar as métricas de moderação IA.");
      }
      const json = await res.json();
      setData(json);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido ao carregar métricas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/v1/admin/moderation/analytics", { credentials: "include" });
        if (!res.ok) {
          throw new Error("Não foi possível carregar as métricas de moderação IA.");
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro desconhecido ao carregar métricas.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="moderation-loading" role="status" aria-label="A carregar métricas de inteligência artificial">
        <span className="moderation-loading-image" />
        <span className="moderation-loading-copy"><i /><i /><i /></span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="moderation-error" role="alert">
        <span>{error || "Dados não disponíveis."}</span>
        <button type="button" className="button button-secondary" onClick={() => void fetchAnalytics()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const { listings, fraud, topReasons, topBanks, performance } = data;
  const pendingTotal = listings.pendingReview || 1;
  const highRiskPct = Math.round((listings.highRiskPending / pendingTotal) * 100);
  const mediumRiskPct = Math.round((listings.mediumRiskPending / pendingTotal) * 100);
  const lowRiskPct = Math.max(0, 100 - highRiskPct - mediumRiskPct);

  const totalFraudInspections = fraud.totalInspections || 1;
  const fraudHighPct = Math.round((fraud.highRisk / totalFraudInspections) * 100);
  const fraudSuspiciousPct = Math.round((fraud.suspicious / totalFraudInspections) * 100);
  const fraudLowPct = Math.max(0, 100 - fraudHighPct - fraudSuspiciousPct);

  return (
    <div className="moderation-ai-analytics">
      {/* Top Controls Bar */}
      <div className="analytics-header-bar">
        <div>
          <span className="moderation-kicker">Inteligência Artificial & Trust</span>
          <h2>Telemetria de Moderação e Anti-Fraude</h2>
          <p>Métricas consolidadas de risco em anúncios e inspeções forenses de comprovativos.</p>
        </div>
        <div className="analytics-header-actions">
          <span className="analytics-timestamp">
            Atualizado: {new Date(data.generatedAt).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => void fetchAnalytics(true)}
            disabled={refreshing}
          >
            {refreshing ? "A atualizar…" : "↻ Atualizar"}
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card card-glow-primary">
          <div className="kpi-icon-wrap icon-purple">🤖</div>
          <div className="kpi-info">
            <span className="kpi-label">Total de Anúncios Auditados</span>
            <strong className="kpi-value">{listings.totalListings}</strong>
            <span className="kpi-sub">
              Risco Médio da Fila: <strong>{listings.avgRiskScore}%</strong>
            </span>
          </div>
        </div>

        <div className="analytics-kpi-card card-glow-danger">
          <div className="kpi-icon-wrap icon-red">🚨</div>
          <div className="kpi-info">
            <span className="kpi-label">Pendentes de Alto Risco</span>
            <strong className="kpi-value value-danger">{listings.highRiskPending}</strong>
            <span className="kpi-sub">
              + {listings.mediumRiskPending} em risco médio
            </span>
          </div>
        </div>

        <div className="analytics-kpi-card card-glow-success">
          <div className="kpi-icon-wrap icon-emerald">🛡️</div>
          <div className="kpi-info">
            <span className="kpi-label">Capital Protegido contra Burla</span>
            <strong className="kpi-value value-success">{kwanza(fraud.amountProtectedAoa)}</strong>
            <span className="kpi-sub">
              <strong>{fraud.tamperingDetected}</strong> adulterações barradas
            </span>
          </div>
        </div>

        <div className="analytics-kpi-card card-glow-amber">
          <div className="kpi-icon-wrap icon-amber">⚡</div>
          <div className="kpi-info">
            <span className="kpi-label">Tempo Médio de Revisão</span>
            <strong className="kpi-value">
              {performance.avgReviewTimeMinutes > 0 ? `${performance.avgReviewTimeMinutes}m` : "< 1m"}
            </strong>
            <span className="kpi-sub">
              Assertividade IA: <strong>{performance.aiAlignmentRate}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Analytics Sections */}
      <div className="analytics-two-col">
        {/* Left Column: Risk Distribution in Queue */}
        <div className="analytics-card">
          <div className="card-header">
            <h3>Distribuição de Risco na Fila de Anúncios</h3>
            <span className="subtle-chip">{listings.pendingReview} pendentes</span>
          </div>
          <p className="card-desc">
            Classificação preditiva baseada em conteúdo, imagens, preços irrisórios e palavras-chave restritas.
          </p>

          <div className="risk-progress-bar">
            {listings.highRiskPending > 0 && (
              <div
                className="bar-segment bar-high"
                style={{ width: `${Math.max(highRiskPct, 8)}%` }}
                title={`Alto Risco: ${listings.highRiskPending} (${highRiskPct}%)`}
              />
            )}
            {listings.mediumRiskPending > 0 && (
              <div
                className="bar-segment bar-medium"
                style={{ width: `${Math.max(mediumRiskPct, 8)}%` }}
                title={`Risco Médio: ${listings.mediumRiskPending} (${mediumRiskPct}%)`}
              />
            )}
            {listings.lowRiskPending > 0 && (
              <div
                className="bar-segment bar-low"
                style={{ width: `${Math.max(lowRiskPct, 8)}%` }}
                title={`Baixo Risco: ${listings.lowRiskPending} (${lowRiskPct}%)`}
              />
            )}
          </div>

          <div className="risk-legend">
            <div className="legend-item">
              <span className="legend-dot dot-high" />
              <div>
                <strong>Alto Risco ({listings.highRiskPending})</strong>
                <small>{highRiskPct}% da fila pendente</small>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-medium" />
              <div>
                <strong>Risco Médio ({listings.mediumRiskPending})</strong>
                <small>{mediumRiskPct}% da fila pendente</small>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-low" />
              <div>
                <strong>Baixo Risco ({listings.lowRiskPending})</strong>
                <small>{lowRiskPct}% da fila pendente</small>
              </div>
            </div>
          </div>

          <div className="stat-summary-pill-row">
            <div className="summary-pill">
              <span>Publicados</span>
              <b>{listings.published}</b>
            </div>
            <div className="summary-pill">
              <span>Rejeitados</span>
              <b>{listings.rejected}</b>
            </div>
            <div className="summary-pill">
              <span>Ações Auditadas</span>
              <b>{performance.totalActionsRecorded}</b>
            </div>
          </div>
        </div>

        {/* Right Column: Fraud Inspection & Receipts */}
        <div className="analytics-card">
          <div className="card-header">
            <h3>Inspeções Forenses Anti-Fraude</h3>
            <span className="subtle-chip">{fraud.totalInspections} comprovativos</span>
          </div>
          <p className="card-desc">
            Auditoria automatizada por OCR e visão computacional de comprovativos Multicaixa Express e Bancários.
          </p>

          <div className="fraud-verdicts-grid">
            <div className="verdict-box verdict-green">
              <span className="verdict-title">Baixo Risco</span>
              <strong className="verdict-count">{fraud.lowRisk}</strong>
              <small>{fraudLowPct}% validados</small>
            </div>
            <div className="verdict-box verdict-amber">
              <span className="verdict-title">Suspeitos</span>
              <strong className="verdict-count">{fraud.suspicious}</strong>
              <small>{fraudSuspiciousPct}% a verificar</small>
            </div>
            <div className="verdict-box verdict-red">
              <span className="verdict-title">Alto Risco</span>
              <strong className="verdict-count">{fraud.highRisk}</strong>
              <small>{fraudHighPct}% fraudes</small>
            </div>
          </div>

          {topBanks.length > 0 && (
            <div className="bank-breakdown">
              <span className="section-subheading">Bancos e Emissores Mais Detectados</span>
              <div className="bank-tags">
                {topBanks.map((item) => (
                  <span key={item.bank} className="bank-tag">
                    {item.bank} <strong>({item.count})</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Flagged Reasons */}
      {topReasons.length > 0 && (
        <div className="analytics-card" style={{ marginTop: "16px" }}>
          <div className="card-header">
            <h3>Principais Motivos de Violação Sinalizados pela IA</h3>
            <span className="subtle-chip">Top {topReasons.length} violações</span>
          </div>
          <p className="card-desc">
            Padronização de termos ofensivos, pedidos ilegais de sinal prévio por telefone, artigos falsificados ou armas.
          </p>
          <div className="reasons-chips-grid">
            {topReasons.map((item, idx) => (
              <div key={idx} className="reason-metric-chip">
                <span className="reason-rank">#{idx + 1}</span>
                <span className="reason-text">{item.reason}</span>
                <span className="reason-badge-count">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
