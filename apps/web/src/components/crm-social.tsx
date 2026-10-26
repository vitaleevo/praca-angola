"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "../app/crm.css";

type Channel = { id: string; channel_type: "facebook_page" | "instagram_direct"; account_name: string };
type Media = { ref: string; text: string; createdAt: string | null; permalink: string | null; mediaType: string | null; commentsCount: number | null };
type Comment = { ref: string; text: string; author: string; createdAt: string | null };
type Page<T> = { items: T[]; next?: string };
type Profile = { name: string; username: string | null; description: string | null; followers: number | null; mediaCount: number | null; website: string | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/crm/social${path}`, { credentials: "include", cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "A Meta não devolveu estes dados. Verifica as permissões em Canais de atendimento.");
  return payload as T;
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-AO", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function CrmSocial() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelId, setChannelId] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  const [mediaNext, setMediaNext] = useState<string | undefined>();
  const [selected, setSelected] = useState<Media | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsNext, setCommentsNext] = useState<string | undefined>();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const commentsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api<{ channels: Channel[] }>("/channels").then((result) => {
      if (!active) return;
      setChannels(result.channels);
      setChannelId(result.channels[0]?.id ?? "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os canais."); })
      .finally(() => { if (active) setChannelsLoading(false); });
    return () => { active = false; };
  }, []);

  const loadMedia = useCallback(async (id: string, after?: string) => {
    if (!id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<Page<Media>>(`/channels/${id}/media${after ? `?after=${encodeURIComponent(after)}` : ""}`);
      setMedia((previous) => after ? [...previous, ...result.items] : result.items);
      setMediaNext(result.next);
      if (!after) { setSelected(null); setComments([]); setCommentsNext(undefined); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar publicações."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!channelId) return;
    setProfile(null);
    setMissingPermissions([]);
    setMedia([]);
    setMediaNext(undefined);
    setSelected(null);
    setComments([]);
    setCommentsNext(undefined);
    void loadMedia(channelId);
    let active = true;
    api<Profile>(`/channels/${channelId}/profile`).then((result) => { if (active) setProfile(result); }).catch(() => {});
    fetch(`/api/v1/crm/channels/${channelId}/diagnostics`, { credentials: "include", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { commentsMissing?: string[] } | null) => { if (active) setMissingPermissions(result?.commentsMissing ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [channelId, loadMedia]);

  async function loadComments(item: Media, after?: string, scrollToPanel = false) {
    if (!channelId) return;
    setBusy(true); setError(""); setNotice("");
    if (!after) { setSelected(item); setComments([]); setCommentsNext(undefined); }
    try {
      const query = new URLSearchParams({ mediaRef: item.ref });
      if (after) query.set("after", after);
      const result = await api<Page<Comment>>(`/channels/${channelId}/comments?${query}`);
      setSelected(item);
      setComments((previous) => after ? [...previous, ...result.items] : result.items);
      setCommentsNext(result.next);
      if (scrollToPanel && window.matchMedia("(max-width: 1023px)").matches) {
        requestAnimationFrame(() => commentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar comentários."); }
    finally { setBusy(false); }
  }

  async function sendReply(comment: Comment) {
    const message = reply[comment.ref]?.trim();
    if (!channelId || !message) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ sent: boolean }>(`/channels/${channelId}/comments/replies`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentRef: comment.ref, message }),
      });
      if (!result.sent) throw new Error("A Meta não confirmou a resposta.");
      setReply((previous) => ({ ...previous, [comment.ref]: "" }));
      if (selected) await loadComments(selected);
      setNotice("Resposta publicada na rede social.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível responder."); }
    finally { setBusy(false); }
  }

  return <section className="crm-social" aria-label="Gestão de redes sociais">
    <div className="crm-social-toolbar">
      <label>Canal da loja
        <select value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!channels.length || busy}>
          {channels.length ? channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.channel_type === "facebook_page" ? "Facebook" : "Instagram"} · {channel.account_name}</option>) : <option value="">Nenhum canal ligado</option>}
        </select>
      </label>
      <button type="button" onClick={() => void loadMedia(channelId)} disabled={!channelId || busy}>Atualizar</button>
    </div>
    <p className="crm-social-hint">Publicações e comentários disponíveis na Meta. A importação depende das permissões concedidas a esta Página e à app PUVO.</p>
    {!channelsLoading && !channels.length && !error && <div className="crm-social-empty">Ainda não há redes sociais ligadas a esta loja. <Link href="/vendedor/crm/conversas">Ligar um canal no Live Inbox</Link> para começar.</div>}
    {missingPermissions.length > 0 && <p role="status" className="crm-social-error">A Meta concedeu acesso parcial aos comentários. Nomes dos autores ou respostas podem falhar até autorizares novamente o canal com: {missingPermissions.join(", ")}.</p>}
    {profile && <div className="crm-social-profile"><strong>{profile.name}</strong>{profile.username && <span>@{profile.username}</span>}{profile.followers !== null && <span>{profile.followers.toLocaleString("pt-AO")} seguidores</span>}{profile.mediaCount !== null && <span>{profile.mediaCount.toLocaleString("pt-AO")} publicações</span>}{profile.description && <p>{profile.description}</p>}{profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer">Website</a>}</div>}
    {busy && <p role="status">A carregar dados da Meta…</p>}
    {error && <p role="alert" className="crm-social-error">{error}</p>}
    {notice && <p role="status" className="crm-social-success">{notice}</p>}
    <div className="crm-social-grid">
      <div className="crm-social-panel">
        <div className="crm-social-panel-header"><h2>Publicações</h2><p>{media.length ? `${media.length} publicações carregadas · Seleciona uma para gerir comentários.` : "Conteúdo do canal selecionado"}</p></div>
        <div className="crm-social-list">
        {!busy && channelId && !media.length && <p className="crm-social-empty">Não há publicações disponíveis para este canal.</p>}
        {media.map((item) => <article key={item.ref} className={selected?.ref === item.ref ? "crm-social-card is-selected" : "crm-social-card"}>
          <p className="crm-social-excerpt">{item.text || (item.mediaType ? `Publicação ${item.mediaType.toLowerCase()}` : "Publicação sem texto")}</p>
          <small>{date(item.createdAt)}{item.commentsCount !== null ? ` · ${item.commentsCount} comentários` : ""}</small>
          <div className="crm-social-actions"><button type="button" onClick={() => void loadComments(item, undefined, true)} disabled={busy} aria-pressed={selected?.ref === item.ref}>Ver comentários</button>{item.permalink && <a href={item.permalink} target="_blank" rel="noopener noreferrer">Ver original</a>}</div>
        </article>)}
        </div>
        {mediaNext && <button className="crm-social-more" type="button" onClick={() => void loadMedia(channelId, mediaNext)} disabled={busy}>Carregar mais publicações</button>}
      </div>
      <div className="crm-social-panel crm-social-comments" ref={commentsPanelRef}>
        <div className="crm-social-panel-header"><h2>Comentários</h2><p>{selected ? `${comments.length} comentários carregados para esta publicação` : "Responde aos clientes sem sair da PUVO"}</p></div>
        <div className="crm-social-list">
        {!selected ? <p className="crm-social-empty">Escolhe uma publicação para ver e responder aos comentários.</p> : <>
          {!busy && !comments.length && <p className="crm-social-empty">Esta publicação não tem comentários disponíveis.</p>}
          {comments.map((comment) => <article key={comment.ref} className="crm-social-card">
            <strong>{comment.author}</strong><small>{date(comment.createdAt)}</small><p>{comment.text}</p>
            <label>Responder a {comment.author}<textarea rows={2} maxLength={1000} value={reply[comment.ref] ?? ""} onChange={(event) => setReply((previous) => ({ ...previous, [comment.ref]: event.target.value }))} /></label>
            <button type="button" onClick={() => void sendReply(comment)} disabled={busy || !reply[comment.ref]?.trim()}>Publicar resposta</button>
          </article>)}
          {commentsNext && <button type="button" onClick={() => void loadComments(selected, commentsNext)} disabled={busy}>Carregar mais comentários</button>}
        </>}
        </div>
      </div>
    </div>
  </section>;
}
