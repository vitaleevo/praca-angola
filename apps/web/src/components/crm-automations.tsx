"use client";

import { useState, useEffect, useCallback } from "react";
import "../app/crm.css";

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  trigger_config: Record<string, any>;
  conditions: any[];
  actions: any[];
  is_active: boolean;
  priority: number;
  execution_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface AutomationLog {
  id: string;
  rule_id: string;
  rule_name?: string;
  trigger_event: string;
  actions_executed: any[];
  status: string;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_lead: "Novo lead",
  new_message_inbound: "Nova mensagem recebida",
  deal_stage_changed: "Negócio muda de etapa",
  contact_idle_days: "Contacto inativo",
  new_deal: "Novo negócio",
};

const ACTION_LABELS: Record<string, string> = {
  auto_reply_text: "Resposta automática por texto",
  auto_reply_ai: "Resposta automática por IA",
  move_deal_stage: "Mover negócio de etapa",
  assign_to_user: "Atribuir a utilizador",
  add_tag: "Adicionar etiqueta",
  create_deal: "Criar negócio",
  send_notification: "Enviar notificação",
};

export default function CrmAutomations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [activeTab, setActiveTab] = useState<"rules" | "logs">("rules");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function request(path: string, init?: RequestInit) {
    const res = await fetch(`/api/v1/crm/automations/${path}`, { credentials: "include", ...init });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.message || "Não foi possível atualizar as automações.");
    }
    return res.json();
  }

  // New rule form state
  const [newRule, setNewRule] = useState<{
    name: string;
    description: string;
    triggerEvent: string;
    actions: Array<{ type: string; config: Record<string, any> }>;
    conditions: any[];
    priority: number;
  }>({
    name: "",
    description: "",
    triggerEvent: "new_message_inbound",
    actions: [{ type: "auto_reply_text", config: { message: "" } }],
    conditions: [],
    priority: 100,
  });

  const fetchRules = useCallback(async () => {
    try {
      const data = await request("rules");
      setRules(data.rules || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as regras."); }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await request("logs");
      setLogs(data.logs || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o historial."); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRules(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchRules, fetchLogs]);

  const toggleRule = async (ruleId: string, currentActive: boolean) => {
    try {
      await request(`rules/${ruleId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      await fetchRules();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar a regra."); }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm("Tens a certeza que queres apagar esta automação?")) return;
    try {
      await request(`rules/${ruleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchRules();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível apagar a regra."); }
  };

  const createRule = async () => {
    if (!newRule.name.trim() || !newRule.actions.length) return;
    try {
      await request("rules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      });
        setShowCreateModal(false);
        setNewRule({
          name: "",
          description: "",
          triggerEvent: "new_message_inbound",
          actions: [{ type: "auto_reply_text", config: { message: "" } }],
          conditions: [],
          priority: 100,
        });
        await fetchRules();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a regra."); }
  };

  const seedDefaults = async () => {
    try {
      await request("seed-defaults", {
        method: "POST",
        credentials: "include",
      });
      await fetchRules();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os modelos."); }
  };

  return (
    <div className="crm-automations">
      {/* Header */}
      <div className="crm-automations-header">
        <div>
          <h2>Regras de automação</h2>
          <p className="crm-subtitle">
            Automatiza tarefas repetitivas: respostas, atribuições, tags e muito mais.
          </p>
        </div>
        <div className="crm-header-actions">
          <button className="crm-btn-secondary" onClick={seedDefaults}>
            Carregar modelos
          </button>
          <button className="crm-btn-primary" onClick={() => setShowCreateModal(true)}>
            Nova automação
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="crm-tabs">
        <button
          className={`crm-tab ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          Regras ({rules.length})
        </button>
        <button
          className={`crm-tab ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => { setActiveTab("logs"); fetchLogs(); }}
        >
          Historial de execuções
        </button>
      </div>

      {error && <p className="crm-channel-feedback error" role="alert">{error}</p>}
      {loading ? (
        <div className="crm-loading">
          <div className="crm-spinner" />
          <span>A carregar automações...</span>
        </div>
      ) : error && !rules.length && activeTab === "rules" ? (
        <div className="crm-empty-state"><h3>Regras indisponíveis</h3><p>Verifica a ligação e tenta novamente.</p><button className="crm-btn-secondary" onClick={() => void fetchRules()}>Tentar novamente</button></div>
      ) : activeTab === "rules" ? (
        /* Rules List */
        <div className="crm-automations-grid">
          {!rules.length ? (
            <div className="crm-empty-state">
              <span className="crm-empty-icon" aria-hidden="true">○</span>
              <h3>Sem automações configuradas</h3>
              <p>Cria a tua primeira automação ou carrega os modelos pré-definidos.</p>
              <button className="crm-btn-primary" onClick={seedDefaults}>
                Carregar modelos predefinidos
              </button>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className={`crm-automation-card ${rule.is_active ? "active" : "inactive"}`}>
                <div className="crm-auto-card-header">
                  <div className="crm-auto-card-title">
                    <h4>{rule.name}</h4>
                    <span className={`crm-badge ${rule.is_active ? "badge-success" : "badge-muted"}`}>
                      {rule.is_active ? "Ativa" : "Pausada"}
                    </span>
                  </div>
                  <div className="crm-auto-card-actions">
                    <button
                      className="crm-btn-icon"
                      onClick={() => toggleRule(rule.id, rule.is_active)}
                      title={rule.is_active ? "Pausar" : "Ativar"}
                    >
                      {rule.is_active ? "Pausar" : "Ativar"}
                    </button>
                    <button className="crm-btn-icon danger" onClick={() => deleteRule(rule.id)} title="Apagar">
                      Apagar
                    </button>
                  </div>
                </div>
                {rule.description && <p className="crm-auto-description">{rule.description}</p>}
                <div className="crm-auto-meta">
                  <div className="crm-auto-trigger">
                    <span className="crm-meta-label">Gatilho:</span>
                    <span className="crm-badge badge-info">
                      {TRIGGER_LABELS[rule.trigger_event] || rule.trigger_event}
                    </span>
                  </div>
                  <div className="crm-auto-actions-list">
                    <span className="crm-meta-label">Ações:</span>
                    {(typeof rule.actions === "string" ? JSON.parse(rule.actions) : rule.actions).map(
                      (action: any, i: number) => (
                        <span key={i} className="crm-badge badge-action">
                          {ACTION_LABELS[action.type] || action.type}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="crm-auto-stats">
                  <span>{rule.execution_count} execuções</span>
                  <span>Prioridade: {rule.priority}</span>
                  {rule.last_triggered_at && (
                    <span>Último: {new Date(rule.last_triggered_at).toLocaleDateString("pt-AO")}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Logs Table */
        <div className="crm-logs-table-wrapper">
          {!logs.length ? (
            <div className="crm-empty-state">
              <span className="crm-empty-icon" aria-hidden="true">○</span>
              <h3>Sem execuções registadas</h3>
              <p>As automações vão registar aqui cada execução automaticamente.</p>
            </div>
          ) : (
            <table className="crm-logs-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Regra</th>
                  <th>Gatilho</th>
                  <th>Estado</th>
                  <th>Duração</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString("pt-AO")}</td>
                    <td className="crm-log-rule-name">{(log as any).rule_name || log.rule_id.slice(0, 8)}</td>
                    <td>
                      <span className="crm-badge badge-info">
                        {TRIGGER_LABELS[log.trigger_event] || log.trigger_event}
                      </span>
                    </td>
                    <td>
                      <span className={`crm-badge ${log.status === "success" ? "badge-success" : log.status === "error" ? "badge-danger" : "badge-warning"}`}>
                        {log.status === "success" ? "Sucesso" : log.status === "error" ? "Erro" : "Parcial"}
                      </span>
                    </td>
                    <td>{log.duration_ms}ms</td>
                    <td>{(typeof log.actions_executed === "string" ? JSON.parse(log.actions_executed) : log.actions_executed).length} ações</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="crm-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="crm-modal crm-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>Nova automação</h3>
              <button className="crm-btn-icon" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="crm-modal-body">
              <div className="crm-form-group">
                <label>Nome da Automação</label>
                <input
                  type="text"
                  placeholder="Ex: Boas-vindas WhatsApp"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                />
              </div>
              <div className="crm-form-group">
                <label>Descrição (opcional)</label>
                <input
                  type="text"
                  placeholder="Breve descrição do que esta automação faz"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                />
              </div>
              <div className="crm-form-group">
                <label>Gatilho (Quando executar?)</label>
                <select
                  value={newRule.triggerEvent}
                  onChange={(e) => setNewRule({ ...newRule, triggerEvent: e.target.value })}
                >
                  {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="crm-form-group">
                <label>Ação a Executar</label>
                <select
                  value={newRule.actions[0]?.type || "auto_reply_text"}
                  onChange={(e) => {
                    const type = e.target.value;
                    const config = type === "auto_reply_text" ? { message: "" }
                      : type === "add_tag" ? { tag: "" }
                      : type === "create_deal" ? { title: "Novo negócio automático" }
                      : {};
                    setNewRule({ ...newRule, actions: [{ type, config }] });
                  }}
                >
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic config based on action type */}
              {newRule.actions[0]?.type === "auto_reply_text" && (
                <div className="crm-form-group">
                  <label>Mensagem de Resposta Automática</label>
                  <textarea
                    placeholder="Olá! Obrigado pelo contacto..."
                    rows={3}
                    value={newRule.actions[0].config.message || ""}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        actions: [{ ...newRule.actions[0], config: { message: e.target.value } }],
                      })
                    }
                  />
                </div>
              )}

              {newRule.actions[0]?.type === "add_tag" && (
                <div className="crm-form-group">
                  <label>Tag a Adicionar</label>
                  <input
                    type="text"
                    placeholder="Ex: VIP, Urgente, Promo2026"
                    value={newRule.actions[0].config.tag || ""}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        actions: [{ ...newRule.actions[0], config: { tag: e.target.value } }],
                      })
                    }
                  />
                </div>
              )}

              <div className="crm-form-group">
                <label>Prioridade (menor = executa primeiro)</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={newRule.priority}
                  onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="crm-modal-footer">
              <button className="crm-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="crm-btn-primary" onClick={createRule} disabled={!newRule.name.trim()}>
                Criar automação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
