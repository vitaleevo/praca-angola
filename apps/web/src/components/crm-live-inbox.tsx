"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import "../app/crm.css";
import { CrmChannelManager } from "./crm-channel-manager";

interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  meta_ad_ref?: string | null;
  meta_ad_name?: string | null;
  channel: "whatsapp" | "instagram_dm" | "facebook_messenger" | "puvo_chat";
  last_message_preview: string | null;
  last_message_at: string;
  unread_count: number;
  is_replied?: boolean;
  last_message_direction?: "inbound" | "outbound";
}

type InboxStatus = "all" | "unread" | "pending" | "replied" | "read";
type InboxChannel = "all" | Conversation["channel"];
type InboxCounts = Record<InboxStatus, number>;
const emptyCounts: InboxCounts = { all: 0, unread: 0, pending: 0, replied: 0, read: 0 };
const statusOptions: { value: InboxStatus; label: string }[] = [
  { value: "all", label: "Todas" }, { value: "unread", label: "Não lidas" },
  { value: "pending", label: "Por responder" }, { value: "replied", label: "Respondidas" },
  { value: "read", label: "Lidas" },
];

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "image" | "audio" | "document" | "catalog_product" | "payment_request";
  content: string;
  media_url?: string | null;
  metadata?: { image_urls?: string[]; media_id?: string } | null;
  status: string;
  created_at: string;
}

interface SellerProduct {
  id: string;
  title: string;
  price: string;
  slug: string;
}

function channelLabel(channel: Conversation["channel"]) {
  if (channel === "facebook_messenger") return "Messenger";
  if (channel === "instagram_dm") return "Instagram";
  if (channel === "whatsapp") return "WhatsApp";
  return "Chat PUVO";
}

function metaImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["fbcdn.net", "fbsbx.com", "cdninstagram.com", "instagram.com", "facebook.com"]
        .some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function MessageImages({ message, conversationId }: { message: Message; conversationId: string }) {
  const [broken, setBroken] = useState<string[]>([]);
  const urls = [message.media_url, ...(message.metadata?.image_urls ?? [])]
    .filter(metaImageUrl);
  const images = [...new Set(urls)].filter((url) => !broken.includes(url));
  const privateImage = message.message_type === "image" && message.metadata?.media_id && !images.length
    ? `/api/v1/crm/conversations/${conversationId}/messages/${message.id}/image` : null;
  const visible = [...images, ...(privateImage && !broken.includes(privateImage) ? [privateImage] : [])];
  if (!visible.length && message.message_type !== "image") return null;
  if (!visible.length) return <span className="crm-message-image-fallback">Imagem indisponível</span>;
  return <div className="crm-message-images">{visible.map((url, index) =>
    <Image key={url} src={url} alt={`Imagem ${index + 1} enviada na conversa`} width={420} height={320} unoptimized onError={() => setBroken((current) => [...current, url])} />
  )}</div>;
}

