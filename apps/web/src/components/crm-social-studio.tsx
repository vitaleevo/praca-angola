"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import "../app/crm.css";

type Channel = { id: string; channel_type: "facebook_page" | "instagram_direct"; account_name: string };
type PublishingCapability = { id: string; available: boolean; requiredPermission: string; reason: string | null };
type Listing = { id: string; title: string; price: string; images?: { url: string }[] };
type ListingDetail = Listing & { description: string };
type Post = { id: string; channel_ids: string[]; content: string; media_urls: string[]; listing_id: string | null; scheduled_for: string | null; status: string; error_message: string | null; meta_post_ids: Record<string, string> | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/crm/social/studio${path}`, { credentials: "include", cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Não foi possível concluir esta ação.");
  return payload as T;
}

const postState: Record<string, string> = { draft: "Rascunho", scheduled: "Agendado", publishing: "A publicar", published: "Publicado", failed: "Erro", cancelled: "Cancelado" };

function luandaDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Luanda", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function CrmSocialStudio() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [capabilities, setCapabilities] = useState<PublishingCapability[]>([]);
  const [capabilityError, setCapabilityError] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [listingId, setListingId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [connected, saved, products] = await Promise.all([
        fetch("/api/v1/crm/social/channels", { credentials: "include", cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar os canais da loja."); return response.json(); }) as Promise<{ channels: Channel[] }>,
        request<{ items: Post[] }>("/posts"),
        fetch("/api/v1/seller/listings", { credentials: "include", cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("Não foi possível carregar os produtos da loja."); return response.json(); }) as Promise<{ items: Listing[] }>,
      ]);
      setChannels(connected.channels ?? []);
      setPosts(saved.items ?? []);
      setListings((products.items ?? []).filter((item) => item.title));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o estúdio."); }
  }, []);
  const loadCapabilities = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/crm/social/publishing-capabilities", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível verificar o acesso de publicação na Meta.");
      const payload = await response.json() as { channels: PublishingCapability[] };
      setCapabilities(payload.channels ?? []);
      setCapabilityError("");
    } catch (cause) {
      setCapabilities([]);
      setCapabilityError(cause instanceof Error ? cause.message : "A verificação de acesso falhou.");
    }
  }, []);
  useEffect(() => { void load(); void loadCapabilities(); }, [load, loadCapabilities]);

  function reset() {
    setEditingId(null); setChannelIds([]); setContent(""); setMediaUrls([]); setListingId(""); setScheduledFor("");
  }

  async function uploadImage(file: File): Promise<string> {
    const response = await fetch("/api/v1/media?format=jpeg", {
      method: "POST", credentials: "include", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.url !== "string") throw new Error(typeof payload.message === "string" ? payload.message : "Falha ao carregar a fotografia.");
    return new URL(payload.url, window.location.origin).toString();
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    if (mediaUrls.length + files.length > 10) { setError("Podes incluir até 10 fotografias."); return; }
    setBusy(true); setError("");
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) uploaded.push(await uploadImage(file));
      setMediaUrls((current) => [...current, ...uploaded]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar a fotografia."); }
    finally { setBusy(false); }
  }

  async function importListing(id: string) {
    setListingId(id);
    if (!id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/seller/listings/${id}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível abrir o produto da loja.");
      const product = await response.json() as ListingDetail;
      const amount = Number(product.price).toLocaleString("pt-AO", { style: "currency", currency: "AOA" });
      setContent(`${product.title} · ${amount}\n\n${product.description}`.slice(0, 2200));
      const images: string[] = [];
      for (const image of (product.images ?? []).slice(0, 4)) {
        const source = await fetch(image.url, { credentials: "include" });
        if (!source.ok) continue;
        const blob = await source.blob();
        images.push(await uploadImage(new File([blob], "produto.jpg", { type: blob.type })));
      }
      setMediaUrls(images);
      setNotice("Produto e fotografias importados da tua loja.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao importar produto."); }
    finally { setBusy(false); }
  }

  async function saveDraft(): Promise<Post> {
    const payload = { channelIds, content, mediaUrls, listingId: listingId || undefined };
    const result = await request<{ post: Post }>(editingId ? `/posts/${editingId}` : "/posts", {
      method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setEditingId(result.post.id);
    await load();
    return result.post;
  }

  async function act(action: "draft" | "schedule" | "publish") {
    setBusy(true); setError(""); setNotice("");
    try {
      const post = await saveDraft();
      if (action === "schedule") {
        if (!scheduledFor) throw new Error("Escolhe a data e hora em Luanda.");
        const when = new Date(`${scheduledFor}:00+01:00`);
        await request(`/posts/${post.id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledFor: when.toISOString() }) });
      }
      if (action === "publish") {
        const result = await request<{ post: Post }>(`/posts/${post.id}/publish`, { method: "POST" });
        if (result.post.status === "failed") throw new Error(result.post.error_message ?? "A Meta não confirmou a publicação.");
      }
      setNotice(action === "draft" ? "Rascunho guardado." : action === "schedule" ? "Publicação agendada." : "Publicação confirmada pela Meta.");
      reset(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao guardar publicação."); await load(); }
    finally { setBusy(false); }
  }

  async function cancel(post: Post) {
    setBusy(true); setError("");
    try { await request(`/posts/${post.id}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cancelar."); }
    finally { setBusy(false); }
  }

  const previewName = channels.find((item) => channelIds.includes(item.id))?.account_name ?? "A tua loja";
  const publishingReady = channelIds.length > 0 && channelIds.every((id) => capabilities.some((capability) => capability.id === id && capability.available));
  return <section className="crm-studio">
    <div className="crm-studio-layout">
      <div className="crm-studio-card">
        <h2>Nova publicação</h2>
        <p>Prepara uma publicação para as Páginas ligadas à tua loja. A Meta precisa de conceder acesso a publicar em cada canal.</p>
        <fieldset><legend>Destinos</legend>{channels.length ? channels.map((channel) => {
          const capability = capabilities.find((item) => item.id === channel.id);
          return <div key={channel.id}><label className="crm-studio-channel"><input type="checkbox" checked={channelIds.includes(channel.id)} onChange={(event) => setChannelIds((current) => event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id))} /> {channel.channel_type === "facebook_page" ? "Facebook" : "Instagram"} · {channel.account_name}</label><small className={capability?.available ? "crm-studio-access-ok" : "crm-studio-access-wait"}>{capability?.available ? "Acesso de publicação confirmado" : capability?.reason ?? "A confirmar acesso de publicação…"}</small></div>;
        }) : <span>Nenhuma Página ou conta profissional ligada. <Link href="/vendedor/crm/conversas">Gerir canais</Link>.</span>}</fieldset>
        {channels.length > 0 && <div className="crm-studio-access-actions"><button type="button" disabled={busy} onClick={() => void loadCapabilities()}>Verificar acesso</button><Link href="/vendedor/crm/conversas">Gerir ligações</Link></div>}
        {capabilityError && <p role="alert" className="crm-social-error">{capabilityError}</p>}
        <label>Importar do catálogo PUVO<select value={listingId} disabled={busy} onChange={(event) => void importListing(event.target.value)}><option value="">Escolher produto</option>{listings.map((item) => <option key={item.id} value={item.id}>{item.title} · {Number(item.price).toLocaleString("pt-AO")} Kz</option>)}</select></label>
        <label>Legenda<textarea rows={7} maxLength={2200} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Conta aos clientes o que há de novo na tua loja…" /><small>{content.length}/2200 caracteres</small></label>
        <div className="crm-studio-suggestions">{["#VendasAngola", "#LuandaNegocios", "#ComercioAO", "✨", "🇦🇴"].map((suggestion) => <button key={suggestion} type="button" onClick={() => setContent((current) => `${current}${current ? " " : ""}${suggestion}`.slice(0, 2200))}>{suggestion}</button>)}</div>
        <label>Fotografias JPEG (até 10)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || mediaUrls.length >= 10} onChange={(event) => void onUpload(event.target.files)} /></label>
        {!!mediaUrls.length && <div className="crm-studio-media">{mediaUrls.map((url, index) => <div key={url}><Image src={url} alt={`Fotografia ${index + 1}`} width={110} height={110} unoptimized /><button type="button" aria-label={`Remover fotografia ${index + 1}`} onClick={() => setMediaUrls((current) => current.filter((item) => item !== url))}>×</button>{index > 0 && <button type="button" aria-label={`Mover fotografia ${index + 1} para a esquerda`} onClick={() => setMediaUrls((current) => { const copy = [...current]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })}>←</button>}</div>)}</div>}
        <label>Agendar em Luanda (UTC+1)<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
        <div className="crm-studio-actions"><button type="button" disabled={busy} onClick={() => void act("draft")}>Guardar rascunho</button><button type="button" disabled={busy || !content.trim() || !publishingReady || !scheduledFor} onClick={() => void act("schedule")}>Agendar</button><button type="button" disabled={busy || !content.trim() || !publishingReady} onClick={() => void act("publish")}>Publicar agora</button></div>
        {busy && <p role="status">A processar…</p>}{error && <p role="alert" className="crm-social-error">{error}</p>}{notice && <p role="status" className="crm-social-success">{notice}</p>}
      </div>
      <div className="crm-studio-previews"><h2>Pré-visualização</h2><div className="crm-studio-preview"><strong>Facebook · {previewName}</strong><small>Publicado agora · Público</small><p>{content || "A tua legenda aparece aqui."}</p>{mediaUrls[0] && <Image src={mediaUrls[0]} alt="Prévia Facebook" width={480} height={360} unoptimized />}<footer>Gosto　 Comentar　 Partilhar</footer></div><div className="crm-studio-preview is-instagram"><strong>Instagram · @{previewName.replaceAll(" ", "").toLowerCase()}</strong>{mediaUrls[0] ? <Image src={mediaUrls[0]} alt="Prévia Instagram" width={480} height={480} unoptimized /> : <div className="crm-studio-placeholder">A fotografia aparece aqui</div>}<p>♡　♧　↗</p><p>{content || "A tua legenda aparece aqui."}</p></div></div>
    </div>
    <div className="crm-studio-card"><h2>Rascunhos e agendamentos</h2>{!posts.length && <p>Sem publicações guardadas.</p>}<div className="crm-studio-queue">{posts.map((post) => <article key={post.id}><span className={`crm-studio-state is-${post.status}`}>{postState[post.status] ?? post.status}</span><p>{post.content || "Sem legenda"}</p><small>{post.scheduled_for ? `Agendado para ${new Date(post.scheduled_for).toLocaleString("pt-AO", { timeZone: "Africa/Luanda" })}` : "Sem data"} · {post.channel_ids.length} destinos</small>{post.error_message && <small className="crm-social-error">{post.error_message}</small>}<div className="crm-studio-actions">{["draft", "scheduled", "failed"].includes(post.status) && <><button type="button" disabled={busy} onClick={() => { setEditingId(post.id); setChannelIds(post.channel_ids); setContent(post.content); setMediaUrls(post.media_urls); setListingId(post.listing_id ?? ""); setScheduledFor(post.scheduled_for ? luandaDateTime(post.scheduled_for) : ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button><button type="button" disabled={busy} onClick={() => void cancel(post)}>Cancelar</button></>}</div></article>)}</div></div>
  </section>;
}
