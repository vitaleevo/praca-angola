import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { randomBytes } from "node:crypto";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { SessionGuard } from "./auth/session.guard";
import { RateLimit } from "./rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";
import { decryptPrivateValue } from "./auth/auth.crypto";

class CheckoutItemDto {
  @IsUUID("4") listingId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) quantity!: number;
}

class CheckoutDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CheckoutItemDto) items!: CheckoutItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) buyerNote?: string;
}

class TransferReportDto {
  @IsString() @Length(4, 140) transferReference!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class FulfillmentDto {
  @IsString() @Length(2, 80) method!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class ActionNoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

function toCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function fromCents(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

@Injectable()
export class OrderMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.expireOrders().catch((error: unknown) => console.error("Order expiry task failed", error)); }, 60_000);
    this.timer.unref();
    void this.expireOrders().catch((error: unknown) => console.error("Initial order expiry task failed", error));
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async expireOrders(): Promise<void> {
    await this.database.transaction(async (client) => {
      const expired = await client.query<{ id: string }>(
        `SELECT id FROM orders WHERE payment_status = 'awaiting_transfer' AND payment_deadline < now()
         ORDER BY payment_deadline LIMIT 100 FOR UPDATE SKIP LOCKED`,
      );
      for (const order of expired.rows) {
        await client.query("UPDATE orders SET status = 'cancelled', payment_status = 'expired', updated_at = now() WHERE id = $1", [order.id]);
        await client.query("UPDATE listings l SET available_quantity = l.available_quantity + oi.quantity, updated_at = now() FROM order_items oi WHERE oi.order_id = $1 AND l.id = oi.listing_id", [order.id]);
        await client.query("INSERT INTO order_events (order_id, event_type, note) VALUES ($1, 'payment.expired', 'Prazo para reportar a transferência expirou; stock reposto.')", [order.id]);
      }
    });
  }
}