export function CrmLiveInbox() {
  const [workspaceState, setWorkspaceState] = useState<"loading" | "ready" | "needs-store" | "error">("loading");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [statusFilter, setStatusFilter] = useState<InboxStatus>("all");
  const [channelFilter, setChannelFilter] = useState<InboxChannel>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [counts, setCounts] = useState<InboxCounts>(emptyCounts);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [updatingConversation, setUpdatingConversation] = useState(false);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationRequestRef = useRef(0);
  const messageRequestRef = useRef(0);
  const selectedConversationIdRef = useRef<string | null>(null);
  const refreshConversationsRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { selectedConversationIdRef.current = selectedConvo?.id ?? null; }, [selectedConvo?.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/crm/workspace", { credentials: "include" })
      .then(async (response) => {
        if (response.ok) return "ready" as const;
        const payload = await response.json().catch(() => null);
        if (response.status === 400 && payload?.code === "NO_COMMERCIAL_PROFILE") return "needs-store" as const;
        return "error" as const;
      })
      .then((state) => { if (!cancelled) setWorkspaceState(state); })
      .catch(() => { if (!cancelled) setWorkspaceState("error"); });
    return () => { cancelled = true; };
  }, []);

  async function loadConversations() {
    const request = ++conversationRequestRef.current;
    try {
      const query = new URLSearchParams({ status: statusFilter, channel: channelFilter });
      if (searchFilter) query.set("search", searchFilter);
      const res = await fetch(`/api/v1/crm/conversations?${query}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as { conversations: Conversation[]; counts?: InboxCounts };
        if (request !== conversationRequestRef.current) return;
        setConversations(json.conversations);
        setCounts(json.counts ?? emptyCounts);
        setSelectedConvo((current) => json.conversations.some((item) => item.id === current?.id) ? current : null);
        setInboxError(null);
      } else {
        if (request === conversationRequestRef.current) setInboxError("Não foi possível atualizar as conversas. Tenta novamente.");
      }
    } catch (e) {
      console.error(e);
      if (request === conversationRequestRef.current) setInboxError("Sem ligação ao Live Inbox. Tenta novamente.");
    } finally {
      if (request === conversationRequestRef.current) setLoading(false);
    }
  }
  useEffect(() => { refreshConversationsRef.current = loadConversations; });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchFilter(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  async function updateConversation(kind: "read" | "replied", value: boolean) {
    if (!selectedConvo || updatingConversation) return;
    setUpdatingConversation(true);
    try {
      const response = await fetch(`/api/v1/crm/conversations/${selectedConvo.id}/${kind === "read" ? "read-status" : "reply-status"}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "read" ? { read: value } : { replied: value }),
      });
      if (!response.ok) throw new Error("Falha ao alterar estado da conversa");
      const { conversation } = await response.json() as { conversation: Conversation };
      setSelectedConvo((current) => current?.id === conversation.id ? { ...current, ...conversation } : current);
      await loadConversations();
    } catch {
      setInboxError("Não foi possível alterar o estado da conversa.");
    } finally {
      setUpdatingConversation(false);
    }
  }

  async function loadMessages(convoId: string) {
    const request = ++messageRequestRef.current;
    try {
      const res = await fetch(`/api/v1/crm/conversations/${convoId}/messages`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (request !== messageRequestRef.current) return;
        setMessages(json.messages);
        setSelectedConvo((current) => current?.id === convoId && current.unread_count > 0 ? { ...current, unread_count: 0 } : current);
        void loadConversations();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadProducts() {
    try {
      const res = await fetch("/api/v1/seller/listings", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setProducts(json.items || []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Real-time SSE listener for incoming messages, CRM deals, and chatbot leads
  useEffect(() => {
    if (workspaceState !== "ready") return;
    if (typeof window === "undefined" || !window.EventSource) return;

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v1/crm/realtime/stream", { withCredentials: true });
      es.onopen = () => setIsLiveConnected(true);
      es.onerror = () => setIsLiveConnected(false);
      es.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const data = raw.data || raw;
          if (data.eventType === "new_message") {
            const msg = data.payload?.message;
            const convoId = data.payload?.conversationId;
            if (msg) {
              setMessages((prev) => {
                if (selectedConversationIdRef.current === convoId && !prev.some((m) => m.id === msg.id)) {
                  return [...prev, msg];
                }
                return prev;
              });
              void refreshConversationsRef.current();
            }
          } else if (data.eventType === "conversation_updated" || data.eventType === "deal_stage_changed" || data.eventType === "new_contact") {
            void refreshConversationsRef.current();
          }
        } catch (err) {
          console.error("Erro ao processar evento de tempo real CRM", err);
        }
      };
    } catch (err) {
      console.error("Falha ao iniciar SSE do CRM", err);
    }

    return () => {
      es?.close();
    };
  }, [workspaceState]);

  useEffect(() => {
    if (workspaceState !== "ready") return;
    void loadProducts();
  }, [workspaceState]);

  useEffect(() => {
    if (workspaceState !== "ready") return;
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, statusFilter, channelFilter, searchFilter]);

  useEffect(() => {
    if (workspaceState !== "ready") return;
    const refresh = () => { void loadConversations(); if (selectedConvo) void loadMessages(selectedConvo.id); };
    window.addEventListener("crm-history-imported", refresh);
    return () => window.removeEventListener("crm-history-imported", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState, selectedConvo?.id]);

  useEffect(() => {
    if (selectedConvo) {
      void loadMessages(selectedConvo.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selectedConvo || !inputText.trim() || sending) return;

    setSending(true);
    const text = inputText.trim();
    setInputText("");

    try {
      const res = await fetch(`/api/v1/crm/conversations/${selectedConvo.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, messageType: "text" }),
      });

      if (res.ok) {
        const json = await res.json();
        setMessages((prev) => [...prev, json.message]);
        await loadConversations();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function handleSendPayment() {
    if (!selectedConvo || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/crm/conversations/${selectedConvo.id}/send-payment`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setMessages((prev) => [...prev, json.message]);
        await loadConversations();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  const [suggesting, setSuggesting] = useState(false);

  async function handleSuggestReply() {
    if (!selectedConvo || suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/v1/crm/ai/suggest-reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConvo.id }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.suggestion) {
          setInputText(json.suggestion);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSendProduct(listingId: string) {
    if (!selectedConvo || sending) return;
    setSending(true);
    setShowProductModal(false);
    try {
      const res = await fetch(`/api/v1/crm/conversations/${selectedConvo.id}/send-product`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (res.ok) {
        const json = await res.json();
        setMessages((prev) => [...prev, json.message]);
        await loadConversations();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  if (workspaceState === "loading") {
    return <div className="loading-state">A preparar o espaço CRM…</div>;
  }

  if (workspaceState === "needs-store") {
    return <section className="panel stack-form" aria-labelledby="crm-store-required-title"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> CRM da loja</p><h2 id="crm-store-required-title">Cria primeiro a tua loja</h2><p>O CRM pertence à loja ou negócio, não à conta pessoal. Assim que guardares a tua montra, o CRM, canais Meta e inbox ficam disponíveis automaticamente.</p></div><Link className="button button-primary" href="/vendedor">Criar a minha loja</Link></section>;
  }

  if (workspaceState === "error") {
    return <section className="panel stack-form" aria-labelledby="crm-unavailable-title"><div><h2 id="crm-unavailable-title">Não foi possível abrir o CRM</h2><p>Atualiza a página. Se o problema continuar, termina sessão e entra novamente.</p></div><Link className="button button-secondary" href="/vendedor">Ir para a área de vendedor</Link></section>;
  }

  if (loading) {
    return <div className="loading-state">A carregar conversas do Live Inbox…</div>;
  }

  return (
    <div className="crm-container">
      <div className="crm-section-toolbar">
        <div>
          <div className="crm-inbox-title-row">
            <h2>Live Inbox</h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 600,
                background: isLiveConnected ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.15)",
                color: isLiveConnected ? "#059669" : "#5c6884",
                border: `1px solid ${isLiveConnected ? "rgba(16, 185, 129, 0.25)" : "rgba(148, 163, 184, 0.25)"}`,
              }}
              title={isLiveConnected ? "Canal real-time activo: recebes mensagens instantâneas" : "A tentar conectar stream em direto…"}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: isLiveConnected ? "#10b981" : "#7c86a2",
                  boxShadow: isLiveConnected ? "0 0 8px #10b981" : "none",
                }}
              />
              {isLiveConnected ? "Stream Live" : "A conectar…"}
            </span>
          </div>
          <p>
            Todas as conversas com clientes num só lugar.
          </p>
        </div>
        <Link href="/vendedor/crm" className="button button-secondary">
          Ver funil de vendas
        </Link>
      </div>
      <CrmChannelManager />

      <div className="crm-inbox-filters" aria-label="Filtrar conversas">
        <div className="crm-inbox-status-tabs" role="group" aria-label="Estado das conversas">
          {statusOptions.map(({ value, label }) => <button key={value} type="button" className={statusFilter === value ? "is-active" : ""} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label} <span>{counts[value]}</span></button>)}
        </div>
        <label className="crm-inbox-channel-filter">Canal
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as InboxChannel)}>
            <option value="all">Todos os canais</option><option value="whatsapp">WhatsApp</option><option value="instagram_dm">Instagram Direct</option><option value="facebook_messenger">Facebook Messenger</option><option value="puvo_chat">Chat PUVO</option>
          </select>
        </label>
        <label className="crm-inbox-search">Pesquisar
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome, telefone ou mensagem" />
        </label>
      </div>
      {inboxError && <p className="crm-inbox-error" role="alert">{inboxError} <button type="button" onClick={() => void loadConversations()}>Repetir</button></p>}

      <div className="crm-inbox-grid">
        {/* Left Column: Thread List */}
        <div className="crm-inbox-threads">
          <div className="crm-inbox-threads-header">
            <span>Conversas</span>
            <span className="crm-thread-count">{conversations.length}</span>
          </div>

          {conversations.map((convo) => (
            <button type="button"
              key={convo.id}
              className={`crm-thread-item ${selectedConvo?.id === convo.id ? "active" : ""}`}
              onClick={() => setSelectedConvo(convo)}
              aria-pressed={selectedConvo?.id === convo.id}
            >
              <div className="crm-thread-avatar">
                {convo.contact_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="crm-thread-content">
                <div className="crm-thread-name-line">
                  <span className="crm-thread-name">{convo.contact_name}</span>
                  <span className="crm-thread-time">
                    {new Date(convo.last_message_at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                  <span
                    className={`crm-channel-pill ${
                      convo.channel === "whatsapp"
                        ? "channel-whatsapp"
                        : convo.channel === "instagram_dm"
                        ? "channel-instagram"
                        : convo.channel === "facebook_messenger" ? "channel-facebook" : "channel-storefront"
                    }`}
                  >
                    {channelLabel(convo.channel)}
                  </span>
                  {convo.unread_count > 0 && (
                    <span style={{ background: "#ef4444", color: "#ffffff", fontSize: "10px", fontWeight: 700, borderRadius: "10px", padding: "1px 6px" }}>
                      {convo.unread_count}
                    </span>
                  )}
                  {convo.is_replied === false && <span className="crm-thread-pending">Por responder</span>}
                </div>
                <div className="crm-thread-preview">{convo.last_message_preview || "Sem mensagens recentes"}</div>
              </div>
            </button>
          ))}

          {conversations.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#7c86a2", fontSize: "13px" }}>
              {statusFilter !== "all" || channelFilter !== "all" || searchFilter ? "Nenhuma conversa corresponde aos filtros." : "Nenhuma conversa aberta no momento. Os leads recebidos aparecerão aqui instantaneamente."}
            </div>
          )}
        </div>

        {/* Center Column: Active Chat */}
        <div className="crm-inbox-chat">
          {selectedConvo ? (
            <>
              <div className="crm-chat-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>{selectedConvo.contact_name}</h3>
                  <small style={{ color: "#5c6884" }}>
                    {selectedConvo.contact_phone || "Sem telefone associado"} · {channelLabel(selectedConvo.channel)}
                  </small>
                  {selectedConvo.meta_ad_ref && <span className="crm-ad-referral-badge">Origem: anúncio Meta{selectedConvo.meta_ad_name ? ` · ${selectedConvo.meta_ad_name}` : ""}</span>}
                </div>
                <div className="crm-chat-state-actions">
                  <button type="button" disabled={updatingConversation} onClick={() => void updateConversation("read", selectedConvo.unread_count > 0)}>{selectedConvo.unread_count > 0 ? "Marcar como lida" : "Marcar como não lida"}</button>
                  <button type="button" disabled={updatingConversation} onClick={() => void updateConversation("replied", !selectedConvo.is_replied)}>{selectedConvo.is_replied ? "Marcar por responder" : "Marcar respondida"}</button>
                </div>
              </div>

              <div className="crm-chat-messages">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`crm-bubble ${
                      m.direction === "inbound"
                        ? "crm-bubble-inbound"
                        : m.message_type === "payment_request"
                        ? "crm-bubble-payment"
                        : m.message_type === "catalog_product"
                        ? "crm-bubble-product"
                        : "crm-bubble-outbound"
                    }`}
                  >
                    <MessageImages message={m} conversationId={selectedConvo.id} />
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                    <span className="crm-bubble-time">
                      {new Date(m.created_at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="crm-chat-input-bar">
                {/* 1-Click Quick Actions */}
                <div className="crm-quick-actions">
                  <button
                    type="button"
                    className="crm-quick-btn"
                    style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#012480" }}
                    onClick={() => void handleSuggestReply()}
                    disabled={suggesting}
                  >
                    {suggesting ? "A consultar IA…" : "✨ Sugerir com a Tua IA"}
                  </button>
                  <button
                    type="button"
                    className="crm-quick-btn"
                    onClick={() => setShowProductModal(true)}
                  >
                    🛍️ Enviar Produto do Catálogo
                  </button>
                  <button
                    type="button"
                    className="crm-quick-btn"
                    onClick={() => void handleSendPayment()}
                  >
                    💳 Enviar Dados Multicaixa / IBAN
                  </button>
                </div>

                <form className="crm-input-row" onSubmit={(e) => void handleSendMessage(e)}>
                  <input
                    type="text"
                    placeholder="Escreve uma resposta para o cliente..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={sending}
                  />
                  <button type="submit" className="button button-primary" disabled={sending || !inputText.trim()}>
                    {sending ? "A enviar…" : "Enviar"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#7c86a2" }}>
              Seleciona uma conversa ao lado para começar o atendimento.
            </div>
          )}
        </div>

        {/* Right Column: Lead Quick Sheet */}
        {selectedConvo && (
          <div className="crm-inbox-lead-details">
            <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700, borderBottom: "1px solid #e2e7f1", paddingBottom: "8px" }}>
              Ficha do Cliente
            </h4>
            <div>
              <small style={{ color: "#5c6884", display: "block" }}>Nome Completo</small>
              <b style={{ fontSize: "14px" }}>{selectedConvo.contact_name}</b>
            </div>

            <div>
              <small style={{ color: "#5c6884", display: "block" }}>Contacto</small>
              <span>{selectedConvo.contact_phone || "Não indicado"}</span>
            </div>

            <div>
              <small style={{ color: "#5c6884", display: "block" }}>Canal de Entrada</small>
              <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{selectedConvo.channel}</span>
            </div>
            {selectedConvo.meta_ad_ref && <div><small>Campanha de origem</small><strong>{selectedConvo.meta_ad_name || `Anúncio ${selectedConvo.meta_ad_ref}`}</strong></div>}

            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #eff2f8", display: "flex", flexDirection: "column", gap: "8px" }}>
              <Link href="/vendedor/crm" className="button button-secondary" style={{ width: "100%", textAlign: "center" }}>
                Ver no Funil Kanban
              </Link>
              <Link href="/vendedor/crm/ia" style={{ fontSize: "12px", color: "#004bfc", fontWeight: 600, textDecoration: "none", textAlign: "center" }}>
                ⚙️ Configurar IA & Base de Conhecimento →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Product Selection Modal */}
      {showProductModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "grid", placeItems: "center", padding: "16px" }}>
          <div className="panel" style={{ width: "100%", maxWidth: "480px", background: "#ffffff", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem", fontWeight: 700 }}>Escolhe um Produto da Loja</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#5c6884" }}>
              Ao selecionares, o cartão com preço e link será enviado diretamente na conversa com o cliente.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
              {products.map((p) => (
                <div
                  key={p.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid #e2e7f1", borderRadius: "8px", cursor: "pointer" }}
                  onClick={() => void handleSendProduct(p.id)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>{p.title}</div>
                    <small style={{ color: "#004bfc", fontWeight: 700 }}>{Number(p.price).toLocaleString("pt-AO")} Kz</small>
                  </div>
                  <button type="button" className="button button-secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
                    Enviar
                  </button>
                </div>
              ))}

              {products.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", color: "#7c86a2" }}>
                  Ainda não tens produtos publicados no catálogo.
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="button button-secondary" onClick={() => setShowProductModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
