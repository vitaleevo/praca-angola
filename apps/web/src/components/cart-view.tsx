"use client";

import { useEffect, useMemo, useState } from "react";
import { kwanza } from "../lib/api";

type CartLine = { listingId: string; slug: string; title: string; price: string; quantity: number; image?: string };

export function CartView() {
  const [items, setItems] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => { try { setItems(JSON.parse(localStorage.getItem("praca-cart") || "[]") as CartLine[]); } catch { setItems([]); } };
    load(); window.addEventListener("praca-cart-updated", load); return () => window.removeEventListener("praca-cart-updated", load);
  }, []);
  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), [items]);
  function save(next: CartLine[]) { setItems(next); localStorage.setItem("praca-cart", JSON.stringify(next)); }
  function quantity(id: string, value: number) { save(items.map((item) => item.listingId === id ? { ...item, quantity: Math.max(1, Math.min(100, value)) } : item)); }
  function remove(id: string) { save(items.filter((item) => item.listingId !== id)); }
  async function checkout() {
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/v1/orders", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(({ listingId, quantity }) => ({ listingId, quantity })) }) });
      const data = await response.json().catch(() => ({})) as { orders?: { id: string }[]; message?: string | string[] };
      if (response.status === 401) { window.location.href = "/entrar?next=/carrinho"; return; }
      if (!response.ok || !data.orders?.length) { setError(Array.isArray(data.message) ? data.message.join(" ") : data.message || "Não foi possível criar a encomenda."); return; }
      localStorage.removeItem("praca-cart");
      window.location.assign(data.orders.length === 1 ? `/conta/encomendas/${data.orders[0].id}` : "/conta/encomendas");
    } catch { setError("Não foi possível contactar o servidor. Tenta novamente."); }
    finally { setBusy(false); }
  }
  return <div className="cart-layout"><section className="cart-items">{items.length ? items.map((item) => <article className="cart-item" key={item.listingId}>{item.image ? <img src={item.image} alt=""/> : <span className="cart-placeholder">{item.title.slice(0,1)}</span>}<div className="cart-item-copy"><a href={`/produtos/${item.slug}`}><b>{item.title}</b></a><span>{kwanza(item.price)}</span><div className="quantity-control"><button type="button" aria-label="Diminuir quantidade" onClick={() => quantity(item.listingId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" aria-label="Aumentar quantidade" onClick={() => quantity(item.listingId, item.quantity + 1)}>+</button><button type="button" className="text-button" onClick={() => remove(item.listingId)}>Remover</button></div></div><strong>{kwanza(Number(item.price) * item.quantity)}</strong></article>) : <div className="empty-state"><b>O teu carrinho está vazio.</b><span>Explora a montra e guarda produtos para comprar.</span><a className="button button-secondary" href="/produtos">Explorar produtos</a></div>}</section>{Boolean(items.length) && <aside className="checkout-summary"><h2>Resumo da encomenda</h2><div><span>Subtotal</span><b>{kwanza(total)}</b></div><div><span>Entrega</span><span>A combinar com a loja</span></div><hr/><div className="summary-total"><span>Total</span><b>{kwanza(total)}</b></div><p>Uma encomenda por loja. O pagamento é uma transferência Multicaixa Express diretamente para o vendedor.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary button-wide" type="button" onClick={checkout} disabled={busy}>{busy ? "A criar encomenda…" : "Continuar para pagamento"}</button></aside>}</div>;
}
