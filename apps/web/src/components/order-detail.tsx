"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";

type FraudInspection = { confidence_score: number; extracted_amount_aoa: number | null; extracted_transaction_id: string | null; bank_detected: string | null; tampering_signs: boolean; verdict: string; details: string; created_at: string };
type OrderData = { id: string; reference: string; status: string; paymentStatus: string; totalAmount: string; shippingFee: string; deliveryMode: "pickup" | "courier"; delivery: { province: string; municipality: string; address: string; landmark?: string; recipientName: string; recipientPhone: string } | null; currency: string; paymentDeadline: string; buyerNote: string; isBuyer: boolean; canManage: boolean; store: { name: string; slug: string }; paymentDestination: { recipientName: string; recipientIdentifier: string; providerName: string | null; method: string; phone?: string } | null; paymentMethod: string; fraudInspection: FraudInspection | null };
type OrderResponse = { order: OrderData; items: { id: string; title: string; quantity: number; unit_price: string; line_total: string }[]; timeline: { event_type: string; note: string; transfer_reference?: string; created_at: string }[] };

type TrackingData = {
  trackingAvailable: boolean;
  deliveryId?: string;
  orderReference?: string;
  status?: string;
  recipient?: {
    name: string;
    phone: string;
    province: string;
    municipality: string;
    address: string;
    landmark?: string;
  };
  courier?: {
    name: string;
    phone: string;
    vehicle: string;
    licensePlate?: string;
    rating: string;
  } | null;
  shippingFee?: string;
  buyerDeliveryPin?: string;
  timeline?: {
    event_type: string;
    latitude?: number;
    longitude?: number;
    note?: string;
    created_at: string;
  }[];
};

const statusLabel: Record<string, string> = { awaiting_payment: "A aguardar transferência", payment_reported: "Transferência reportada", preparing: "A preparar", ready_for_pickup: "Pronta para levantamento", out_for_delivery: "Em entrega / A caminho", completed: "Concluída", cancelled: "Cancelada", refund_requested: "Reembolso solicitado", refunded: "Reembolsada" };
const deliveryStatusLabel: Record<string, string> = { assigned: "Estafeta Atribuído", picked_up: "Recolhido na Loja", in_transit: "Em Trânsito / A Caminho", arrived: "Estafeta no Local", delivered: "Entregue com Sucesso" };

