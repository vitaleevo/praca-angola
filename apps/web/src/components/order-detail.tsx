"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";

type OrderData = { id: string; reference: string; status: string; paymentStatus: string; totalAmount: string; currency: string; paymentDeadline: string; buyerNote: string; isBuyer: boolean; canManage: boolean; store: { name: string; slug: string }; paymentDestination: { recipientName: string; phone: string } | null; paymentMethod: string };
type OrderResponse = { order: OrderData; items: { id: string; title: string; quantity: number; unit_price: string; line_total: string }[]; timeline: { event_type: string; note: string; transfer_reference?: string; created_at: string }[] };

const statusLabel: Record<string, string> = { awaiting_payment: "A aguardar transferência", payment_reported: "Transferência reportada", preparing: "A preparar", ready_for_pickup: "Pronta para levantamento", out_for_delivery: "Em entrega", completed: "Concluída", cancelled: "Cancelada", refund_requested: "Reembolso solicitado", refunded: "Reembolsada" };

export function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<OrderResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [actionNote, setActionNote] = useState("");
  const requestOrder = useCallback(async () => {
    const response = await fetch(`/api/v1/orders/${id}`, { credentials: "include" });
    if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return null; }
    const result = await response.json().catch(() => ({})) as OrderResponse & { message?: string };
    if (!response.ok) throw new Error(result.message ?? "Não foi possível carregar esta encomenda.");
    return result;
  }, [id, router]);
  async function load() {
    const result = await requestOrder();
    if (result) setData(result);
  }
  useEffect(() => {
    let active = true;
    requestOrder().then((result) => { if (active && result) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor."); });
    return () => { active = false; };
  }, [requestOrder]);
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
  return <div className="order-detail-layout"><section className="order-main"><div className="order-status-header"><div><span className="eyebrow eyebrow-dark">Referência {order.reference}</span><h2>{statusLabel[order.status] ?? order.status}</h2></div><strong>{kwanza(order.totalAmount)}</strong></div><div className="panel"><h3>Produtos</h3>{data.items.map((item) => <div className="order-line" key={item.id}><span>{item.quantity} × {item.title}</span><b>{kwanza(item.line_total)}</b></div>)}</div>{order.isBuyer && order.paymentDestination && ["awaiting_payment", "payment_reported"].includes(order.status) && <div className="panel payment-destination"><p className="eyebrow eyebrow-dark">Transferência Multicaixa Express</p><h3>Transfere diretamente para a loja</h3><dl><div><dt>Nome do destinatário</dt><dd>{order.paymentDestination.recipientName}</dd></div><div><dt>Número Multicaixa Express</dt><dd>{order.paymentDestination.phone}</dd></div><div><dt>Valor exato</dt><dd>{kwanza(order.totalAmount)}</dd></div></dl><p>Confirma o nome e o montante na aplicação do teu banco. Nunca partilhes PIN nem código OTP. A PUVO não recebe nem guarda este pagamento.</p>{order.status === "awaiting_payment" && <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void act("payment/report", "POST", { transferReference: reference, note }); }}><label>Referência da transferência<input required minLength={4} maxLength={140} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Referência que aparece no comprovativo"/></label><label>Nota para a loja (opcional)<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}/></label><button className="button button-primary" disabled={busy}>Já fiz a transferência</button><small>Este reporte só avisa a loja. A loja confirma o crédito verificando o próprio extrato.</small></form>}</div>}{order.isBuyer && order.status === "awaiting_payment" && <button className="text-button destructive" disabled={busy} onClick={() => void act("cancel")}>Cancelar encomenda</button>}
      {order.canManage && !order.isBuyer && order.status === "payment_reported" && <div className="panel action-panel"><h3>Confirmação manual</h3><p>Confirma apenas depois de veres o valor creditado no teu extrato Multicaixa Express.</p><div className="button-row"><button className="button button-primary" disabled={busy} onClick={() => void act("payment/confirm")}>Confirmar receção</button><button className="button button-secondary" disabled={busy} onClick={() => void act("payment/reject", "POST", { note: actionNote || "Não consegui confirmar o crédito no extrato." })}>Não recebi</button></div><label>Nota<textarea maxLength={1000} value={actionNote} onChange={(event) => setActionNote(event.target.value)}/></label></div>}
      {order.canManage && !order.isBuyer && order.status === "preparing" && <div className="panel action-panel"><h3>Preparar entrega</h3><p>Escolhe como o comprador vai receber o produto.</p><div className="button-row"><button className="button button-primary" disabled={busy} onClick={() => void act("fulfillment", "PATCH", { method: "ready_for_pickup" })}>Pronto para levantamento</button><button className="button button-secondary" disabled={busy} onClick={() => void act("fulfillment", "PATCH", { method: "out_for_delivery" })}>Enviar para entrega</button></div></div>}
      {order.isBuyer && ["ready_for_pickup", "out_for_delivery"].includes(order.status) && <div className="panel action-panel"><h3>Recebeste o produto?</h3><p>Confirma a conclusão depois de receberes e verificares o produto.</p><button className="button button-primary" disabled={busy} onClick={() => void act("complete")}>Confirmar receção</button></div>}
      {order.isBuyer && ["preparing", "ready_for_pickup"].includes(order.status) && <div className="panel"><h3>Precisas de um reembolso?</h3><label>Motivo (opcional)<textarea maxLength={1000} value={actionNote} onChange={(event) => setActionNote(event.target.value)}/></label><button className="button button-secondary" disabled={busy} onClick={() => void act("refund/request", "POST", { note: actionNote })}>Solicitar reembolso manual</button><small>A loja trata a devolução da transferência diretamente contigo.</small></div>}
      {order.canManage && !order.isBuyer && order.status === "refund_requested" && <div className="panel action-panel"><h3>Reembolso solicitado</h3><p>Após devolveres o valor ao comprador por transferência, confirma aqui.</p><button className="button button-primary" disabled={busy} onClick={() => void act("refund/confirm", "POST", { note: actionNote })}>Confirmar devolução do valor</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section><aside className="order-side"><div className="panel"><h3>Loja</h3><a href={`/lojas/${order.store.slug}`}>{order.store.name} →</a><p>Pagamento directo à loja via Multicaixa Express.</p></div><div className="panel"><h3>Histórico</h3><ol className="timeline">{data.timeline.map((event, index) => <li key={`${event.event_type}-${index}`}><b>{event.event_type.replaceAll("_", " ").replaceAll(".", " · ")}</b><span>{event.note || event.transfer_reference || "Atualização da encomenda"}</span><time>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</time></li>)}</ol></div></aside></div>;
}
