"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { kwanza } from "../lib/api";

type CartLine = { listingId: string; slug: string; title: string; price: string; quantity: number; image?: string };
type PaymentMethod = "manual_multicaixa_express_transfer" | "manual_bank_transfer";
type PaymentShop = { sellerProfileId: string; storeName: string; methods: Array<{ method: PaymentMethod; label: string }> };
type PaymentOptions = { shops: PaymentShop[] };

export function CartView() {
  const router = useRouter();
  const [items, setItems] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<Record<string, PaymentMethod>>({});
  const optionsRequest = useRef(0);

  useEffect(() => {
    const load = () => {
      try { setItems(JSON.parse(localStorage.getItem("praca-cart") || "[]") as CartLine[]); }
      catch { setItems([]); }
    };
    load();
    window.addEventListener("praca-cart-updated", load);
    return () => window.removeEventListener("praca-cart-updated", load);
  }, []);

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), [items]);
  const checkoutItems = useMemo(() => items.map(({ listingId, quantity }) => ({ listingId, quantity })).sort((a, b) => a.listingId.localeCompare(b.listingId)), [items]);
  const optionsKey = JSON.stringify(checkoutItems);

  function save(next: CartLine[]) {
    setItems(next);
    localStorage.setItem("praca-cart", JSON.stringify(next));
  }

  function quantity(id: string, value: number) {
    save(items.map((item) => item.listingId === id ? { ...item, quantity: Math.max(1, Math.min(100, value)) } : item));
  }

  function remove(id: string) {
    save(items.filter((item) => item.listingId !== id));
  }

  async function loadPaymentOptions(lines: Array<{ listingId: string; quantity: number }>) {
    const requestId = ++optionsRequest.current;
    if (!lines.length) {
      setPaymentOptions(null);
      setRequiresLogin(false);
      setOptionsLoading(false);
      return;
    }
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const response = await fetch("/api/v1/orders/payment-options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      if (requestId !== optionsRequest.current) return;
      if (response.status === 401) {
        setRequiresLogin(true);
        setPaymentOptions(null);
        return;
      }
      const data = await response.json().catch(() => ({})) as PaymentOptions & { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível carregar os pagamentos das lojas.");
      setRequiresLogin(false);
      setPaymentOptions(data);
      setSelectedMethods((current) => {
        const next = { ...current };
        for (const shop of data.shops) {
          const available = shop.methods.map((method) => method.method);
          if (!available.includes(next[shop.sellerProfileId])) {
            next[shop.sellerProfileId] = available.includes("manual_multicaixa_express_transfer")
              ? "manual_multicaixa_express_transfer"
              : available[0];
          }
        }
        return next;
      });
    } catch (cause) {
      if (requestId !== optionsRequest.current) return;
      setOptionsError(cause instanceof Error ? cause.message : "Não foi possível carregar os pagamentos das lojas.");
      setPaymentOptions(null);
    } finally {
      if (requestId === optionsRequest.current) setOptionsLoading(false);
    }
  }

  useEffect(() => {
    const lines = checkoutItems;
    const timer = window.setTimeout(() => void loadPaymentOptions(lines), 0);
    return () => window.clearTimeout(timer);
    // The stable key changes only when a listing or quantity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  async function checkout() {
    setError("");
    if (requiresLogin) {
      router.push("/entrar?next=%2Fcarrinho");
      return;
    }
    if (optionsError || !paymentOptions) {
      await loadPaymentOptions(checkoutItems);
      return;
    }
    if (paymentOptions.shops.some((shop) => shop.methods.length === 0)) {
      setError("Uma das lojas ainda não ativou um método de pagamento.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: checkoutItems,
          paymentMethods: paymentOptions.shops.map((shop) => ({
            sellerProfileId: shop.sellerProfileId,
            method: selectedMethods[shop.sellerProfileId],
          })),
        }),
      });
      const data = await response.json().catch(() => ({})) as { orders?: { id: string }[]; message?: string | string[] };
      if (response.status === 401) {
        router.push("/entrar?next=%2Fcarrinho");
        return;
      }
      if (!response.ok || !data.orders?.length) {
        setError(Array.isArray(data.message) ? data.message.join(" ") : data.message || "Não foi possível criar a encomenda.");
        return;
      }
      localStorage.removeItem("praca-cart");
      router.push(data.orders.length === 1 ? `/conta/encomendas/${data.orders[0].id}` : "/conta/encomendas");
    } catch {
      setError("Não foi possível contactar o servidor. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  const hasUnconfiguredShop = Boolean(paymentOptions?.shops.some((shop) => shop.methods.length === 0));

  return (
    <div className="cart-layout">
      <section className="cart-items">
        {items.length ? items.map((item) => (
          <article className="cart-item" key={item.listingId}>
            {item.image ? <Image src={item.image} alt={item.title} width={74} height={74} unoptimized /> : <span className="cart-placeholder">{item.title.slice(0, 1)}</span>}
            <div className="cart-item-copy">
              <Link href={`/produtos/${item.slug}`}><b>{item.title}</b></Link>
              <span>{kwanza(item.price)}</span>
              <div className="quantity-control">
                <button type="button" aria-label="Diminuir quantidade" onClick={() => quantity(item.listingId, item.quantity - 1)}>−</button>
                <span>{item.quantity}</span>
                <button type="button" aria-label="Aumentar quantidade" onClick={() => quantity(item.listingId, item.quantity + 1)}>+</button>
                <button type="button" className="text-button" onClick={() => remove(item.listingId)}>Remover</button>
              </div>
            </div>
            <strong>{kwanza(Number(item.price) * item.quantity)}</strong>
          </article>
        )) : (
          <div className="empty-state">
            <b>O teu carrinho está vazio.</b>
            <span>Explora a montra e guarda produtos para comprar.</span>
            <Link className="button button-secondary" href="/produtos">Explorar produtos</Link>
          </div>
        )}
      </section>
      {Boolean(items.length) && (
        <aside className="checkout-summary">
          <h2>Resumo da encomenda</h2>
          <div><span>Subtotal</span><b>{kwanza(total)}</b></div>
          <div><span>Entrega</span><span>A combinar com a loja</span></div>
          <hr />
          <div className="summary-total"><span>Total</span><b>{kwanza(total)}</b></div>
          <p>Uma encomenda por loja. Escolhe como vais pagar cada loja. A PUVO não recebe nem guarda o valor.</p>
          {optionsLoading && <p className="form-status" role="status">A carregar os métodos de pagamento…</p>}
          {requiresLogin && <p className="form-status">Entra na tua conta para consultar e escolher os métodos de pagamento.</p>}
          {optionsError && <p className="form-error" role="alert">{optionsError}</p>}
          {paymentOptions?.shops.map((shop) => (
            <fieldset className="checkout-payment-methods" key={shop.sellerProfileId}>
              <legend>Pagamento para {shop.storeName}</legend>
              {shop.methods.length ? shop.methods.map((method) => (
                <label className="checkout-payment-option" key={method.method}>
                  <input
                    type="radio"
                    name={`payment-${shop.sellerProfileId}`}
                    value={method.method}
                    checked={selectedMethods[shop.sellerProfileId] === method.method}
                    onChange={() => setSelectedMethods((current) => ({ ...current, [shop.sellerProfileId]: method.method }))}
                  />
                  <span>{method.label}</span>
                </label>
              )) : <p className="form-error">Esta loja ainda não configurou um método de pagamento.</p>}
            </fieldset>
          ))}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            className="button button-primary button-wide"
            type="button"
            onClick={() => void checkout()}
            disabled={busy || optionsLoading || hasUnconfiguredShop}
          >
            {busy ? "A criar encomenda…" : optionsError ? "Tentar carregar pagamentos" : requiresLogin ? "Entrar para pagar" : "Continuar para pagamento"}
          </button>
        </aside>
      )}
    </div>
  );
}
