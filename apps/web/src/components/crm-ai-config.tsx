"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../app/crm.css";

interface StoreAiConfig {
  id: string;
  workspace_id: string;
  provider: "gemini" | "openai" | "claude" | "openrouter" | "custom";
  model_name: string;
  has_api_key: boolean;
  masked_api_key?: string;
  custom_endpoint_url?: string | null;
  system_instructions: string;
  temperature: number;
  auto_reply_enabled: boolean;
  is_active: boolean;
  updated_at: string;
}

interface KnowledgeDoc {
  id: string;
  workspace_id: string;
  title: string;
  category: "about_store" | "delivery_policy" | "payment_policy" | "faq" | "custom_doc";
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PROVIDER_METADATA = {
  gemini: {
    name: "Google Gemini",
    badgeColor: "#2563eb",
    defaultModels: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIzaSy...",
    description: "Excelente compreensão em português de Angola, rapidez e quota gratuita generosa no Google AI Studio.",
  },
  openai: {
    name: "OpenAI",
    badgeColor: "#10b981",
    defaultModels: ["gpt-4o-mini", "gpt-4o", "o3-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
    description: "Padrão de indústria mundial em inteligência conversacional e respostas comerciais perspicazes.",
  },
  claude: {
    name: "Anthropic Claude",
    badgeColor: "#d97706",
    defaultModels: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-api...",
    description: "Conhecido pela escrita natural e persuasiva em vendas, altamente humano e empático.",
  },
  openrouter: {
    name: "OpenRouter",
    badgeColor: "#8b5cf6",
    defaultModels: [
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
      "mistralai/mistral-large-2411",
      "qwen/qwen-2.5-72b-instruct",
    ],
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-...",
    description: "Permite usar centenas de modelos de ponta (DeepSeek, LLaMA, Mistral) com uma única chave unificada.",
  },
  custom: {
    name: "Personalizado / VPS Própria",
    badgeColor: "#475569",
    defaultModels: ["llama3", "mistral", "deepseek-r1", "custom-model"],
    keyUrl: "",
    keyPlaceholder: "Opcional se a tua VPS não exigir token",
    description: "Liga o teu próprio servidor Ollama, LMStudio ou VPS com vLLM para controlo soberano total sem custos de API por mensagem.",
  },
};

export function CrmAiConfig() {
  const [config, setConfig] = useState<StoreAiConfig | null>(null);
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");

  // Form states
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude" | "openrouter" | "custom">("gemini");
  const [modelName, setModelName] = useState("gemini-1.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [customEndpointUrl, setCustomEndpointUrl] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);

  // New Knowledge Doc modal state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState<"about_store" | "delivery_policy" | "payment_policy" | "faq" | "custom_doc">("faq");
  const [docContent, setDocContent] = useState("");
  const [docSaving, setDocSaving] = useState(false);

  // Interactive Test Playground state
  const [testPrompt, setTestPrompt] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  async function loadData() {
    try {
      const [cfgRes, knwRes] = await Promise.all([
        fetch("/api/v1/crm/ai/config", { credentials: "include" }),
        fetch("/api/v1/crm/ai/knowledge", { credentials: "include" }),
      ]);

      if (cfgRes.ok) {
        const json = await cfgRes.json();
        const c = json.config as StoreAiConfig;
        setConfig(c);
        setProvider(c.provider);
        setModelName(c.model_name);
        setCustomEndpointUrl(c.custom_endpoint_url || "");
        setSystemInstructions(c.system_instructions);
        setTemperature(c.temperature);
        setAutoReplyEnabled(c.auto_reply_enabled);
      }

      if (knwRes.ok) {
        const json = await knwRes.json();
        setKnowledgeList(json.items || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("");
    setSaveError("");

    try {
      const res = await fetch("/api/v1/crm/ai/config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          modelName,
          apiKey: apiKey.trim() || undefined,
          customEndpointUrl: customEndpointUrl.trim() || undefined,
          systemInstructions: systemInstructions.trim(),
          temperature: Number(temperature),
          autoReplyEnabled,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao guardar definições de IA.");
      }

      const json = await res.json();
      setConfig(json.config);
      setApiKey("");
      setSaveStatus("✅ Configuração de IA atualizada com sucesso!");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docTitle.trim() || !docContent.trim()) return;
    setDocSaving(true);
    try {
      const res = await fetch("/api/v1/crm/ai/knowledge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle.trim(),
          category: docCategory,
          content: docContent.trim(),
        }),
      });

      if (res.ok) {
        setShowDocModal(false);
        setDocTitle("");
        setDocContent("");
        await loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDocSaving(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    if (!confirm("Tens a certeza que queres remover este documento da base de conhecimento da IA?")) return;
    try {
      const res = await fetch(`/api/v1/crm/ai/knowledge/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setKnowledgeList((prev) => prev.filter((d) => d.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleTestAi(e: React.FormEvent) {
    e.preventDefault();
    if (!testPrompt.trim() || testLoading) return;
    setTestLoading(true);
    setTestResponse("");
    try {
      const res = await fetch("/api/v1/crm/ai/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: testPrompt.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setTestResponse(json.generatedText);
      } else {
        setTestResponse("Erro ao testar a IA. Verifica as credenciais e conexão.");
      }
    } catch {
      setTestResponse("Erro ao contactar a IA.");
    } finally {
      setTestLoading(false);
    }
  }

  if (loading) {
    return <div className="loading-state">A carregar definições de IA e Base de Conhecimento…</div>;
  }

  return (
    <div className="crm-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>Configuração da Tua IA & Base de Conhecimento</h2>
          <p style={{ margin: "3px 0 0 0", fontSize: "0.875rem", color: "#64748b" }}>
            Escolhe o motor de inteligência artificial da tua loja, define a tua chave de API e alimenta a IA com as regras da tua empresa.
          </p>
        </div>
        <Link href="/vendedor/crm/conversas" className="button button-secondary">
          💬 Abrir Live Inbox
        </Link>
      </div>

      {/* Grid: 2 Columns (Config on Left, Knowledge & Test on Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px", alignItems: "start" }}>
        
        {/* Left Card: Provider Selection & Keys */}
        <div className="panel" style={{ background: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
            <span style={{ fontSize: "1.3rem" }}>🤖</span>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Provedor de IA</h3>
          </div>

          <form onSubmit={handleSaveConfig} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "8px" }}>
                Seleciona o Motor de IA:
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                {(["gemini", "openai", "claude", "openrouter", "custom"] as const).map((prov) => {
                  const meta = PROVIDER_METADATA[prov];
                  const isSelected = provider === prov;
                  return (
                    <div
                      key={prov}
                      onClick={() => {
                        setProvider(prov);
                        if (meta.defaultModels[0]) setModelName(meta.defaultModels[0]);
                      }}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: isSelected ? `2px solid ${meta.badgeColor}` : "1px solid #e2e8f0",
                        background: isSelected ? "#f8fafc" : "#ffffff",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div>
                        <b style={{ fontSize: "14px", color: isSelected ? meta.badgeColor : "#0f172a" }}>
                          {meta.name}
                        </b>
                        <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                          {meta.description}
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="ai_provider"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ accentColor: meta.badgeColor, cursor: "pointer" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
                Modelo do Provedor
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                >
                  {PROVIDER_METADATA[provider].defaultModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Ou escreve o nome de outro modelo..."
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>
            </div>

            {/* API Key */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                  Chave de API ({PROVIDER_METADATA[provider].name})
                </label>
                {PROVIDER_METADATA[provider].keyUrl && (
                  <a
                    href={PROVIDER_METADATA[provider].keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "11.5px", color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                  >
                    Obter Chave Oficial ↗
                  </a>
                )}
              </div>
              <input
                type="password"
                placeholder={config?.has_api_key ? `Chave configurada (${config.masked_api_key}) - digite nova para substituir` : PROVIDER_METADATA[provider].keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
              />
              <small style={{ color: "#64748b", fontSize: "11px", display: "block", marginTop: "4px" }}>
                🔒 A tua chave é encriptada no PostgreSQL com segurança de nível bancário e nunca é partilhada com terceiros.
              </small>
            </div>

            {/* Custom Endpoint URL (for Custom or OpenRouter) */}
            {(provider === "custom" || provider === "openrouter") && (
              <div>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
                  URL do Endpoint Personalizado (API Base URL)
                </label>
                <input
                  type="url"
                  placeholder={provider === "openrouter" ? "https://openrouter.ai/api/v1" : "http://localhost:11434/v1 ou https://vps.empresa.ao/v1"}
                  value={customEndpointUrl}
                  onChange={(e) => setCustomEndpointUrl(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>
            )}

            {/* System Instructions */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
                Personalidade e Instruções do Sistema
              </label>
              <textarea
                rows={4}
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                placeholder="Ex.: És o assistente virtual da nossa loja em Luanda. Fala de modo caloroso e cordial em português angolano, orienta os clientes sobre produtos e sugere envio para o domicílio..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", lineHeight: "1.4" }}
              />
            </div>

            {/* Auto-reply Checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={autoReplyEnabled}
                onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "#047857" }}
              />
              Ativar respostas automáticas instantâneas no Live Inbox
            </label>

            {saveStatus && <p className="success-message" role="status" style={{ margin: 0 }}>{saveStatus}</p>}
            {saveError && <p className="form-error" role="alert" style={{ margin: 0 }}>{saveError}</p>}

            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "A guardar configurações…" : "Guardar Configuração da IA"}
            </button>
          </form>
        </div>

        {/* Right Column: Knowledge Feeding + Live Test */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Card: Alimentar a IA (Base de Conhecimento) */}
          <div className="panel" style={{ background: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.3rem" }}>📚</span>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Alimentação da IA (Conhecimento)</h3>
              </div>
              <button
                type="button"
                className="button button-secondary"
                style={{ fontSize: "12px", padding: "6px 12px" }}
                onClick={() => setShowDocModal(true)}
              >
                ＋ Adicionar Conhecimento
              </button>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748b" }}>
              Adiciona aqui informações sobre a tua loja, horários, locais de entrega em Luanda e províncias, políticas de garantia e perguntas frequentes. A IA lê estes dados para dar respostas 100% corretas.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {knowledgeList.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: "12px 14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <b style={{ fontSize: "13.5px", color: "#0f172a" }}>{doc.title}</b>
                      <span className="crm-channel-pill channel-storefront" style={{ fontSize: "9.5px" }}>
                        {doc.category === "delivery_policy"
                          ? "Entrega"
                          : doc.category === "payment_policy"
                          ? "Pagamento"
                          : doc.category === "faq"
                          ? "FAQ"
                          : doc.category === "about_store"
                          ? "Sobre a Loja"
                          : "Documento"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#475569", whiteSpace: "pre-line", maxHeight: "60px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {doc.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteDoc(doc.id)}
                    aria-label={`Remover ${doc.title}`}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "16px", padding: "4px" }}
                  >
                    🗑️
                  </button>
                </div>
              ))}

              {knowledgeList.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: "13px", border: "1px dashed #cbd5e1", borderRadius: "10px" }}>
                  Ainda não adicionaste conhecimento à tua IA. Clica no botão acima para adicionar a tua política de entrega ou FAQ!
                </div>
              )}
            </div>
          </div>

          {/* Card: Testar a IA em Tempo Real */}
          <div className="panel" style={{ background: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
              <span style={{ fontSize: "1.3rem" }}>⚡</span>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Testar a Tua IA (Playground)</h3>
            </div>

            <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>
              Faz uma pergunta como se fosses um cliente no WhatsApp para ver como a tua IA responde com base no conhecimento cadastrado.
            </p>

            <form onSubmit={handleTestAi} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Ex.: Vocês entregam no Kilamba e aceitam Multicaixa Express?"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
              <button type="submit" className="button button-primary" disabled={testLoading || !testPrompt.trim()}>
                {testLoading ? "A consultar…" : "Perguntar"}
              </button>
            </form>

            {testResponse && (
              <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <small style={{ color: "#166534", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                  Resposta Gerada pela Tua IA ({PROVIDER_METADATA[provider].name}):
                </small>
                <div style={{ fontSize: "13.5px", color: "#14532d", whiteSpace: "pre-line", lineHeight: "1.45" }}>
                  {testResponse}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modal: Adicionar Conhecimento */}
      {showDocModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "grid", placeItems: "center", padding: "16px" }}>
          <div className="panel" style={{ width: "100%", maxWidth: "520px", background: "#ffffff", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "1.15rem", fontWeight: 700 }}>Alimentar a IA com Novo Conhecimento</h3>
            <form onSubmit={handleAddDoc} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Título do Documento / Tópico
                <input
                  type="text"
                  required
                  placeholder="Ex.: Tabela de Entregas Luanda e Províncias"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Categoria
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="about_store">Sobre a Loja / Empresa</option>
                  <option value="delivery_policy">Políticas e Zonas de Entrega</option>
                  <option value="payment_policy">Formas de Pagamento e Condições</option>
                  <option value="faq">Perguntas Frequentes (FAQ)</option>
                  <option value="custom_doc">Documento Livre / Informações Diversas</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
                Conteúdo / Informação (Alimento para a IA)
                <textarea
                  required
                  rows={6}
                  placeholder="Ex.: Fazemos entregas em Luanda (Talatona, Viana, Belas, Maianga) por 2.500 Kz no prazo de 24 horas. Para províncias (Benguela, Huambo, Lubango), enviamos através de transportadora após confirmação do comprovativo..."
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", lineHeight: "1.4" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button type="button" className="button button-secondary" onClick={() => setShowDocModal(false)} disabled={docSaving}>
                  Cancelar
                </button>
                <button type="submit" className="button button-primary" disabled={docSaving}>
                  {docSaving ? "A guardar…" : "Guardar Conhecimento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
