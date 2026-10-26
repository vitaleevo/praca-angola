import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { randomBytes } from "node:crypto";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { SessionGuard } from "./auth/session.guard";
import { RateLimit } from "./rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";
import { decryptPrivateValue, encryptPrivateValue } from "./auth/auth.crypto";
import { MANUAL_PAYMENT_METHODS, ManualPaymentMethod, PaymentDestinationSnapshot, paymentMethodLabel } from "./payments/payment-methods";
import type { PoolClient } from "pg";
import { LogisticsService } from "./logistics/logistics.service";

class CheckoutItemDto {
  @IsUUID("4") listingId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) quantity!: number;
}

class CheckoutItemsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CheckoutItemDto) items!: CheckoutItemDto[];
}

class PaymentMethodSelectionDto {
  @IsUUID("4") sellerProfileId!: string;
  @IsIn(MANUAL_PAYMENT_METHODS) method!: ManualPaymentMethod;
}

class DeliveryDto {
  @IsIn(["pickup", "courier"]) mode!: "pickup" | "courier";
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(100) municipality?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(200) landmark?: string;
  @IsOptional() @IsString() @MaxLength(100) recipientName?: string;
  @IsOptional() @IsString() @MaxLength(32) recipientPhone?: string;
}

class FreightQuoteDto extends CheckoutItemsDto {
  @ValidateNested() @Type(() => DeliveryDto) delivery!: DeliveryDto;
}

class CheckoutDto extends CheckoutItemsDto {
  @IsOptional() @IsString() @MaxLength(1000) buyerNote?: string;
  @IsOptional() @IsString() @MaxLength(32) buyerPhone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PaymentMethodSelectionDto) paymentMethods?: PaymentMethodSelectionDto[];
  @IsOptional() @ValidateNested() @Type(() => DeliveryDto) delivery?: DeliveryDto;
  @IsOptional() @IsString() @MaxLength(32) expectedTotal?: string;
}

import { AiClientService } from "./ai/ai-client.service";
import { ModerationAlertsService } from "./moderation-alerts.service";
import { NotificationsService } from "./notifications/notifications.service";

class TransferReportDto {
  @IsString() @Length(4, 140) transferReference!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() receiptImageUrl?: string;
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
  constructor(
    private readonly database: DatabaseService,
    private readonly aiClient: AiClientService,
    private readonly moderationAlerts: ModerationAlertsService,
    private readonly notifications: NotificationsService,
    private readonly logistics: LogisticsService,
  ) {}

  private validateDelivery(delivery?: DeliveryDto, requireAddress = true): DeliveryDto {
    const value = delivery ?? { mode: "pickup" as const };
    if (value.mode === "courier" && (!value.province?.trim() || !value.municipality?.trim() || (requireAddress && (!value.address?.trim() || !value.recipientName?.trim() || !/^(?:\+?244)?9\d{8}$/.test((value.recipientPhone ?? "").replace(/\s/g, "")) )))) {
      throw new BadRequestException({ code: "DELIVERY_DETAILS_REQUIRED", message: "Indica uma morada, destinatário e telefone válidos para a entrega." });
    }
    return value;
  }

