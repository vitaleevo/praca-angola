"use client";

import { useState } from "react";

type CartLine = { listingId: string; slug: string; title: string; price: string; quantity: number; image?: string };

async function requireSession(response: Response): Promise<boolean> {
  if (response.status === 401) { window.location.href = "/entrar?next=" + encodeURIComponent(window.location.pathname); return false; }
  return true;
}

export function AddToCartButton({ product }: { product: Omit<CartLine, "quantity"> }) {
  const [added, setAdded] = useState(false);
  return <button className="button button-primary" type="button" onClick={() => {
    const cart = JSON.parse(localStorage.getItem("praca-cart") || "[]") as CartLine[];
    const existing = cart.find((line) => line.listingId === product.listingId);
    if (existing) existing.quantity += 1;
    else cart.push({ ...product, quantity: 1 });
    localStorage.setItem("praca-cart", JSON.stringify(cart));
    setAdded(true);
    window.dispatchEvent(new Event("praca-cart-updated"));
  }}>{added ? "Adicionado ao carrinho ✓" : "Adicionar ao carrinho"}</button>;
}

export function FavoriteButton({ listingId }: { listingId: string }) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    const response = await fetch(saved ? "/api/v1/favorites/remove" : "/api/v1/favorites", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) });
    if (!await requireSession(response)) return;
    if (!response.ok) { setMessage("Não foi possível guardar este produto."); return; }
    setSaved(!saved);
    setMessage(saved ? "Removido dos favoritos." : "Guardado nos favoritos.");
  }
  return <div><button className="button button-secondary" type="button" onClick={toggle}>{saved ? "♥ Guardado" : "♡ Guardar"}</button>{message && <span className="sr-only" role="status">{message}</span>}</div>;
}

export function ContactSellerForm({ listingId }: { listingId: string }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/v1/conversations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, body: message }) });
    if (!await requireSession(response)) return;
    const data = await response.json().catch(() => ({})) as { conversationId?: string; message?: string };
    if (!response.ok || !data.conversationId) { setStatus(data.message ?? "Não foi possível enviar a mensagem."); return; }
    window.location.href = `/conta/mensagens/${data.conversationId}`;
  }
  return <form className="stack-form contact-form" onSubmit={submit}><label htmlFor="seller-message">Mensagem para a loja</label><textarea id="seller-message" required minLength={1} maxLength={3000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Olá, este produto ainda está disponível?"/><button className="button button-secondary" type="submit">Falar com a loja</button>{status && <p className="form-status" role="status">{status}</p>}</form>;
}

export function ReportListingButton({ listingId }: { listingId: string }) {
  const [status, setStatus] = useState("");
  async function report() {
    const reason = window.prompt("Indica o motivo: produto proibido, informação enganosa, duplicado, suspeita de fraude ou outro.");
    if (!reason) return;
    const response = await fetch("/api/v1/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, reason: reason.toLowerCase().includes("fraude") ? "suspected_fraud" : reason.toLowerCase().includes("proibido") ? "prohibited_item" : reason.toLowerCase().includes("duplicado") ? "duplicate" : reason.toLowerCase().includes("enganosa") ? "misleading" : "other", details: reason }) });
    if (!await requireSession(response)) return;
    setStatus(response.ok ? "Denúncia enviada à equipa de moderação." : "Não foi possível enviar a denúncia.");
  }
  return <div className="report-action"><button className="text-button" type="button" onClick={report}>Denunciar anúncio</button>{status && <span role="status">{status}</span>}</div>;
}
