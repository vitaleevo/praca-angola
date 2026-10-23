"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Listing, kwanza } from "../lib/api";

type Order = { id: string; reference: string; status: string; payment_status: string; total_amount: string; created_at: string; store_name: string; is_buyer: boolean };
type Conversation = { id: string; listing_id: string; listing_slug: string; listing_title: string; other_party: string; last_message: string; unread_count: number; updated_at: string };

export function AccountList({ kind }: { kind: "orders" | "favorites" | "messages" }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const endpoint = kind === "orders" ? "/orders" : kind === "favorites" ? "/favorites" : "/conversations";
    fetch(`/api/v1${endpoint}`, { credentials: "include" }).then(async (response) => {
      if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return; }
      const data = await response.json() as { items?: Order[] & Listing[] & Conversation[]; message?: string };
      if (!response.ok) { setError(data.message ?? "Não foi possível carregar esta área."); return; }
      if (kind === "orders") setOrders((data.items ?? []) as Order[]);
      if (kind === "favorites") setFavorites((data.items ?? []) as Listing[]);
      if (kind === "messages") setConversations((data.items ?? []) as Conversation[]);
    }).catch(() => setError("Sem ligação ao servidor."));
  }, [kind, router]);
  if (error) return <div className="empty-state"><b>{error}</b></div>;
  if (kind === "orders") return orders.length ? <div className="account-list">{orders.map((order) => <Link className="account-list-item" href={`/conta/encomendas/${order.id}`} key={order.id}><span><b>{order.reference}</b><small>{order.is_buyer ? "Compra" : "Venda"} · {order.store_name} · {new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium" }).format(new Date(order.created_at))}</small></span><span><b>{kwanza(order.total_amount)}</b><small>{order.status.replaceAll("_", " ")}</small></span><span aria-hidden="true">→</span></Link>)}</div> : <div className="empty-state empty-state-large"><b>Ainda não tens encomendas.</b><span>As tuas compras e vendas aparecem aqui.</span><Link className="button button-secondary" href="/produtos">Explorar produtos</Link></div>;
  if (kind === "favorites") return favorites.length ? <div className="product-grid">{favorites.map((product) => <article className="product-card" key={product.id}><Link className="product-visual" href={`/produtos/${product.slug}`}>{product.images?.[0] ? <Image src={product.images[0].url} alt={product.images[0].alt || product.title} fill sizes="(max-width:767px) 48vw, 300px" unoptimized /> : <span className="product-placeholder">{product.title.slice(0,1)}</span>}</Link><div className="product-info"><Link className="product-name" href={`/produtos/${product.slug}`}>{product.title}</Link><b className="product-price">{kwanza(product.price)}</b><span className="product-location">⌖ {product.province} · {product.municipality}</span></div></article>)}</div> : <div className="empty-state empty-state-large"><b>Ainda não guardaste produtos.</b><span>Guarda um produto para voltar a encontrá-lo facilmente.</span><Link className="button button-secondary" href="/produtos">Explorar produtos</Link></div>;
  return conversations.length ? <div className="account-list">{conversations.map((conversation) => <Link className="account-list-item" href={`/conta/mensagens/${conversation.id}`} key={conversation.id}><span><b>{conversation.other_party}</b><small>{conversation.listing_title} · {conversation.last_message}</small></span><span>{conversation.unread_count > 0 && <b className="unread-badge">{conversation.unread_count}</b>}</span><span aria-hidden="true">→</span></Link>)}</div> : <div className="empty-state empty-state-large"><b>Não tens mensagens.</b><span>Fala com uma loja a partir da página de um produto.</span><Link className="button button-secondary" href="/produtos">Explorar produtos</Link></div>;
}

export function MessageThread({ id }: { id: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<{ id: string; sender_id: string; body: string; created_at: string }[]>([]);
  const [myId, setMyId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const fetchThread = useCallback(async () => {
    const [response, me] = await Promise.all([fetch(`/api/v1/conversations/${id}/messages`, { credentials: "include" }), fetch("/api/v1/auth/me", { credentials: "include" })]);
    if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return null; }
    const data = await response.json().catch(() => ({})) as { items?: { id: string; sender_id: string; body: string; created_at: string }[]; message?: string };
    if (!response.ok) throw new Error(data.message ?? "Conversa indisponível.");
    const meData = await me.json().catch(() => ({})) as { user?: { id: string } };
    return { messages: data.items ?? [], myId: meData.user?.id ?? "" };
  }, [id, router]);
  useEffect(() => {
    let active = true;
    fetchThread()
      .then((thread) => { if (active && thread) { setMessages(thread.messages); setMyId(thread.myId); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a conversa."); });
    return () => { active = false; };
  }, [fetchThread]);
  async function load() {
    try {
      const thread = await fetchThread();
      if (thread) { setMessages(thread.messages); setMyId(thread.myId); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a conversa.");
    }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const response = await fetch(`/api/v1/conversations/${id}/messages`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const data = await response.json().catch(() => ({})) as { message?: string };
    if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return; }
    if (!response.ok) { setError(data.message ?? "Não foi possível enviar."); return; }
    setBody(""); await load();
  }
  return <div className="message-thread"><div className="message-list" aria-live="polite">{messages.map((message) => <article className={`message-bubble ${message.sender_id === myId ? "mine" : "theirs"}`} key={message.id}><p>{message.body}</p><time>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.created_at))}</time></article>)}</div><form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-body">Escreve a mensagem</label><textarea id="message-body" value={body} required maxLength={3000} onChange={(event) => setBody(event.target.value)} placeholder="Escreve uma mensagem…"/><button className="button button-primary" type="submit">Enviar</button></form>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