@Controller("orders")
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT o.id, o.reference, o.status, o.payment_status, o.total_amount::text, o.currency, o.payment_deadline, o.created_at,
              s.slug AS store_slug, s.display_name AS store_name,
              (o.buyer_id = $1) AS is_buyer,
              (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o JOIN seller_profiles s ON s.id = o.seller_profile_id
       WHERE o.buyer_id = $1 OR EXISTS (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = o.seller_profile_id AND sm.user_id = $1)
       ORDER BY o.created_at DESC LIMIT 100`, [user.id],
    );
    return { items: result.rows };
  }

  @Post()
  @RateLimit({ scope: "checkout", limit: 10, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async checkout(@Body() body: CheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    const ids = body.items.map((item) => item.listingId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "DUPLICATE_LISTING", message: "Combina as quantidades de produtos repetidos no carrinho." });
    return this.database.transaction(async (client) => {
      const listingRows: Array<{ id: string; seller_profile_id: string; title: string; price: string; currency: string; available_quantity: number; status: string; seller_status: string; has_payment_destination: boolean }> = [];
      for (const listingId of [...ids].sort()) {
        const result = await client.query<{ id: string; seller_profile_id: string; title: string; price: string; currency: string; available_quantity: number; status: string; seller_status: string; has_payment_destination: boolean }>(
          `SELECT l.id, l.seller_profile_id, l.title, l.price::text, l.currency, l.available_quantity, l.status, s.status AS seller_status,
                  (s.mcx_phone_ciphertext IS NOT NULL AND s.mcx_recipient_name_ciphertext IS NOT NULL) AS has_payment_destination
           FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id WHERE l.id = $1 FOR UPDATE OF l, s`, [listingId],
        );
        if (!result.rowCount || result.rows[0].status !== "published" || result.rows[0].seller_status !== "active") throw new BadRequestException({ code: "LISTING_UNAVAILABLE", message: "Um dos produtos já não está disponível." });
        listingRows.push(result.rows[0]);
      }
      const sellerIds = [...new Set(listingRows.map((row) => row.seller_profile_id))];
      for (const sellerId of sellerIds) {
        const ownStore = await client.query("SELECT 1 FROM store_memberships WHERE seller_profile_id = $1 AND user_id = $2", [sellerId, user.id]);
        if (ownStore.rowCount) throw new BadRequestException({ code: "CANNOT_BUY_FROM_OWN_STORE", message: "Não podes finalizar uma compra na tua própria loja." });
        if (!listingRows.some((row) => row.seller_profile_id === sellerId && row.has_payment_destination)) throw new BadRequestException({ code: "SELLER_PAYMENT_NOT_CONFIGURED", message: "Uma loja ainda não configurou o Multicaixa Express para receber transferências." });
      }
      const lines = body.items.map((item) => {
        const listing = listingRows.find((row) => row.id === item.listingId)!;
        if (listing.available_quantity < item.quantity) throw new BadRequestException({ code: "INSUFFICIENT_STOCK", message: `Stock insuficiente para ${listing.title}.` });
        const lineCents = toCents(listing.price) * BigInt(item.quantity);
        return { ...item, listing, lineCents };
      });
      const orders = [];
      for (const sellerId of sellerIds) {
        const sellerLines = lines.filter((line) => line.listing.seller_profile_id === sellerId);
        const totalCents = sellerLines.reduce((sum, line) => sum + line.lineCents, 0n);
        const reference = `PA-${randomBytes(6).toString("hex").toUpperCase()}`;
        const order = await client.query<{ id: string; reference: string }>(
          `INSERT INTO orders (reference, buyer_id, seller_profile_id, total_amount, payment_deadline, buyer_note)
           VALUES ($1, $2, $3, $4, now() + interval '30 minutes', $5) RETURNING id, reference`,
          [reference, user.id, sellerId, fromCents(totalCents), body.buyerNote?.trim() ?? ""],
        );
        for (const line of sellerLines) {
          await client.query("UPDATE listings SET available_quantity = available_quantity - $2, updated_at = now() WHERE id = $1", [line.listing.id, line.quantity]);
          await client.query("INSERT INTO order_items (order_id, listing_id, title_snapshot, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6)", [order.rows[0].id, line.listing.id, line.listing.title, line.quantity, line.listing.price, fromCents(line.lineCents)]);
        }
        await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'order.created', 'Encomenda criada; stock reservado por 30 minutos.')", [order.rows[0].id, user.id]);
        await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'order.created', 'order', $2)", [user.id, order.rows[0].id]);
        orders.push({ ...order.rows[0], totalAmount: fromCents(totalCents), currency: "AOA", status: "awaiting_payment", paymentDeadlineMinutes: 30, paymentMethod: "manual_multicaixa_express_transfer" });
      }
      return { orders };
    });
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const orderResult = await this.database.query<{
      id: string; reference: string; buyer_id: string; seller_profile_id: string; status: string; payment_status: string;
      total_amount: string; currency: string; payment_deadline: Date; buyer_note: string; created_at: Date;
      store_name: string; store_slug: string; can_manage: boolean; mcx_recipient_name_ciphertext: string | null; mcx_phone_ciphertext: string | null;
    }>(
      `SELECT o.id, o.reference, o.buyer_id, o.seller_profile_id, o.status, o.payment_status, o.total_amount::text, o.currency,
              o.payment_deadline, o.buyer_note, o.created_at, s.display_name AS store_name, s.slug AS store_slug,
              s.mcx_recipient_name_ciphertext, s.mcx_phone_ciphertext,
              EXISTS (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = s.id AND sm.user_id = $2 AND sm.role IN ('owner', 'editor')) AS can_manage
       FROM orders o JOIN seller_profiles s ON s.id = o.seller_profile_id
       WHERE o.id = $1 AND (o.buyer_id = $2 OR EXISTS (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = o.seller_profile_id AND sm.user_id = $2))`, [id, user.id],
    );
    const order = orderResult.rows[0];
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Encomenda não encontrada." });
    const [items, events, payments] = await Promise.all([
      this.database.query("SELECT id, title_snapshot AS title, quantity, unit_price::text, line_total::text FROM order_items WHERE order_id = $1 ORDER BY created_at", [id]),
      this.database.query<{ event_type: string; note: string; created_at: Date | string }>("SELECT event_type, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at", [id]),
      this.database.query<{ event_type: string; transfer_reference: string; note: string; created_at: Date | string }>("SELECT event_type, transfer_reference, note, created_at FROM manual_payment_events WHERE order_id = $1 ORDER BY created_at", [id]),
    ]);
    const isBuyer = order.buyer_id === user.id;
    let paymentDestination: { recipientName: string; phone: string } | null = null;
    if (isBuyer && order.mcx_recipient_name_ciphertext && order.mcx_phone_ciphertext && order.payment_status !== "expired" && order.payment_status !== "rejected") {
      paymentDestination = { recipientName: decryptPrivateValue(order.mcx_recipient_name_ciphertext), phone: decryptPrivateValue(order.mcx_phone_ciphertext) };
    }
    return {
      order: { canManage: order.can_manage, id: order.id, reference: order.reference, status: order.status, paymentStatus: order.payment_status, totalAmount: order.total_amount, currency: order.currency, paymentDeadline: order.payment_deadline, buyerNote: order.buyer_note, createdAt: order.created_at, store: { name: order.store_name, slug: order.store_slug }, isBuyer, paymentMethod: "manual_multicaixa_express_transfer", paymentDestination },
      items: items.rows,
      timeline: [...events.rows, ...payments.rows.map((event) => ({ ...event, event_type: `payment.${event.event_type}` }))].sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()),
    };
  }

  @Post(":id/payment/report")
  async reportTransfer(@Param("id") id: string, @Body() body: TransferReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>("SELECT id FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'awaiting_payment' AND payment_status = 'awaiting_transfer' AND payment_deadline > now() FOR UPDATE", [id, user.id]);
      if (!order.rowCount) throw new BadRequestException({ code: "ORDER_PAYMENT_NOT_OPEN", message: "Esta encomenda já não aguarda uma transferência." });
      await client.query("UPDATE orders SET status = 'payment_reported', payment_status = 'buyer_reported', updated_at = now() WHERE id = $1", [id]);
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, transfer_reference, note) VALUES ($1, $2, 'buyer_reported_transfer', $3, $4)", [id, user.id, body.transferReference.trim(), body.note?.trim() ?? ""]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'payment.reported', 'O comprador reportou a transferência. A loja deve confirmar no seu extrato Multicaixa Express.')", [id, user.id]);
      return { id, status: "payment_reported", message: "A loja foi notificada. O report do comprador não confirma a receção dos fundos." };
    });
  }

  @Post(":id/payment/confirm")
  async confirmTransfer(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>(
        `SELECT o.id FROM orders o JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'payment_reported' AND o.payment_status = 'buyer_reported' FOR UPDATE OF o`, [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "TRANSFER_NOT_AWAITING_CONFIRMATION", message: "Não há uma transferência reportada para confirmar." });
      await client.query("UPDATE orders SET status = 'preparing', payment_status = 'confirmed_by_seller', updated_at = now() WHERE id = $1", [id]);
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'seller_confirmed_transfer', 'Loja confirmou a receção após verificar o extrato.')", [id, user.id]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'payment.confirmed_by_seller', 'Loja confirmou manualmente a receção da transferência.')", [id, user.id]);
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'payment.confirmed_manual', 'order', $2)", [user.id, id]);
      return { id, status: "preparing", paymentStatus: "confirmed_by_seller" };
    });
  }

  @Post(":id/payment/reject")
  async rejectTransfer(@Param("id") id: string, @Body() body: ActionNoteDto, @CurrentUser() user: AuthenticatedUser) {
    const note = body.note?.trim().slice(0, 1000) ?? "A loja não conseguiu confirmar a receção no extrato.";
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>(
        `SELECT o.id FROM orders o JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'payment_reported' AND o.payment_status = 'buyer_reported' FOR UPDATE OF o`, [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "TRANSFER_NOT_AWAITING_CONFIRMATION", message: "Não há uma transferência reportada para rejeitar." });
      await client.query("UPDATE orders SET status = 'cancelled', payment_status = 'rejected', updated_at = now() WHERE id = $1", [id]);
      await client.query("UPDATE listings l SET available_quantity = l.available_quantity + oi.quantity, updated_at = now() FROM order_items oi WHERE oi.order_id = $1 AND l.id = oi.listing_id", [id]);
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'seller_rejected_transfer', $3)", [id, user.id, note]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'payment.rejected', $3)", [id, user.id, note]);
      return { id, status: "cancelled", paymentStatus: "rejected" };
    });
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>("SELECT id FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'awaiting_payment' AND payment_status = 'awaiting_transfer' FOR UPDATE", [id, user.id]);
      if (!order.rowCount) throw new BadRequestException({ code: "ORDER_CANNOT_CANCEL", message: "Só podes cancelar uma encomenda que ainda aguarda transferência." });
      await client.query("UPDATE orders SET status = 'cancelled', payment_status = 'expired', updated_at = now() WHERE id = $1", [id]);
      await client.query("UPDATE listings l SET available_quantity = l.available_quantity + oi.quantity, updated_at = now() FROM order_items oi WHERE oi.order_id = $1 AND l.id = oi.listing_id", [id]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'order.cancelled_by_buyer', 'Stock reposto após cancelamento pelo comprador.')", [id, user.id]);
      return { id, status: "cancelled" };
    });
  }

  @Post(":id/refund/request")
  async requestRefund(@Param("id") id: string, @Body() body: ActionNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>("SELECT id FROM orders WHERE id = $1 AND buyer_id = $2 AND status IN ('preparing', 'ready_for_pickup') AND payment_status = 'confirmed_by_seller' FOR UPDATE", [id, user.id]);
      if (!order.rowCount) throw new BadRequestException({ code: "REFUND_NOT_ALLOWED", message: "Pede o reembolso à loja antes da expedição." });
      await client.query("UPDATE orders SET status = 'refund_requested', payment_status = 'refund_requested', updated_at = now() WHERE id = $1", [id]);
      const note = body.note?.trim().slice(0, 1000) ?? "";
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'buyer_requested_refund', $3)", [id, user.id, note]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'refund.requested', $3)", [id, user.id, note]);
      return { id, status: "refund_requested" };
    });
  }

  @Post(":id/refund/confirm")
  async confirmRefund(@Param("id") id: string, @Body() body: ActionNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>(
        `SELECT o.id FROM orders o JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'refund_requested' FOR UPDATE OF o`, [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "REFUND_NOT_REQUESTED", message: "Não há um reembolso pendente para esta encomenda." });
      await client.query("UPDATE orders SET status = 'refunded', payment_status = 'refund_confirmed', updated_at = now() WHERE id = $1", [id]);
      await client.query("UPDATE listings l SET available_quantity = l.available_quantity + oi.quantity, updated_at = now() FROM order_items oi WHERE oi.order_id = $1 AND l.id = oi.listing_id", [id]);
      const note = body.note?.trim().slice(0, 1000) ?? "A loja confirmou manualmente o reembolso.";
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'seller_confirmed_refund', $3)", [id, user.id, note]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'refund.confirmed_by_seller', $3)", [id, user.id, note]);
      return { id, status: "refunded", paymentStatus: "refund_confirmed" };
    });
  }

  @Patch(":id/fulfillment")
  async fulfillment(@Param("id") id: string, @Body() body: FulfillmentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!["ready_for_pickup", "out_for_delivery"].includes(body.method)) throw new BadRequestException({ code: "INVALID_FULFILLMENT", message: "Escolhe levantamento ou entrega." });
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string }>("SELECT o.id FROM orders o JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'preparing' AND o.payment_status = 'confirmed_by_seller' FOR UPDATE OF o", [id, user.id]);
      if (!order.rowCount) throw new BadRequestException({ code: "ORDER_NOT_PREPARING", message: "Só podes combinar a entrega depois de confirmares o pagamento." });
      await client.query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [id, body.method]);
      const note = body.note?.trim().slice(0, 1000) ?? "";
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, $3, $4)", [id, user.id, `fulfillment.${body.method}`, note]);
      return { id, status: body.method };
    });
  }

  @Post(":id/complete")
  async complete(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        "UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1 AND buyer_id = $2 AND status IN ('ready_for_pickup', 'out_for_delivery') RETURNING id",
        [id, user.id],
      );
      if (!result.rowCount) throw new BadRequestException({ code: "ORDER_NOT_READY_TO_COMPLETE", message: "A encomenda ainda não está pronta para confirmação." });
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'order.completed_by_buyer', 'Comprador confirmou a receção.')", [id, user.id]);
      return { id, status: "completed" };
    });
  }
}
