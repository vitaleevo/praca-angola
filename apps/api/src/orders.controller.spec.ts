import { describe, expect, it, vi } from "vitest";
import { OrdersController } from "./orders.controller";

const user = { id: "user-1", displayName: "Seller", email: "seller@puvo.invalid", roles: ["user"] };
const listingId = "11111111-1111-4111-8111-111111111111";

describe("OrdersController safeguards", () => {
  it("keeps courier dispatch behind the dedicated logistics flow", async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "order-1", reference: "PA-1", buyer_id: "buyer-1", buyer_phone: null,
        user_phone: null, store_name: "Loja", delivery_mode: "courier",
      }] }),
    };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)) };
    const controller = new OrdersController(database as never, {} as never, {} as never, { queueNotification: vi.fn() } as never, {} as never);

    await expect(controller.fulfillment("order-1", { method: "out_for_delivery" }, user)).rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("allows a pickup order to become ready for pickup", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{
          id: "order-1", reference: "PA-1", buyer_id: "buyer-1", buyer_phone: null,
          user_phone: null, store_name: "Loja", delivery_mode: "pickup",
        }] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)) };
    const controller = new OrdersController(database as never, {} as never, {} as never, { queueNotification: vi.fn() } as never, {} as never);

    await expect(controller.fulfillment("order-1", { method: "ready_for_pickup" }, user)).resolves.toEqual({
      id: "order-1", status: "ready_for_pickup",
    });
  });

  it("does not invent a buyer phone when confirming a transfer", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{
          id: "order-1", reference: "PA-1", buyer_id: "buyer-1", buyer_phone: null,
          user_phone: null, buyer_name: "Buyer", store_name: "Loja",
        }] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)) };
    const notifications = { queueNotification: vi.fn() };
    const controller = new OrdersController(database as never, {} as never, {} as never, notifications as never, {} as never);

    await expect(controller.confirmTransfer("order-1", user)).resolves.toEqual({
      id: "order-1", status: "preparing", paymentStatus: "confirmed_by_seller",
    });
    expect(notifications.queueNotification).not.toHaveBeenCalled();
  });


  it("does not expose fraud inspection internals to the buyer order view", async () => {
    const now = new Date();
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "order-1", reference: "PA-1", buyer_id: user.id, seller_profile_id: "store-1",
        status: "payment_reported", payment_status: "buyer_reported", total_amount: "1000.00",
        shipping_fee: "0.00", delivery_mode: "pickup", delivery_details_ciphertext: null,
        currency: "AOA", payment_deadline: now, buyer_note: "", created_at: now,
        store_name: "Loja", store_slug: "loja", can_manage: false,
        payment_method: "manual_bank_transfer", payment_destination_ciphertext: null,
        mcx_recipient_name_ciphertext: null, mcx_phone_ciphertext: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        confidence_score: 0.98, extracted_amount_aoa: 1000, extracted_transaction_id: "TX-1",
        bank_detected: "Banco", tampering_signs: true, verdict: "HIGH_RISK",
        details: "internal forensic signal", created_at: now.toISOString(),
      }] }) };
    const controller = new OrdersController(database as never, {} as never, {} as never, { queueNotification: vi.fn() } as never, {} as never);

    const result = await controller.get("order-1", user);

    expect(result.order.isBuyer).toBe(true);
    expect(result.order.fraudInspection).toBeNull();
  });

  it("keeps AI fraud details out of the buyer-visible payment timeline", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "order-1", reference: "PA-1", total_amount: "1000.00", payment_destination_ciphertext: null,
      }] })
      .mockResolvedValue({ rowCount: 1, rows: [] }) };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)) };
    const aiClient = { inspectReceipt: vi.fn().mockResolvedValue({
      confidenceScore: 0.98, extractedAmountAoa: 1000, extractedTransactionId: "TX-1",
      bankDetected: "Banco", tamperingSigns: true, verdict: "HIGH_RISK", details: "internal forensic signal",
    }) };
    const moderationAlerts = { emitAlert: vi.fn() };
    const controller = new OrdersController(database as never, aiClient as never, moderationAlerts as never, { queueNotification: vi.fn() } as never, {} as never);

    await controller.reportTransfer("order-1", { transferReference: "TRX-1234", note: "pago" }, user);

    const paymentEvent = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO manual_payment_events"));
    const orderEvent = client.query.mock.calls.find(([sql]) => String(sql).includes("'payment.reported'"));
    expect(paymentEvent?.[1]?.[3]).toBe("pago");
    expect(String(paymentEvent?.[1]?.[3])).not.toContain("HIGH_RISK");
    expect(String(orderEvent?.[1]?.[2])).not.toContain("HIGH_RISK");
    expect(moderationAlerts.emitAlert).toHaveBeenCalledOnce();
  });

  it("rejects non-product listings at checkout payment options", async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: listingId, seller_profile_id: "store-1", store_name: "ImobiliÃ¡ria",
        status: "published", seller_status: "active", available_quantity: 1, marketplace: "imoveis",
      }] }),
    };
    const controller = new OrdersController(database as never, {} as never, {} as never, { queueNotification: vi.fn() } as never, {} as never);

    await expect(controller.paymentOptions({ items: [{ listingId, quantity: 1 }] }, user)).rejects.toMatchObject({ status: 400 });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
