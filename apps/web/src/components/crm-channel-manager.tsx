"use client";

import { FormEvent, useEffect, useState } from "react";

type EmbeddedSignupConfig = { appId: string; configId: string; graphVersion: string };
type EmbeddedSignupResult = { code: string; wabaId: string; phoneNumberId?: string; event: string };
type FacebookSdk = { init: (options: Record<string, unknown>) => void; login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void };
declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

let sdkReady: Promise<void> | null = null;
function loadFacebookSdk(config: EmbeddedSignupConfig): Promise<void> {
  if (window.FB) { window.FB.init({ appId: config.appId, autoLogAppEvents: false, xfbml: false, version: config.graphVersion }); return Promise.resolve(); }
  if (sdkReady) return sdkReady;
  sdkReady = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => { window.FB?.init({ appId: config.appId, autoLogAppEvents: false, xfbml: false, version: config.graphVersion }); resolve(); };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_PT/sdk.js";
    script.async = true;
    script.onerror = () => { sdkReady = null; reject(new Error("Não foi possível carregar a ligação segura da Meta.")); };
    document.head.appendChild(script);
  });
  return sdkReady;
}

function openWhatsAppSignup(config: EmbeddedSignupConfig): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    let code: string | undefined;
    let session: { event: string; data?: { waba_id?: string; phone_number_id?: string } } | undefined;
    const cleanup = () => { window.removeEventListener("message", onMessage); window.clearTimeout(timer); };
    const finish = () => {
      if (!code || !session) return;
      if (session.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || !session.data?.waba_id) {
        cleanup(); reject(new Error("Seleciona um número que já utiliza a app WhatsApp Business e conclui a leitura do QR na Meta.")); return;
      }
      cleanup(); resolve({ code, wabaId: session.data.waba_id, phoneNumberId: session.data.phone_number_id, event: session.event });
    };
    const onMessage = (message: MessageEvent) => {
      try {
        const hostname = new URL(message.origin).hostname;
        if (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com")) return;
        const payload = typeof message.data === "string" ? JSON.parse(message.data) : message.data;
        if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (payload.event === "CANCEL" || payload.event === "ERROR") { cleanup(); reject(new Error("A ligação WhatsApp foi cancelada na Meta.")); return; }
        if (typeof payload.event === "string") { session = payload; finish(); }
      } catch { /* Other window messages are unrelated to Embedded Signup. */ }
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("A autorização WhatsApp expirou. Tenta novamente.")); }, 30 * 60_000);
    window.addEventListener("message", onMessage);
    try {
      window.FB?.login((response) => {
        if (!response.authResponse?.code) { cleanup(); reject(new Error("A ligação WhatsApp foi cancelada na Meta.")); return; }
        code = response.authResponse.code;
        finish();
      }, {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3", version: "v4-public-preview" },
      });
    } catch { cleanup(); reject(new Error("Não foi possível abrir a autorização da Meta. Permite janelas desta página.")); }
  });
}

type Channel = {
  id: string;
  channel_type: "facebook_page" | "instagram_direct" | "whatsapp_cloud" | "whatsapp_instance";
  account_name: string;
  status: "connected" | "disconnected" | "expired";
  last_sync_at: string | null;
  whatsapp_history_progress?: number | null;
  whatsapp_history_declined?: boolean | null;
  whatsapp_history_requested_at?: string | null;
};

