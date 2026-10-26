"use client";

import { FormEvent, useEffect, useState } from "react";

type Channel = {
  id: string;
  channel_type: "facebook_page" | "instagram_direct" | "whatsapp_cloud" | "whatsapp_instance";
  account_name: string;
  status: "connected" | "disconnected" | "expired";
  last_sync_at: string | null;
};

type MetaPage = { id: string; name: string; instagram: { id: string; name: string; username?: string } | null };
type ChannelDiagnostics = {
  connected: boolean;
  tokenValid: boolean;
  appMatches: boolean;
  expiresAt: number | null;
  messagingMissing: string[];
  commentsMissing: string[];
  historyAvailable: boolean;
  commentsAvailable: boolean;
};

const channelLabels: Record<Channel["channel_type"], string> = {
  facebook_page: "Facebook Messenger e Leads",
  instagram_direct: "Instagram Direct",
  whatsapp_cloud: "WhatsApp Cloud",
  whatsapp_instance: "WhatsApp externo",
};

export function CrmChannelManager() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pages, setPages] = useState<MetaPage[] | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [whatsApp, setWhatsApp] = useState({ accountName: "", phoneNumberId: "", accessToken: "" });
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, ChannelDiagnostics>>({});

  async function loadChannels() {
    try {
      const response = await fetch("/api/v1/crm/channels", { credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível carregar os canais.");
      const payload = await response.json();
      setChannels(payload.channels || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os canais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadChannels(); }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const returnedAttempt = query.get("meta_attempt");
    const returnedError = query.get("meta_error");
    if (returnedError) {
      setError(returnedError === "authorization_cancelled" ? "A autorização Meta foi cancelada." : "Não foi possível concluir a autorização Meta. Tenta novamente.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (!returnedAttempt) return;
    setWorking(true);
    void fetch(`/api/v1/crm/meta/connect/preview?attemptId=${encodeURIComponent(returnedAttempt)}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("A autorização Meta expirou. Liga a conta novamente.");
        return response.json();
      })
      .then((payload) => {
        const foundPages = payload.pages || [];
        setPages(foundPages);
        setSelectedPages([]);
        setAttemptId(returnedAttempt);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar as Páginas autorizadas."))
      .finally(() => setWorking(false));
  }, []);

  async function startMetaConnection() {
    setError("");
    setNotice("");
    setWorking(true);
    try {
      const response = await fetch("/api/v1/crm/meta/connect", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.message || "A ligação Meta ainda não está pronta.");
      window.location.assign(payload.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a ligação Meta.");
      setWorking(false);
    }
  }

  async function completeMetaConnection() {
    if (!attemptId || !selectedPages.length) {
      setError("Seleciona pelo menos uma Página Facebook.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/v1/crm/meta/connect/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, pageIds: selectedPages }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível ligar as Páginas.");
      setPages(null);
      setAttemptId(null);
      setNotice("Canais autorizados. As novas mensagens aparecem quando a Meta as entregar; confirma as permissões da app para atendimento e comentários.");
      await loadChannels();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ligar as Páginas.");
    } finally {
      setWorking(false);
    }
  }

  async function saveWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/v1/crm/channels/whatsapp-cloud", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whatsApp),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível ligar o WhatsApp.");
      setWhatsApp({ accountName: "", phoneNumberId: "", accessToken: "" });
      setShowWhatsApp(false);
      setNotice("WhatsApp Cloud ligado. O token foi cifrado e não será apresentado novamente.");
      await loadChannels();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ligar o WhatsApp.");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect(channel: Channel) {
    if (!window.confirm(`Desligar ${channel.account_name}? As novas mensagens deste canal deixarão de entrar no CRM.`)) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/crm/channels/${channel.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível desligar o canal.");
      setNotice(`${channel.account_name} foi desligado.`);
      await loadChannels();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desligar o canal.");
    } finally {
      setWorking(false);
    }
  }

  async function checkChannel(channel: Channel) {
    setCheckingId(channel.id);
    setError("");
    try {
      const response = await fetch(`/api/v1/crm/channels/${channel.id}/diagnostics`, { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível verificar este canal.");
      setDiagnostics((current) => ({ ...current, [channel.id]: payload }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar este canal.");
    } finally {
      setCheckingId(null);
    }
  }

  return (
    <section className="crm-channel-manager" aria-labelledby="crm-channel-manager-title">
      <div className="crm-channel-manager-heading">
        <div>
          <p className="crm-channel-kicker">Canais da loja</p>
          <h2 id="crm-channel-manager-title">Canais de atendimento</h2>
          <p>{loading ? "A verificar ligações…" : `${channels.filter((channel) => channel.status === "connected").length} canais autorizados para receber eventos.`}</p>
        </div>
        <div className="crm-channel-manager-actions">
          <button type="button" className="button button-secondary" aria-expanded={expanded} aria-controls="crm-channel-details" onClick={() => setExpanded((open) => !open)}>{expanded ? "Fechar canais" : "Gerir canais"}</button>
        </div>
      </div>

      {error && <p className="crm-channel-feedback error" role="alert">{error}</p>}
      {notice && <p className="crm-channel-feedback success" role="status">{notice}</p>}

      <div id="crm-channel-details" hidden={!expanded && !pages && !showWhatsApp}>
      <p className="crm-channel-help">A ligação guarda o acesso da loja e recebe mensagens novas pelo webhook. O histórico anterior e os comentários ainda não são importados. Para responder no Facebook e Instagram, a app Meta precisa das permissões de mensagens e das permissões de comentários aprovadas para os clientes.</p>
      <div className="crm-channel-manager-actions crm-channel-connect-actions">
        <button type="button" className="button button-secondary" onClick={() => void startMetaConnection()} disabled={working}>Ligar Facebook e Instagram</button>
        <button type="button" className="button button-primary" onClick={() => setShowWhatsApp((shown) => !shown)} disabled={working}>Ligar WhatsApp</button>
      </div>
      {pages && (
        <div className="crm-channel-selection" aria-live="polite">
          <h3>Escolhe as Páginas a ligar</h3>
          <p>Seleciona apenas as Páginas desta loja. Uma conta Instagram só aparece se estiver profissional e associada à Página.</p>
          {pages.length ? pages.map((page) => (
            <label className="crm-meta-page-option" key={page.id}>
              <input type="checkbox" checked={selectedPages.includes(page.id)} onChange={(event) => setSelectedPages((current) => event.target.checked ? [...current, page.id] : current.filter((id) => id !== page.id))} />
              <span><strong>{page.name}</strong><small>{page.instagram ? `Instagram: ${page.instagram.username ? `@${page.instagram.username}` : page.instagram.name}` : "Sem Instagram profissional associado"}</small></span>
            </label>
          )) : <p className="crm-channel-empty" role="alert">A Meta não devolveu Páginas. Confirma que esta conta administra uma Página e que a configuração de Login da app PUVO concede pages_show_list, pages_manage_metadata e pages_messaging.</p>}
          <button type="button" className="button button-primary" onClick={() => void completeMetaConnection()} disabled={working || !pages.length || !selectedPages.length}>{working ? "A ligar…" : "Confirmar ligações"}</button>
        </div>
      )}

      {showWhatsApp && (
        <form className="crm-whatsapp-form" onSubmit={(event) => void saveWhatsApp(event)}>
          <label>Nome da conta<input required maxLength={120} value={whatsApp.accountName} onChange={(event) => setWhatsApp({ ...whatsApp, accountName: event.target.value })} placeholder="PUVO Atendimento" /></label>
          <label>Phone Number ID<input required value={whatsApp.phoneNumberId} onChange={(event) => setWhatsApp({ ...whatsApp, phoneNumberId: event.target.value })} autoComplete="off" /></label>
          <label>Token de acesso do System User<input required type="password" minLength={20} value={whatsApp.accessToken} onChange={(event) => setWhatsApp({ ...whatsApp, accessToken: event.target.value })} autoComplete="new-password" /></label>
          <p>Usa um token de longa duração. Depois de guardado, só poderá ser substituído, nunca revelado.</p>
          <button type="submit" className="button button-primary" disabled={working}>{working ? "A guardar…" : "Guardar ligação WhatsApp"}</button>
        </form>
      )}

      <div className="crm-channel-list" aria-busy={loading}>
        {loading ? <p className="crm-channel-empty">A carregar canais…</p> : channels.length ? channels.map((channel) => (
          <article className="crm-channel-row" key={channel.id}>
            <div><strong>{channelLabels[channel.channel_type]}</strong><span>{channel.account_name}</span><small>Última mensagem recebida: {channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleString("pt-AO") : "nenhuma mensagem recebida"}</small></div>
            <div className="crm-channel-row-actions"><span className={`crm-channel-status ${channel.status}`}>{channel.status === "connected" ? "Autorizado" : channel.status === "expired" ? "Expirado" : "Desligado"}</span>{["facebook_page", "instagram_direct"].includes(channel.channel_type) && <button type="button" className="button button-secondary" onClick={() => void checkChannel(channel)} disabled={checkingId === channel.id}>{checkingId === channel.id ? "A verificar…" : "Verificar acesso"}</button>}<button type="button" className="button button-secondary" onClick={() => void disconnect(channel)} disabled={working || channel.status === "disconnected"}>Desligar</button></div>
            {diagnostics[channel.id] && <div className="crm-channel-diagnostics" role="status">
              <strong>{diagnostics[channel.id].tokenValid && diagnostics[channel.id].appMatches ? "Token válido para a app PUVO" : "Token inválido ou de outra app — volta a ligar este canal"}</strong>
              <span>Mensagens: {diagnostics[channel.id].messagingMissing.length ? `faltam ${diagnostics[channel.id].messagingMissing.join(", ")}` : "permissões presentes no token"}.</span>
              <span>Comentários: {diagnostics[channel.id].commentsMissing.length ? `faltam ${diagnostics[channel.id].commentsMissing.join(", ")}` : "permissões presentes no token"}.</span>
              <small>Mesmo com as permissões no token, a Meta exige acesso aprovado para clientes em produção. Importação de histórico e gestão de comentários ainda não estão disponíveis no CRM.</small>
            </div>}
          </article>
        )) : <p className="crm-channel-empty">Ainda não tens canais ligados. Liga uma Página, Instagram ou WhatsApp para começar.</p>}
      </div>
      </div>
    </section>
  );
}