export function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<OrderResponse | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [actionNote, setActionNote] = useState("");

  // Seller Courier Dispatch Form State
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [couriersList, setCouriersList] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState("");

  const requestOrder = useCallback(async () => {
    const response = await fetch(`/api/v1/orders/${id}`, { credentials: "include" });
    if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return null; }
    const result = await response.json().catch(() => ({})) as OrderResponse & { message?: string };
    if (!response.ok) throw new Error(result.message ?? "Não foi possível carregar esta encomenda.");
    return result;
  }, [id, router]);

  const requestTracking = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/logistics/orders/${id}/tracking`, { credentials: "include" });
      if (!response.ok) return null;
      return (await response.json()) as TrackingData;
    } catch {
      return null;
    }
  }, [id]);

  async function load() {
    const result = await requestOrder();
    if (result) {
      setData(result);
      const track = await requestTracking();
      if (track) setTracking(track);
    }
  }

  useEffect(() => {
    let active = true;
    requestOrder().then((result) => {
      if (active && result) {
        setData(result);
        requestTracking().then((track) => {
          if (active && track) setTracking(track);
        });
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor.");
    });

    // Auto-refresh polling for real-time order & delivery updates
    const interval = setInterval(() => {
      if (active) {
        requestOrder().then((res) => { if (active && res) setData(res); });
        requestTracking().then((track) => { if (active && track) setTracking(track); });
      }
    }, 8000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [requestOrder, requestTracking]);

  async function loadAvailableCouriers() {
    try {
      const res = await fetch("/api/v1/logistics/couriers?status=active", { credentials: "include" });
      if (res.ok) {
        const list = await res.json();
        setCouriersList(list);
        if (list.length > 0) setSelectedCourierId(list[0].id);
      }
    } catch {
      // ignore
    }
  }

  async function handleDispatchCourier() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/logistics/orders/${id}/assign-courier`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: selectedCourierId || undefined }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resJson.message || "Não foi possível despachar o estafeta.");
        return;
      }
      setDispatchOpen(false);
      await load();
    } catch {
      setError("Erro ao contactar o servidor para despacho.");
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, method = "POST", payload: object = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/orders/${id}/${path}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) { setError(result.message ?? "Não foi possível concluir esta ação."); return; }
      await load();
    } catch { setError("Sem ligação ao servidor."); }
    finally { setBusy(false); }
  }
  if (error && !data) return <div className="empty-state"><b>{error}</b><Link className="button button-secondary" href="/conta/encomendas">Voltar às encomendas</Link></div>;
  if (!data) return <div className="loading-state" role="status">A carregar encomenda…</div>;
  const order = data.order;
  const isBankTransfer = order.paymentMethod === "manual_bank_transfer";
  const methodLabel = isBankTransfer ? "Transferência bancária" : "Multicaixa Express";
  const destinationIdentifier = order.paymentDestination?.recipientIdentifier ?? order.paymentDestination?.phone;
  return <div className="order-detail-layout"><section className="order-main"><div className="order-status-header"><div><span className="eyebrow eyebrow-dark">Referência {order.reference}</span><h2>{statusLabel[order.status] ?? order.status}</h2></div><strong>{kwanza(order.totalAmount)}</strong></div><div className="panel"><h3>Produtos</h3>{data.items.map((item) => <div className="order-line" key={item.id}><span>{item.quantity} × {item.title}</span><b>{kwanza(item.line_total)}</b></div>)}</div>{order.isBuyer && order.paymentDestination && ["awaiting_payment", "payment_reported"].includes(order.status) && <div className="panel payment-destination"><p className="eyebrow eyebrow-dark">{methodLabel}</p><h3>Transfere diretamente para a loja</h3><dl>{isBankTransfer && order.paymentDestination.providerName && <div><dt>Banco</dt><dd>{order.paymentDestination.providerName}</dd></div>}<div><dt>Nome do destinatário</dt><dd>{order.paymentDestination.recipientName}</dd></div><div><dt>{isBankTransfer ? "IBAN / número da conta" : "Número Multicaixa Express"}</dt><dd>{destinationIdentifier}</dd></div><div><dt>Valor exato</dt><dd>{kwanza(order.totalAmount)}</dd></div></dl><p>Confirma o nome e o montante na aplicação do teu banco. Nunca partilhes PIN nem código OTP. A PUVO não recebe nem guarda este pagamento.</p>{order.status === "awaiting_payment" && <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void act("payment/report", "POST", { transferReference: reference, note }); }}><label>Referência da transferência<input required minLength={4} maxLength={140} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Referência que aparece no comprovativo"/></label><label>Nota para a loja (opcional)<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}/></label><button className="button button-primary" disabled={busy}>Já fiz a transferência</button><small>Este reporte só avisa a loja. A loja confirma o crédito verificando o próprio extrato.</small></form>}</div>}{order.isBuyer && order.status === "awaiting_payment" && <button className="text-button destructive" disabled={busy} onClick={() => void act("cancel")}>Cancelar encomenda</button>}
      {order.canManage && !order.isBuyer && order.status === "payment_reported" && <div className="panel action-panel"><h3>Confirmação manual</h3><p>Confirma apenas depois de veres o valor creditado no teu extrato bancário.</p><div className="button-row"><button className="button button-primary" disabled={busy} onClick={() => void act("payment/confirm")}>Confirmar receção</button><button className="button button-secondary" disabled={busy} onClick={() => void act("payment/reject", "POST", { note: actionNote || "Não consegui confirmar o crédito no extrato." })}>Não recebi</button></div><label>Nota<textarea maxLength={1000} value={actionNote} onChange={(event) => setActionNote(event.target.value)}/></label></div>}
      {order.canManage && !order.isBuyer && order.fraudInspection && ["payment_reported", "preparing"].includes(order.status) && (() => { const fi = order.fraudInspection; const verdictLevel = fi.verdict === "HIGH_RISK" || fi.tampering_signs ? "high" : fi.verdict === "SUSPICIOUS" ? "medium" : "low"; const verdictLabel: Record<string, string> = { LOW_RISK: "Baixo risco", SUSPICIOUS: "Suspeito", HIGH_RISK: "Alto risco" }; const verdictIcon: Record<string, string> = { low: "\u2713", medium: "\u25c6", high: "\u26a0" }; return (
        <div className={`panel fraud-inspection-panel fraud-verdict-${verdictLevel}`}>
          <div className="fraud-inspection-header">
            <h3>Inspeção IA do comprovativo</h3>
            <span className={`fraud-verdict-badge fraud-badge-${verdictLevel}`}>
              <span aria-hidden="true">{verdictIcon[verdictLevel]}</span>
              {verdictLabel[fi.verdict] ?? fi.verdict}
            </span>
          </div>
          <div className="fraud-inspection-grid">
            <div className="fraud-metric">
              <span className="fraud-metric-label">Confiança</span>
              <span className="fraud-metric-value">{Math.round(fi.confidence_score * 100)}%</span>
            </div>
            {fi.extracted_amount_aoa !== null && (
              <div className="fraud-metric">
                <span className="fraud-metric-label">Valor extraído</span>
                <span className="fraud-metric-value">{kwanza(String(fi.extracted_amount_aoa))}</span>
              </div>
            )}
            {fi.bank_detected && (
              <div className="fraud-metric">
                <span className="fraud-metric-label">Banco</span>
                <span className="fraud-metric-value">{fi.bank_detected}</span>
              </div>
            )}
            {fi.extracted_transaction_id && (
              <div className="fraud-metric">
                <span className="fraud-metric-label">ID transação</span>
                <span className="fraud-metric-value fraud-metric-mono">{fi.extracted_transaction_id}</span>
              </div>
            )}
          </div>
          {fi.tampering_signs && (
            <div className="fraud-tampering-warning" role="alert">
              <span aria-hidden="true">{"\u26a0"}</span> Sinais de adulteração detectados — verifica o extrato real antes de confirmar.
            </div>
          )}
          {fi.details && <p className="fraud-details">{fi.details}</p>}
        </div>
      ); })()}
      {/* Physical Delivery Tracking Card (Real-time Handshake & Courier) */}
      {tracking?.trackingAvailable && (
        <div className="panel tracking-card">
          <div className="tracking-header">
            <div>
              <span className="eyebrow eyebrow-dark">Logística & Entrega PUVO</span>
              <h3>Acompanhamento em tempo real</h3>
            </div>
            <span className={`tracking-status-pill ${tracking.status || "assigned"}`}>
              {deliveryStatusLabel[tracking.status || "assigned"] || tracking.status}
            </span>
          </div>

          {/* Secure Handshake PIN Card — Only disclosed to authenticated buyer */}
          {tracking.buyerDeliveryPin && tracking.status !== "delivered" && (
            <div className="secure-pin-card">
              <h4><span>🔐</span> PIN DE ENTREGA FÍSICA</h4>
              <div className="secure-pin-digits">
                {tracking.buyerDeliveryPin.split("").map((digit, i) => (
                  <span key={i} className="secure-pin-digit">{digit}</span>
                ))}
              </div>
              <p className="secure-pin-warning">
                <span>⚠️</span>
                <span>
                  <b>Segurança Anti-Burla PUVO:</b> Entrega este código de 4 dígitos ao estafeta APENAS no momento em que tiveres os artigos em mãos. Nunca partilhes este PIN por chamada ou WhatsApp antes da entrega física.
                </span>
              </p>
            </div>
          )}

          {/* Courier Info & Contact Card */}
          {tracking.courier && (
            <div className="courier-info-box">
              <div className="courier-identity">
                <div className="courier-avatar">
                  {tracking.courier.name.slice(0, 1)}
                </div>
                <div className="courier-details">
                  <b>{tracking.courier.name}</b>
                  <div className="courier-meta">
                    <span className="vehicle-badge">
                      {tracking.courier.vehicle === "motorcycle" ? "🛵 Moto" : tracking.courier.vehicle === "car" ? "🚗 Carro" : "🚐 Carrinha"}
                      {tracking.courier.licensePlate ? ` · ${tracking.courier.licensePlate}` : ""}
                    </span>
                    <span>⭐ {tracking.courier.rating}</span>
                  </div>
                </div>
              </div>
              <div className="courier-actions-row">
                <a className="call-button" href={`tel:${tracking.courier.phone}`}>
                  📞 Ligar
                </a>
                <a
                  className="whatsapp-button"
                  href={`https://wa.me/${tracking.courier.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  💬 WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* Visual Step Timeline */}
          <div className="delivery-steps">
            <div className={`delivery-step ${["assigned", "picked_up", "in_transit", "delivered"].includes(tracking.status || "") ? "done" : ""}`}>
              <div className="delivery-step-icon">✓</div>
              <span className="delivery-step-label">Despachado</span>
            </div>
            <div className={`delivery-step ${["picked_up", "in_transit", "delivered"].includes(tracking.status || "") ? "done" : tracking.status === "assigned" ? "current" : ""}`}>
              <div className="delivery-step-icon">📦</div>
              <span className="delivery-step-label">Recolha na Loja</span>
            </div>
            <div className={`delivery-step ${["in_transit", "delivered"].includes(tracking.status || "") ? "done" : tracking.status === "picked_up" ? "current" : ""}`}>
              <div className="delivery-step-icon">🛵</div>
              <span className="delivery-step-label">A Caminho</span>
            </div>
            <div className={`delivery-step ${tracking.status === "delivered" ? "done" : ""}`}>
              <div className="delivery-step-icon">🏁</div>
              <span className="delivery-step-label">Entregue (PIN)</span>
            </div>
          </div>

          {/* Destination & Reference */}
          {tracking.recipient && (
            <div style={{ marginTop: 14, fontSize: 11, color: "#617066", borderTop: "1px solid #edf2ee", paddingTop: 10 }}>
              <b>Destino:</b> {tracking.recipient.address}, {tracking.recipient.municipality} ({tracking.recipient.province})
              {tracking.recipient.landmark && <div><span style={{ color: "#966b07" }}>📍 Ponto de Referência:</span> {tracking.recipient.landmark}</div>}
              <div><b>Destinatário:</b> {tracking.recipient.name} ({tracking.recipient.phone})</div>
            </div>
          )}
        </div>
      )}

      {/* Seller Order Fulfillment & Dispatch */}
      {order.canManage && !order.isBuyer && order.status === "preparing" && (
        <div className="panel action-panel">
          <h3>Preparar entrega</h3>
          <p>{order.deliveryMode === "courier" ? "Entrega com estafeta escolhida e paga pelo comprador." : "O comprador escolheu levantamento na loja."}</p>
          <div className="button-row">
            {order.deliveryMode === "courier" && <button
              className="button button-primary"
              disabled={busy}
              onClick={() => {
                setDispatchOpen(true);
                void loadAvailableCouriers();
              }}
            >
              🛵 Despachar com Estafeta PUVO
            </button>}
            {order.deliveryMode === "pickup" && <button className="button button-secondary" disabled={busy} onClick={() => void act("fulfillment", "PATCH", { method: "ready_for_pickup" })}>
              Pronto para levantamento na loja
            </button>}
          </div>

          {dispatchOpen && (
            <div style={{ marginTop: 16, padding: 14, background: "#f8faf8", border: "1px solid #dce5dd", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 13 }}>Despacho com Estafeta</h4>
              <div className="stack-form">
                <label>
                  Selecionar Estafeta Ativo
                  <select
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                  >
                    {couriersList.length > 0 ? (
                      couriersList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.vehicle_type} - {c.phone}) ⭐ {c.rating}
                        </option>
                      ))
                    ) : (
                      <option value="">Atribuição automática inteligente</option>
                    )}
                  </select>
                </label>

                {order.delivery && <p>Destino: {order.delivery.address}, {order.delivery.municipality}, {order.delivery.province}. Destinatário: {order.delivery.recipientName} ({order.delivery.recipientPhone}). Frete incluído: {kwanza(order.shippingFee)}.</p>}

                <div className="button-row" style={{ marginTop: 8 }}>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    type="button"
                    onClick={() => void handleDispatchCourier()}
                  >
                    {busy ? "A despachar…" : "Confirmar Despacho & Gerar PIN"}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setDispatchOpen(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {order.isBuyer && ["ready_for_pickup", "out_for_delivery"].includes(order.status) && !tracking?.trackingAvailable && (
        <div className="panel action-panel">
          <h3>Recebeste o produto?</h3>
          <p>
            {tracking?.trackingAvailable
              ? "O estafeta solicitará o teu PIN de 4 dígitos para concluir a entrega no local."
              : "Confirma a conclusão depois de receberes e verificares o produto."}
          </p>
          <button className="button button-primary" disabled={busy} onClick={() => void act("complete")}>
            Confirmar receção manualmente
          </button>
        </div>
      )}

      {order.isBuyer && ["preparing", "ready_for_pickup"].includes(order.status) && (
        <div className="panel">
          <h3>Precisas de um reembolso?</h3>
          <label>
            Motivo (opcional)
            <textarea maxLength={1000} value={actionNote} onChange={(event) => setActionNote(event.target.value)} />
          </label>
          <button className="button button-secondary" disabled={busy} onClick={() => void act("refund/request", "POST", { note: actionNote })}>
            Solicitar reembolso manual
          </button>
          <small>A loja trata a devolução da transferência diretamente contigo.</small>
        </div>
      )}

      {order.canManage && !order.isBuyer && order.status === "refund_requested" && (
        <div className="panel action-panel">
          <h3>Reembolso solicitado</h3>
          <p>Após devolveres o valor ao comprador por transferência, confirma aqui.</p>
          <button className="button button-primary" disabled={busy} onClick={() => void act("refund/confirm", "POST", { note: actionNote })}>
            Confirmar devolução do valor
          </button>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
    <aside className="order-side">
      <div className="panel">
        <h3>Loja</h3>
        <a href={`/lojas/${order.store.slug}`}>{order.store.name} →</a>
        <p>Pagamento por transferência manual diretamente à loja ({methodLabel}).</p>
      </div>
      <div className="panel">
        <h3>Histórico</h3>
        <ol className="timeline">
          {data.timeline.map((event, index) => (
            <li key={`${event.event_type}-${index}`}>
              <b>{event.event_type.replaceAll("_", " ").replaceAll(".", " · ")}</b>
              <span>{event.note || event.transfer_reference || "Atualização da encomenda"}</span>
              <time>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</time>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  </div>;
}