type MetaPage = { id: string; name: string; instagram: { id: string; name: string; username?: string } | null };
type ChannelDiagnostics = {
  connected: boolean;
  tokenValid: boolean;
  appMatches: boolean;
  expiresAt: number | null;
  messagingMissing: string[];
  commentsMissing: string[];
  pageWebhookSubscribed: boolean | null;
  pageWebhookFields: string[];
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
  const [whatsAppConfig, setWhatsAppConfig] = useState<EmbeddedSignupConfig | null>(null);
  const [whatsAppReady, setWhatsAppReady] = useState(false);
  const [whatsAppSetupError, setWhatsAppSetupError] = useState(false);
  const [whatsAppPrepareCount, setWhatsAppPrepareCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [whatsApp, setWhatsApp] = useState({ accountName: "", phoneNumberId: "", accessToken: "" });
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [syncingWhatsAppId, setSyncingWhatsAppId] = useState<string | null>(null);
  const [historyNext, setHistoryNext] = useState<Record<string, string | null>>({});
  const [historyResult, setHistoryResult] = useState<Record<string, string>>({});
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
    if (!expanded || whatsAppReady) return;
    let active = true;
    void fetch("/api/v1/crm/whatsapp/embedded-signup/config", { credentials: "include" })
      .then(async (response) => { if (!response.ok) throw new Error("WhatsApp indisponível"); return response.json() as Promise<EmbeddedSignupConfig>; })
      .then(async (config) => { await loadFacebookSdk(config); if (active) { setWhatsAppConfig(config); setWhatsAppReady(true); setWhatsAppSetupError(false); } })
      .catch(() => { if (active) setWhatsAppSetupError(true); });
    return () => { active = false; };
  }, [expanded, whatsAppReady, whatsAppPrepareCount]);

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

  async function startWhatsAppByQr() {
    if (!whatsAppConfig || !whatsAppReady) return;
    setError(""); setNotice(""); setWorking(true);
    // Both operations start in the click gesture, so the Meta popup is not blocked.
    const attemptPromise = fetch("/api/v1/crm/whatsapp/embedded-signup/start", { method: "POST", credentials: "include" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "Não foi possível iniciar a ligação WhatsApp."); return payload as { attemptId: string }; });
    const signupPromise = openWhatsAppSignup(whatsAppConfig);
    try {
      const [attempt, signup] = await Promise.all([attemptPromise, signupPromise]);
      const response = await fetch("/api/v1/crm/whatsapp/embedded-signup/finish", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signup, attemptId: attempt.attemptId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível concluir a ligação WhatsApp.");
      setNotice(payload.syncRequested
        ? `WhatsApp ${payload.phoneNumber || "Business"} ligado. A sincronização de contactos e conversas foi pedida à Meta.`
        : `WhatsApp ${payload.phoneNumber || "Business"} ligado. A sincronização precisa de verificação; as novas mensagens já podem chegar.`);
      await loadChannels();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ligar o WhatsApp."); }
    finally { setWorking(false); }
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

  async function importHistory(channel: Channel) {
    setImportingId(channel.id);
    setError(""); setNotice("");
    try {
      const after = historyNext[channel.id];
      const response = await fetch(`/api/v1/crm/channels/${channel.id}/import-history`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(after ? { after } : {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "A Meta não permitiu importar estas conversas. Verifica o acesso do canal.");
      setHistoryNext((current) => ({ ...current, [channel.id]: payload.next || null }));
      const summary = `${payload.messages} ${payload.messages === 1 ? "mensagem importada" : "mensagens importadas"} de ${payload.conversations} ${payload.conversations === 1 ? "conversa" : "conversas"} em ${channel.account_name}.`;
      setHistoryResult((current) => ({ ...current, [channel.id]: summary }));
      setNotice(summary);
      window.dispatchEvent(new Event("crm-history-imported"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar o histórico.");
    } finally { setImportingId(null); }
  }

  async function retryWhatsAppSync(channel: Channel) {
    setSyncingWhatsAppId(channel.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/crm/channels/${channel.id}/whatsapp-sync/retry`, { method: "POST", credentials: "include" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível pedir a sincronização WhatsApp.");
      setNotice(payload.syncRequested
        ? `Sincronização de ${channel.account_name} pedida à Meta. As conversas podem levar alguns minutos a aparecer.`
        : `A Meta ainda não aceitou toda a sincronização de ${channel.account_name}. Tenta novamente dentro de 24 horas.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível sincronizar o WhatsApp."); }
    finally { setSyncingWhatsAppId(null); }
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
      <p className="crm-channel-help">A ligação guarda o acesso da loja e recebe mensagens novas pelo webhook. Consulta publicações e responde a comentários em Redes sociais. Para trazer conversas anteriores, usa “Importar histórico” em cada canal Facebook ou Instagram; a Meta pode limitar o que está disponível.</p>
      <div className="crm-channel-manager-actions crm-channel-connect-actions">
        <button type="button" className="button button-secondary" onClick={() => void startMetaConnection()} disabled={working}>Ligar Facebook e Instagram</button>
        <button type="button" className="button button-primary" onClick={() => whatsAppSetupError ? setWhatsAppPrepareCount((count) => count + 1) : void startWhatsAppByQr()} disabled={working || (!whatsAppReady && !whatsAppSetupError)}>{working ? "A ligar…" : whatsAppReady ? "Ligar WhatsApp por QR" : whatsAppSetupError ? "Tentar preparar WhatsApp" : "A preparar WhatsApp…"}</button>
      </div>
      <p className="crm-channel-help">Para manteres o número na app WhatsApp Business, introduz esse número na janela da Meta e confirma no telemóvel pelo QR ou código que ela apresentar. A Meta pode pedir autorização para partilhar o histórico.</p>
      <button type="button" className="button button-secondary" aria-expanded={showWhatsApp} onClick={() => setShowWhatsApp((shown) => !shown)} disabled={working}>{showWhatsApp ? "Ocultar ligação manual" : "Ligação manual com token"}</button>
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
            <div><strong>{channelLabels[channel.channel_type]}</strong><span>{channel.account_name}</span><small>Última mensagem recebida: {channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleString("pt-AO") : "nenhuma mensagem recebida"}</small>{channel.channel_type === "whatsapp_cloud" && channel.whatsapp_history_declined && <small>Histórico não partilhado no WhatsApp Business.</small>}{channel.channel_type === "whatsapp_cloud" && !channel.whatsapp_history_declined && channel.whatsapp_history_progress !== null && channel.whatsapp_history_progress !== undefined && <small>Histórico: {channel.whatsapp_history_progress}% recebido da Meta.</small>}{channel.channel_type === "whatsapp_cloud" && !channel.whatsapp_history_declined && channel.whatsapp_history_progress == null && channel.whatsapp_history_requested_at && <small>A aguardar histórico da Meta.</small>}</div>
            <div className="crm-channel-row-actions"><span className={`crm-channel-status ${channel.status}`}>{channel.status === "connected" ? "Autorizado" : channel.status === "expired" ? "Expirado" : "Desligado"}</span>{["facebook_page", "instagram_direct"].includes(channel.channel_type) && <><button type="button" className="button button-secondary" onClick={() => void checkChannel(channel)} disabled={checkingId === channel.id}>{checkingId === channel.id ? "A verificar…" : "Verificar acesso"}</button><button type="button" className="button button-secondary" onClick={() => void importHistory(channel)} disabled={channel.status !== "connected" || importingId !== null}>{importingId === channel.id ? "A importar…" : historyNext[channel.id] ? "Carregar mais histórico" : "Importar histórico"}</button></>}{channel.channel_type === "whatsapp_cloud" && channel.status === "connected" && <button type="button" className="button button-secondary" onClick={() => void retryWhatsAppSync(channel)} disabled={syncingWhatsAppId !== null}>{syncingWhatsAppId === channel.id ? "A sincronizar…" : "Sincronizar histórico"}</button>}<button type="button" className="button button-secondary" onClick={() => void disconnect(channel)} disabled={working || channel.status === "disconnected"}>Desligar</button></div>
            {historyResult[channel.id] && <p className="crm-channel-history-result" role="status">{historyResult[channel.id]} {historyNext[channel.id] ? "Há mais conversas disponíveis." : "Podes repetir sem criar duplicados."}</p>}
            {diagnostics[channel.id] && <div className="crm-channel-diagnostics" role="status">
              <strong>{diagnostics[channel.id].tokenValid && diagnostics[channel.id].appMatches ? "Token válido para a app PUVO" : "Token inválido ou de outra app — volta a ligar este canal"}</strong>
              <span>Mensagens: {diagnostics[channel.id].messagingMissing.length ? `faltam ${diagnostics[channel.id].messagingMissing.join(", ")}` : "permissões presentes no token"}.</span>
              <span>Comentários: {diagnostics[channel.id].commentsMissing.length ? `faltam ${diagnostics[channel.id].commentsMissing.join(", ")}` : "permissões presentes no token"}.</span>
              {channel.channel_type === "facebook_page" && <span>Webhook da Página: {diagnostics[channel.id].pageWebhookSubscribed === null ? "não foi possível verificar" : diagnostics[channel.id].pageWebhookSubscribed ? diagnostics[channel.id].pageWebhookFields.includes("messages") ? "app inscrita para mensagens" : "app inscrita, mas sem o campo messages" : "app não inscrita nesta Página"}.</span>}
              <small>Consulta publicações e comentários em Redes sociais. Para lojas externas à equipa de testes, a Meta exige acesso aprovado no App Review. A importação de histórico depende das permissões deste canal e dos limites da Meta.</small>
            </div>}
          </article>
        )) : <p className="crm-channel-empty">Ainda não tens canais ligados. Liga uma Página, Instagram ou WhatsApp para começar.</p>}
      </div>
      </div>
    </section>
  );
}