  private async priceCart(client: PoolClient, items: CheckoutItemDto[], delivery: DeliveryDto) {
    const ids = items.map((item) => item.listingId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "DUPLICATE_LISTING", message: "Combina as quantidades de produtos repetidos no carrinho." });
    const listings = await client.query<{ id: string; seller_profile_id: string; price: string; status: string; seller_status: string; available_quantity: number }>(
      `SELECT l.id, l.seller_profile_id, l.price::text, l.status, s.status AS seller_status, l.available_quantity
       FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id WHERE l.id = ANY($1::uuid[])`, [ids],
    );
    if (listings.rowCount !== ids.length || listings.rows.some((row) => row.status !== "published" || row.seller_status !== "active" || row.available_quantity < items.find((item) => item.listingId === row.id)!.quantity)) {
      throw new BadRequestException({ code: "LISTING_UNAVAILABLE", message: "Um produto não está disponível na quantidade pedida." });
    }
    const shops = [];
    for (const sellerId of [...new Set(listings.rows.map((row) => row.seller_profile_id))]) {
      const productCents = items.reduce((sum, item) => {
        const listing = listings.rows.find((row) => row.id === item.listingId && row.seller_profile_id === sellerId);
        return sum + (listing ? toCents(listing.price) * BigInt(item.quantity) : 0n);
      }, 0n);
      if (delivery.mode === "pickup") {
        const settings = await client.query<{ local_pickup_enabled: boolean }>("SELECT local_pickup_enabled FROM store_shipping_settings WHERE seller_profile_id = $1", [sellerId]);
        if (settings.rowCount && !settings.rows[0].local_pickup_enabled) throw new BadRequestException({ code: "PICKUP_UNAVAILABLE", message: "Uma das lojas não aceita levantamento. Escolhe entrega com estafeta." });
      }
      const freight = delivery.mode === "courier"
        ? await this.logistics.calculateFreight({ sellerProfileId: sellerId, province: delivery.province!, municipality: delivery.municipality!, totalCartAmount: Number(productCents) / 100 }, client)
        : null;
      const shippingCents = freight ? BigInt(Math.round(freight.finalRate * 100)) : 0n;
      shops.push({ sellerProfileId: sellerId, productsTotal: fromCents(productCents), shippingFee: fromCents(shippingCents), totalAmount: fromCents(productCents + shippingCents), zoneName: freight?.zoneName ?? null });
    }
    const totalCents = shops.reduce((sum, shop) => sum + toCents(shop.totalAmount), 0n);
    return { shops, totalAmount: fromCents(totalCents), shippingFee: fromCents(shops.reduce((sum, shop) => sum + toCents(shop.shippingFee), 0n)) };
  }

  @Post("freight-quote")
  @RateLimit({ scope: "freight-quote", limit: 60, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async freightQuote(@Body() body: FreightQuoteDto) {
    const delivery = this.validateDelivery(body.delivery, false);
    return this.database.transaction((client) => this.priceCart(client, body.items, delivery));
  }

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

  @Post("payment-options")
  @RateLimit({ scope: "checkout-options", limit: 60, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async paymentOptions(@Body() body: CheckoutItemsDto, @CurrentUser() user: AuthenticatedUser) {
    const ids = body.items.map((item) => item.listingId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "DUPLICATE_LISTING", message: "Combina as quantidades de produtos repetidos no carrinho." });
    const listings = await this.database.query<{
      id: string;
      seller_profile_id: string;
      store_name: string;
      status: string;
      seller_status: string;
      available_quantity: number;
    }>(
      `SELECT l.id, l.seller_profile_id, s.display_name AS store_name, l.status, s.status AS seller_status, l.available_quantity
       FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id WHERE l.id = ANY($1::uuid[])`,
      [ids],
    );
    if (listings.rowCount !== ids.length || listings.rows.some((listing) => listing.status !== "published" || listing.seller_status !== "active")) {
      throw new BadRequestException({ code: "LISTING_UNAVAILABLE", message: "Um dos produtos já não está disponível." });
    }
    if (listings.rows.some((listing) => listing.available_quantity < body.items.find((item) => item.listingId === listing.id)!.quantity)) {
      throw new BadRequestException({ code: "INSUFFICIENT_STOCK", message: "O stock de um dos produtos já não chega para esta quantidade." });
    }
    const sellerIds = [...new Set(listings.rows.map((listing) => listing.seller_profile_id))];
    const ownStores = await this.database.query<{ seller_profile_id: string }>(
      "SELECT seller_profile_id FROM store_memberships WHERE user_id = $1 AND seller_profile_id = ANY($2::uuid[])",
      [user.id, sellerIds],
    );
    if (ownStores.rowCount) throw new BadRequestException({ code: "CANNOT_BUY_FROM_OWN_STORE", message: "Não podes finalizar uma compra na tua própria loja." });
    const methods = await this.database.query<{ seller_profile_id: string; method: ManualPaymentMethod }>(
      `SELECT seller_profile_id, method FROM seller_payment_methods
       WHERE seller_profile_id = ANY($1::uuid[]) AND enabled = true ORDER BY seller_profile_id, method`,
      [sellerIds],
    );
    const shops = new Map<string, { sellerProfileId: string; storeName: string; methods: Array<{ method: ManualPaymentMethod; label: string }> }>();
    for (const listing of listings.rows) {
      if (!shops.has(listing.seller_profile_id)) shops.set(listing.seller_profile_id, { sellerProfileId: listing.seller_profile_id, storeName: listing.store_name, methods: [] });
    }
    for (const method of methods.rows) {
      shops.get(method.seller_profile_id)?.methods.push({ method: method.method, label: paymentMethodLabel(method.method) });
    }
    return { shops: [...shops.values()] };
  }

  @Post()
  @RateLimit({ scope: "checkout", limit: 10, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async checkout(@Body() body: CheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    if (!body.delivery && body.buyerNote?.startsWith("[Entrega Estafeta PUVO]")) {
      throw new ConflictException({ code: "CHECKOUT_CLIENT_OUTDATED", message: "Atualiza a página do carrinho para confirmar o frete antes de comprar." });
    }
    const delivery = this.validateDelivery(body.delivery);
    const ids = body.items.map((item) => item.listingId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "DUPLICATE_LISTING", message: "Combina as quantidades de produtos repetidos no carrinho." });
    return this.database.transaction(async (client) => {
      const listingRows: Array<{ id: string; seller_profile_id: string; title: string; price: string; currency: string; available_quantity: number; status: string; seller_status: string }> = [];
      for (const listingId of [...ids].sort()) {
        const result = await client.query<{ id: string; seller_profile_id: string; title: string; price: string; currency: string; available_quantity: number; status: string; seller_status: string }>(
          `SELECT l.id, l.seller_profile_id, l.title, l.price::text, l.currency, l.available_quantity, l.status, s.status AS seller_status
           FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id WHERE l.id = $1 FOR UPDATE OF l, s`, [listingId],
        );
        if (!result.rowCount || result.rows[0].status !== "published" || result.rows[0].seller_status !== "active") throw new BadRequestException({ code: "LISTING_UNAVAILABLE", message: "Um dos produtos já não está disponível." });
        listingRows.push(result.rows[0]);
      }
      const sellerIds = [...new Set(listingRows.map((row) => row.seller_profile_id))];
      for (const sellerId of sellerIds) {
        const ownStore = await client.query("SELECT 1 FROM store_memberships WHERE seller_profile_id = $1 AND user_id = $2", [sellerId, user.id]);
        if (ownStore.rowCount) throw new BadRequestException({ code: "CANNOT_BUY_FROM_OWN_STORE", message: "Não podes finalizar uma compra na tua própria loja." });
      }
      const requestedMethods = new Map<string, ManualPaymentMethod>();
      for (const selection of body.paymentMethods ?? []) {
        if (requestedMethods.has(selection.sellerProfileId)) throw new BadRequestException({ code: "DUPLICATE_PAYMENT_METHOD", message: "Escolhe apenas um método de pagamento por loja." });
        requestedMethods.set(selection.sellerProfileId, selection.method);
      }
      if (body.paymentMethods && (requestedMethods.size !== sellerIds.length || [...requestedMethods.keys()].some((sellerId) => !sellerIds.includes(sellerId)))) {
        throw new BadRequestException({ code: "INVALID_PAYMENT_METHOD_SELECTION", message: "Escolhe um método de pagamento para cada loja do carrinho." });
      }
      const selectedMethods = new Map<string, { method: ManualPaymentMethod; destinationCiphertext: string }>();
      for (const sellerId of sellerIds) {
        const available = await client.query<{
          method: ManualPaymentMethod;
          recipient_name_ciphertext: string;
          recipient_identifier_ciphertext: string;
          provider_name_ciphertext: string | null;
        }>(
          `SELECT method, recipient_name_ciphertext, recipient_identifier_ciphertext, provider_name_ciphertext
           FROM seller_payment_methods WHERE seller_profile_id = $1 AND enabled = true ORDER BY method FOR SHARE`,
          [sellerId],
        );
        if (!available.rowCount) throw new BadRequestException({ code: "SELLER_PAYMENT_NOT_CONFIGURED", message: "Uma loja ainda não ativou um método de pagamento." });
        const requested = requestedMethods.get(sellerId);
        const selected = requested
          ? available.rows.find((method) => method.method === requested)
          : available.rows.find((method) => method.method === "manual_multicaixa_express_transfer") ?? (available.rowCount === 1 ? available.rows[0] : undefined);
        if (!selected) {
          throw new BadRequestException({ code: requested ? "PAYMENT_METHOD_UNAVAILABLE" : "PAYMENT_METHOD_REQUIRED", message: requested ? "Esse método já não está disponível nesta loja." : "Escolhe o método de pagamento de cada loja." });
        }
        const destination: PaymentDestinationSnapshot = {
          recipientName: decryptPrivateValue(selected.recipient_name_ciphertext),
          recipientIdentifier: decryptPrivateValue(selected.recipient_identifier_ciphertext),
          providerName: selected.provider_name_ciphertext ? decryptPrivateValue(selected.provider_name_ciphertext) : null,
        };
        selectedMethods.set(sellerId, { method: selected.method, destinationCiphertext: encryptPrivateValue(JSON.stringify(destination)) });
      }
      const lines = body.items.map((item) => {
        const listing = listingRows.find((row) => row.id === item.listingId)!;
        if (listing.available_quantity < item.quantity) throw new BadRequestException({ code: "INSUFFICIENT_STOCK", message: `Stock insuficiente para ${listing.title}.` });
        const lineCents = toCents(listing.price) * BigInt(item.quantity);
        return { ...item, listing, lineCents };
      });
      const pricedCart = await this.priceCart(client, body.items, delivery);
      if (body.expectedTotal && (!/^\d{1,12}\.\d{2}$/.test(body.expectedTotal) || toCents(body.expectedTotal) !== toCents(pricedCart.totalAmount))) {
        throw new ConflictException({ code: "TOTAL_CHANGED", message: "O total mudou. Confirma o novo valor antes de comprar." });
      }
      const orders = [];
      for (const sellerId of sellerIds) {
        const sellerLines = lines.filter((line) => line.listing.seller_profile_id === sellerId);
        const shopPrice = pricedCart.shops.find((shop) => shop.sellerProfileId === sellerId)!;
        const totalCents = toCents(shopPrice.totalAmount);
        const reference = `PA-${randomBytes(6).toString("hex").toUpperCase()}`;
        const payment = selectedMethods.get(sellerId)!;
        const order = await client.query<{ id: string; reference: string }>(
          `INSERT INTO orders (reference, buyer_id, seller_profile_id, total_amount, payment_deadline, buyer_note, buyer_phone, payment_method, payment_destination_ciphertext, delivery_mode, shipping_fee, delivery_details_ciphertext)
           VALUES ($1, $2, $3, $4, now() + interval '30 minutes', $5, $6, $7, $8, $9, $10, $11) RETURNING id, reference`,
          [reference, user.id, sellerId, fromCents(totalCents), body.buyerNote?.trim() ?? "", body.buyerPhone?.trim() ?? null, payment.method, payment.destinationCiphertext, delivery.mode, shopPrice.shippingFee, delivery.mode === "courier" ? encryptPrivateValue(JSON.stringify(delivery)) : null],
        );
        for (const line of sellerLines) {
          await client.query("UPDATE listings SET available_quantity = available_quantity - $2, updated_at = now() WHERE id = $1", [line.listing.id, line.quantity]);
          await client.query("INSERT INTO order_items (order_id, listing_id, title_snapshot, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6)", [order.rows[0].id, line.listing.id, line.listing.title, line.quantity, line.listing.price, fromCents(line.lineCents)]);
        }
        await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'order.created', 'Encomenda criada; stock reservado por 30 minutos.')", [order.rows[0].id, user.id]);
        await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'order.created', 'order', $2)", [user.id, order.rows[0].id]);

        // Notify seller via WhatsApp/SMS
        const storeInfo = await client.query<{ display_name: string; contact_phone: string | null; owner_phone: string | null }>(
          `SELECT s.display_name, s.contact_phone, u.phone AS owner_phone
           FROM seller_profiles s
           LEFT JOIN users u ON u.id = s.owner_user_id
           WHERE s.id = $1`,
          [sellerId],
        );
        const sellerPhone = storeInfo.rows[0]?.contact_phone || storeInfo.rows[0]?.owner_phone || "+244923111222";
        await this.notifications.queueNotification({
          userId: user.id,
          recipientPhone: sellerPhone,
          channel: "whatsapp",
          templateSlug: "order_created_seller",
          variables: {
            store_name: storeInfo.rows[0]?.display_name || "Loja PUVO",
            order_ref: reference,
            amount: fromCents(totalCents),
          },
        }, client);

        orders.push({ ...order.rows[0], totalAmount: fromCents(totalCents), shippingFee: shopPrice.shippingFee, currency: "AOA", status: "awaiting_payment", paymentDeadlineMinutes: 30, paymentMethod: payment.method });
      }
      return { orders };
    });
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const orderResult = await this.database.query<{
      id: string; reference: string; buyer_id: string; seller_profile_id: string; status: string; payment_status: string;
      total_amount: string; shipping_fee: string; delivery_mode: "pickup" | "courier"; delivery_details_ciphertext: string | null; currency: string; payment_deadline: Date; buyer_note: string; created_at: Date;
      store_name: string; store_slug: string; can_manage: boolean; payment_method: ManualPaymentMethod; payment_destination_ciphertext: string | null;
      mcx_recipient_name_ciphertext: string | null; mcx_phone_ciphertext: string | null;
    }>(
      `SELECT o.id, o.reference, o.buyer_id, o.seller_profile_id, o.status, o.payment_status, o.payment_method, o.payment_destination_ciphertext, o.total_amount::text, o.shipping_fee::text, o.delivery_mode, o.delivery_details_ciphertext, o.currency,
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
    let paymentDestination: (PaymentDestinationSnapshot & { method: ManualPaymentMethod; phone?: string }) | null = null;
    if (isBuyer && order.payment_status !== "expired" && order.payment_status !== "rejected") {
      let destination: PaymentDestinationSnapshot | null = null;
      if (order.payment_destination_ciphertext) {
        destination = JSON.parse(decryptPrivateValue(order.payment_destination_ciphertext)) as PaymentDestinationSnapshot;
      } else if (order.payment_method === "manual_multicaixa_express_transfer" && order.mcx_recipient_name_ciphertext && order.mcx_phone_ciphertext) {
        destination = {
          recipientName: decryptPrivateValue(order.mcx_recipient_name_ciphertext),
          recipientIdentifier: decryptPrivateValue(order.mcx_phone_ciphertext),
          providerName: null,
        };
      }
      if (destination) {
        paymentDestination = {
          ...destination,
          method: order.payment_method,
          ...(order.payment_method === "manual_multicaixa_express_transfer" ? { phone: destination.recipientIdentifier } : {}),
        };
      }
    }

    const fraudInspectionRes = await this.database.query<{
      confidence_score: number;
      extracted_amount_aoa: number | null;
      extracted_transaction_id: string | null;
      bank_detected: string | null;
      tampering_signs: boolean;
      verdict: string;
      details: string;
      created_at: string;
    }>(
      `SELECT confidence_score, extracted_amount_aoa, extracted_transaction_id, bank_detected, tampering_signs, verdict, details, created_at
       FROM order_fraud_inspections WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [order.id],
    );

    return {
      order: {
        canManage: order.can_manage,
        id: order.id,
        reference: order.reference,
        status: order.status,
        paymentStatus: order.payment_status,
        totalAmount: order.total_amount,
        shippingFee: order.shipping_fee,
        deliveryMode: order.delivery_mode,
        delivery: order.delivery_details_ciphertext ? JSON.parse(decryptPrivateValue(order.delivery_details_ciphertext)) as DeliveryDto : null,
        currency: order.currency,
        paymentDeadline: order.payment_deadline,
        buyerNote: order.buyer_note,
        createdAt: order.created_at,
        store: { name: order.store_name, slug: order.store_slug },
        isBuyer,
        paymentMethod: order.payment_method,
        paymentDestination,
        fraudInspection: fraudInspectionRes.rows[0] ?? null,
      },
      items: items.rows,
      timeline: [...events.rows, ...payments.rows.map((event) => ({ ...event, event_type: `payment.${event.event_type}` }))].sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()),
    };
  }

  @Post(":id/payment/report")
  async reportTransfer(@Param("id") id: string, @Body() body: TransferReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string; reference: string; total_amount: string; payment_destination_ciphertext: string | null }>(
        "SELECT id, reference, total_amount::text, payment_destination_ciphertext FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'awaiting_payment' AND payment_status = 'awaiting_transfer' AND payment_deadline > now() FOR UPDATE",
        [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "ORDER_PAYMENT_NOT_OPEN", message: "Esta encomenda já não aguarda uma transferência." });

      const orderRow = order.rows[0];
      let expectedRecipient = "";
      if (orderRow.payment_destination_ciphertext) {
        try {
          const dest = JSON.parse(decryptPrivateValue(orderRow.payment_destination_ciphertext)) as { recipientName?: string };
          expectedRecipient = dest.recipientName || "";
        } catch {
          // ignore decrypt failure
        }
      }

      let aiNote = "";
      try {
        const fraudCheck = await this.aiClient.inspectReceipt({
          imageUrl: body.receiptImageUrl,
          expectedAmountAoa: Number(orderRow.total_amount),
          expectedRecipientName: expectedRecipient,
        });
        if (fraudCheck) {
          await client.query(
            `INSERT INTO order_fraud_inspections (order_id, confidence_score, extracted_amount_aoa, extracted_transaction_id, bank_detected, tampering_signs, verdict, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              id,
              fraudCheck.confidenceScore,
              fraudCheck.extractedAmountAoa ?? null,
              fraudCheck.extractedTransactionId ?? null,
              fraudCheck.bankDetected ?? null,
              fraudCheck.tamperingSigns,
              fraudCheck.verdict,
              fraudCheck.details,
            ],
          );
          if (fraudCheck.tamperingSigns || fraudCheck.verdict === "HIGH_RISK" || fraudCheck.verdict === "SUSPICIOUS") {
            aiNote = ` [Alerta IA: ${fraudCheck.verdict} - ${fraudCheck.details}]`;
            await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'fraud.receipt_flagged', 'order', $2)", [user.id, id]);
            this.moderationAlerts.emitAlert({
              type: "fraud_receipt",
              entityId: id,
              title: `Comprovativo sob suspeita (${fraudCheck.verdict}) na encomenda #${orderRow.reference}`,
              riskScore: Math.round(Number(fraudCheck.confidenceScore) * 100),
              verdict: fraudCheck.verdict,
              reasons: [fraudCheck.details || "Inconsistência forense detectada no comprovativo"],
            });
          }
        }
      } catch {
        // Graceful degradation: never block payment reporting if AI is offline
      }

      await client.query("UPDATE orders SET status = 'payment_reported', payment_status = 'buyer_reported', updated_at = now() WHERE id = $1", [id]);
      await client.query(
        "INSERT INTO manual_payment_events (order_id, actor_id, event_type, transfer_reference, note) VALUES ($1, $2, 'buyer_reported_transfer', $3, $4)",
        [id, user.id, body.transferReference.trim(), ((body.note?.trim() ?? "") + aiNote).trim()],
      );
      await client.query(
        "INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'payment.reported', $3)",
        [id, user.id, `O comprador reportou a transferência.${aiNote ? " ATENÇÃO: Verificar extrato bancário real." : " A loja deve confirmar o crédito no seu extrato."}`],
      );
      return { id, status: "payment_reported", message: "A loja foi notificada. O report do comprador não confirma a receção dos fundos." };
    });
  }

  @Post(":id/payment/confirm")
  async confirmTransfer(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ id: string; reference: string; buyer_id: string; buyer_phone: string | null; buyer_name: string; store_name: string; user_phone: string | null }>(
        `SELECT o.id, o.reference, o.buyer_id, o.buyer_phone, u.phone AS user_phone, u.display_name AS buyer_name, s.display_name AS store_name
         FROM orders o
         JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         JOIN seller_profiles s ON s.id = o.seller_profile_id
         JOIN users u ON u.id = o.buyer_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'payment_reported' AND o.payment_status = 'buyer_reported'
         FOR UPDATE OF o`, [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "TRANSFER_NOT_AWAITING_CONFIRMATION", message: "Não há uma transferência reportada para confirmar." });
      await client.query("UPDATE orders SET status = 'preparing', payment_status = 'confirmed_by_seller', updated_at = now() WHERE id = $1", [id]);
      await client.query("INSERT INTO manual_payment_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'seller_confirmed_transfer', 'Loja confirmou a receção após verificar o extrato.')", [id, user.id]);
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'payment.confirmed_by_seller', 'Loja confirmou manualmente a receção da transferência.')", [id, user.id]);
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, 'payment.confirmed_manual', 'order', $2)", [user.id, id]);

      const row = order.rows[0];
      const buyerPhone = row.buyer_phone || row.user_phone || "+244923111222";
      await this.notifications.queueNotification({
        userId: row.buyer_id,
        recipientPhone: buyerPhone,
        channel: "whatsapp",
        templateSlug: "payment_confirmed_buyer",
        variables: {
          customer_name: row.buyer_name || "Cliente PUVO",
          order_ref: row.reference,
          store_name: row.store_name,
        },
      }, client);

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
      const order = await client.query<{ id: string; reference: string; buyer_id: string; buyer_phone: string | null; store_name: string; user_phone: string | null; delivery_mode: string }>(
        `SELECT o.id, o.reference, o.buyer_id, o.buyer_phone, o.delivery_mode, u.phone AS user_phone, s.display_name AS store_name
         FROM orders o
         JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         JOIN seller_profiles s ON s.id = o.seller_profile_id
         JOIN users u ON u.id = o.buyer_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor') AND o.status = 'preparing' AND o.payment_status = 'confirmed_by_seller'
         FOR UPDATE OF o`, [id, user.id],
      );
      if (!order.rowCount) throw new BadRequestException({ code: "ORDER_NOT_PREPARING", message: "Só podes combinar a entrega depois de confirmares o pagamento." });
      if (body.method === "out_for_delivery" || (body.method === "ready_for_pickup" && order.rows[0].delivery_mode !== "pickup")) {
        throw new BadRequestException({ code: "DELIVERY_MODE_MISMATCH", message: "Usa o modo de entrega escolhido pelo comprador." });
      }
      await client.query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [id, body.method]);
      const note = body.note?.trim().slice(0, 1000) ?? "";
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, $3, $4)", [id, user.id, `fulfillment.${body.method}`, note]);

      if (body.method === "out_for_delivery" && order.rows[0]) {
        const row = order.rows[0];
        const buyerPhone = row.buyer_phone || row.user_phone || "+244923111222";
        await this.notifications.queueNotification({
          userId: row.buyer_id,
          recipientPhone: buyerPhone,
          channel: "whatsapp",
          templateSlug: "order_shipped_buyer",
          variables: {
            order_ref: row.reference,
            store_name: row.store_name,
          },
        }, client);
      }

      return { id, status: body.method };
    });
  }

  @Post(":id/complete")
  async complete(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `UPDATE orders SET status = 'completed', updated_at = now()
         WHERE id = $1 AND buyer_id = $2 AND status IN ('ready_for_pickup', 'out_for_delivery')
           AND NOT EXISTS (
             SELECT 1 FROM delivery_assignments d
             WHERE d.order_id = orders.id AND d.status IN ('assigned', 'picked_up', 'in_transit', 'arrived')
           ) RETURNING id`,
        [id, user.id],
      );
      if (!result.rowCount) throw new BadRequestException({ code: "ORDER_NOT_READY_TO_COMPLETE", message: "A encomenda ainda não está pronta para confirmação." });
      await client.query("INSERT INTO order_events (order_id, actor_id, event_type, note) VALUES ($1, $2, 'order.completed_by_buyer', 'Comprador confirmou a receção.')", [id, user.id]);
      return { id, status: "completed" };
    });
  }
}
