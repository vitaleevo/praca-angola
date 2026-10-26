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

type CartQuote = { totalAmount: string; shippingFee: string; shops: Array<{ sellerProfileId: string; productsTotal: string; shippingFee: string; totalAmount: string; zoneName: string | null }> };

const angolanMunicipalities: Record<string, string[]> = {
  Luanda: ["Talatona", "Belas", "Maianga", "Ingombota", "Kilamba Kiaxi", "Viana", "Cazenga", "Cacuaco", "Rangel", "Sambizanga", "Zango", "Sequele", "Icolo e Bengo", "Quiçama"],
  Benguela: ["Benguela", "Lobito", "Catumbela", "Baía Farta"],
  Huambo: ["Huambo", "Caála", "Bailundo"],
  Huíla: ["Lubango", "Humpata", "Chibia"],
  Cabinda: ["Cabinda", "Cacongo", "Buco-Zau", "Belize"],
  "Kwanza Sul": ["Sumbe", "Porto Amboim", "Gabela"],
  Malanje: ["Malanje", "Calandula", "Cacuso"],
  Uíge: ["Uíge", "Negage", "Damba"],
  Outras: ["Namibe", "Zaire", "Lunda Norte", "Lunda Sul", "Moxico", "Kuando Kubango", "Bié", "Kwanza Norte", "Bengo"],
};

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

  // Delivery & Freight State
  const [deliveryMode, setDeliveryMode] = useState<"courier" | "pickup">("courier");
  const [province, setProvince] = useState("Luanda");
  const [municipality, setMunicipality] = useState("Talatona");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [freight, setFreight] = useState<CartQuote | null>(null);
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightError, setFreightError] = useState("");

  useEffect(() => {
    const load = () => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem("praca-cart") || "[]");
        setItems(Array.isArray(stored) ? stored.filter((item): item is CartLine =>
          typeof item?.listingId === "string" && typeof item?.slug === "string" && typeof item?.title === "string" && item.title.length > 0 &&
          Number.isFinite(Number(item?.price)) && Number(item.price) >= 0 && Number.isInteger(item?.quantity) && item.quantity > 0,
        ) : []);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  // The same server-side pricing rule is used for the quote and for order creation.
  useEffect(() => {
    if (!checkoutItems.length || !municipality) {
      setFreight(null);
      return;
    }
    let active = true;
    setFreight(null);
    setFreightError("");

    async function fetchFreight() {
      setFreightLoading(true);
      try {
        const res = await fetch("/api/v1/orders/freight-quote", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: checkoutItems,
            delivery: { mode: deliveryMode, province, municipality },
          }),
        });
        const data = (await res.json()) as CartQuote & { message?: string | string[] };
        if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message || "Não foi possível calcular o total.");
        if (active) setFreight(data);
      } catch (cause) {
        if (active) setFreightError(cause instanceof Error ? cause.message : "Não foi possível calcular o total.");
      } finally {
        if (active) setFreightLoading(false);
      }
    }

    const timer = setTimeout(() => void fetchFreight(), 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [checkoutItems, province, municipality, deliveryMode]);

  const shippingFee = Number(freight?.shippingFee ?? 0);
  const finalTotal = Number(freight?.totalAmount ?? total);

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
    if (!freight || freightLoading || freightError) {
      setError("Aguarda o cálculo atualizado do total antes de continuar.");
      return;
    }

    if (deliveryMode === "courier" && (!address.trim() || !recipientPhone.trim())) {
      setError("Por favor preenche a morada completa e contacto móvel para o estafeta.");
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
          buyerNote: deliveryMode === "courier" ? "Entrega com estafeta PUVO" : "Levantamento na loja",
          buyerPhone: recipientPhone.trim() || undefined,
          delivery: { mode: deliveryMode, province, municipality, address: address.trim(), landmark: landmark.trim(), recipientName: recipientName.trim() || "Comprador", recipientPhone: recipientPhone.trim() },
          expectedTotal: freight.totalAmount,
          paymentMethods: paymentOptions.shops.map((shop) => ({
            sellerProfileId: shop.sellerProfileId,
            method: selectedMethods[shop.sellerProfileId],
          })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { orders?: { id: string }[]; message?: string | string[] };
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

          {/* Delivery & Shipping Method */}
          <div className="checkout-delivery-section">
            <h3><span>🚚</span> Opção de Entrega</h3>
            <div className="delivery-type-toggle">
              <button
                type="button"
                className={`delivery-type-option ${deliveryMode === "courier" ? "selected" : ""}`}
                onClick={() => setDeliveryMode("courier")}
              >
                <strong><span>🛵</span> Estafeta Local</strong>
                <span>Entrega ao domicílio</span>
              </button>
              <button
                type="button"
                className={`delivery-type-option ${deliveryMode === "pickup" ? "selected" : ""}`}
                onClick={() => setDeliveryMode("pickup")}
              >
                <strong><span>🏬</span> Levantamento</strong>
                <span>Na loja física (Grátis)</span>
              </button>
            </div>

            {deliveryMode === "courier" ? (
              <div>
                <div className="delivery-address-grid">
                  <label>
                    Província
                    <select
                      value={province}
                      onChange={(e) => {
                        const nextProv = e.target.value;
                        setProvince(nextProv);
                        setMunicipality(angolanMunicipalities[nextProv]?.[0] || "");
                      }}
                    >
                      {Object.keys(angolanMunicipalities).map((prov) => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Município
                    <select
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                    >
                      {(angolanMunicipalities[province] || []).map((muni) => (
                        <option key={muni} value={muni}>{muni}</option>
                      ))}
                    </select>
                  </label>

                  <label className="delivery-address-full">
                    Morada (Bairro, Rua, Casa) *
                    <input
                      required
                      placeholder="Ex: Talatona, Bairro Militar, Rua 4, Casa 12"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </label>

                  <label className="delivery-address-full">
                    Ponto de Referência em Angola
                    <input
                      placeholder="Ex: Perto do Kero Talatona / Defronte à pastelaria"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                    />
                    <small className="delivery-landmark-tip">Ajuda o estafeta a chegar até si com facilidade.</small>
                  </label>

                  <label>
                    Nome de quem recebe *
                    <input
                      required
                      placeholder="Nome completo"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                    />
                  </label>

                  <label>
                    Contacto móvel *
                    <input
                      required
                      placeholder="Ex: 923 111 222"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                    />
                  </label>
                </div>

                {freightLoading ? (
                  <div className="freight-estimate-banner">A calcular frete para {municipality}…</div>
                ) : freight ? (
                  <div className={`freight-estimate-banner ${shippingFee === 0 ? "free-shipping" : ""}`}>
                    <div>
                      <span className={`freight-badge ${shippingFee === 0 ? "free" : ""}`}>
                        {shippingFee === 0 ? "🎉 FRETE GRÁTIS" : `Frete: ${kwanza(shippingFee)}`}
                      </span>
                    </div>
                    <span className="freight-time">{freight.shops.length} loja{freight.shops.length === 1 ? "" : "s"} no carrinho</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="freight-estimate-banner free-shipping">
                <span>📍 Levantamento na Loja sem taxa de entrega.</span>
              </div>
            )}
          </div>

          <hr />

          <div><span>Subtotal dos produtos</span><b>{kwanza(freight ? Number(freight.totalAmount) - shippingFee : total)}</b></div>
          <div>
            <span>Frete de entrega</span>
            <b>
              {deliveryMode === "pickup"
                ? "Grátis (Loja)"
                : freightLoading
                ? "A calcular…"
                : freight && shippingFee === 0
                ? "Grátis"
                : freight
                ? kwanza(shippingFee)
                : "A calcular"}
            </b>
          </div>
          <hr />
          <div className="summary-total"><span>Total a pagar</span><b>{kwanza(finalTotal)}</b></div>
          {freightError && <p className="form-error" role="alert">{freightError}</p>}
          <p>Uma encomenda por loja. Escolhe como vais pagar cada loja. O estafeta valida o teu PIN na entrega.</p>

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
            disabled={busy || (!requiresLogin && (optionsLoading || freightLoading || !freight || Boolean(freightError) || hasUnconfiguredShop))}
          >
            {busy ? "A criar encomenda…" : optionsError ? "Tentar carregar pagamentos" : requiresLogin ? "Entrar para pagar" : "Continuar para pagamento"}
          </button>
        </aside>
      )}
    </div>
  );
}
