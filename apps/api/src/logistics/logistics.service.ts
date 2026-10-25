import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { decryptPrivateValue, encryptPrivateValue } from "../auth/auth.crypto";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CalculateFreightParams,
  Courier,
  CourierStatus,
  DeliveryAssignment,
  DeliveryZone,
  FreightCalculationResult,
  StoreShippingSettings,
  VehicleType,
} from "./logistics.types";
import { normalizeAngolanPhone } from "../notifications/phone.utils";

interface CreateCourierDto {
  userId: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  licensePlate?: string;
}

interface AssignCourierParams {
  orderId: string;
  courierId?: string;
  actorUserId: string;
}

interface VerifyDeliveryPinParams {
  deliveryId: string;
  pin: string;
  courierUserId: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * List all configured Angolan delivery zones
   */
  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const res = await this.database.query<DeliveryZone>(
      `SELECT id, name, province, municipalities, base_rate::text, estimated_hours_min, estimated_hours_max, active
       FROM delivery_zones
       WHERE active = true
       ORDER BY base_rate ASC`,
    );
    return res.rows;
  }

  /**
   * Calculate freight dynamically based on store settings, destination municipality & order value
   */
  async calculateFreight(params: CalculateFreightParams, client?: PoolClient): Promise<FreightCalculationResult> {
    const municipalityClean = params.municipality.trim().toLowerCase();
    const provinceClean = params.province.trim().toLowerCase();

    // 1. Find matching delivery zone (matches municipality first, then province)
    const zonesResult = client ? await client.query<DeliveryZone>(
      `SELECT id, name, province, municipalities, base_rate::text, estimated_hours_min, estimated_hours_max, active
       FROM delivery_zones WHERE active = true ORDER BY base_rate ASC`,
    ) : await this.database.query<DeliveryZone>(
      `SELECT id, name, province, municipalities, base_rate::text, estimated_hours_min, estimated_hours_max, active
       FROM delivery_zones WHERE active = true ORDER BY base_rate ASC`,
    );
    const zones = zonesResult.rows;
    const matchedZone = zones.find((z) =>
      z.province.toLowerCase() === provinceClean && z.municipalities.some((m) => m.toLowerCase() === municipalityClean),
    ) ?? zones.find((z) =>
      z.province.toLowerCase() === "outras" && provinceClean === "outras" && z.municipalities.some((m) => m.toLowerCase() === municipalityClean),
    );
    if (!matchedZone) throw new BadRequestException({ code: "DELIVERY_ZONE_UNAVAILABLE", message: "Ainda não entregamos neste município. Escolhe levantamento na loja." });

    const baseRate = Number(matchedZone.base_rate);

    // 2. Load store shipping settings
    const storeSettingsSql = `SELECT id, seller_profile_id, free_shipping_threshold::text, local_pickup_enabled, pickup_address, custom_zone_rates
       FROM store_shipping_settings WHERE seller_profile_id = $1 LIMIT 1`;
    const storeSettingsRes = client ? await client.query<StoreShippingSettings>(storeSettingsSql, [params.sellerProfileId]) : await this.database.query<StoreShippingSettings>(storeSettingsSql, [params.sellerProfileId]);

    const storeSettings = storeSettingsRes.rows[0];
    const freeThreshold = storeSettings?.free_shipping_threshold ? Number(storeSettings.free_shipping_threshold) : null;
    const customRate = storeSettings?.custom_zone_rates?.[matchedZone.id];

    let finalRate = customRate !== undefined ? Number(customRate) : baseRate;
    if (!Number.isFinite(finalRate) || finalRate < 0) throw new BadRequestException({ code: "INVALID_SHIPPING_RATE", message: "O frete desta loja está indisponível." });
    let isFreeShipping = false;

    // Free shipping threshold rule
    if (freeThreshold !== null && (params.totalCartAmount ?? 0) >= freeThreshold) {
      finalRate = 0;
      isFreeShipping = true;
    }

    return {
      zoneId: matchedZone.id,
      zoneName: matchedZone.name,
      province: matchedZone.province,
      baseRate,
      finalRate,
      isFreeShipping,
      freeShippingThreshold: freeThreshold,
      estimatedHoursMin: matchedZone.estimated_hours_min,
      estimatedHoursMax: matchedZone.estimated_hours_max,
      localPickupAvailable: storeSettings?.local_pickup_enabled ?? true,
      pickupAddress: storeSettings?.pickup_address || null,
    };
  }

  /**
   * Register a new courier
   */
  async registerCourier(dto: CreateCourierDto): Promise<Courier> {
    const normalizedPhone = normalizeAngolanPhone(dto.phone);

    const user = await this.database.query(
      "SELECT 1 FROM users WHERE id = $1 AND status = 'active'",
      [dto.userId],
    );
    if (!user.rowCount) throw new BadRequestException({ code: "COURIER_USER_INVALID", message: "O utilizador do estafeta não está ativo." });

    const res = await this.database.query<Courier>(
      `INSERT INTO couriers (user_id, full_name, phone, vehicle_type, license_plate, status, approved_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now())
       RETURNING *`,
      [dto.userId, dto.fullName.trim(), normalizedPhone, dto.vehicleType, dto.licensePlate?.trim() || null],
    );

    return res.rows[0];
  }

  /**
   * List couriers available for dispatch
   */
  async approveCourier(courierId: string): Promise<Courier> {
    const result = await this.database.query<Courier>(
      `UPDATE couriers SET approved_at = now(), status = 'active', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [courierId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: "COURIER_NOT_FOUND", message: "Estafeta não encontrado." });
    return result.rows[0];
  }

  async listCouriers(status: CourierStatus | undefined, actorUserId: string, isAdministrator: boolean): Promise<Courier[]> {
    if (!isAdministrator) {
      const seller = await this.database.query(
        `SELECT 1 FROM store_memberships WHERE user_id = $1 AND role IN ('owner', 'editor') LIMIT 1`,
        [actorUserId],
      );
      if (!seller.rowCount) throw new NotFoundException({ code: "COURIERS_NOT_FOUND", message: "Estafetas não disponíveis." });
    }
    const where = status ? `WHERE status = $1 AND approved_at IS NOT NULL` : `WHERE approved_at IS NOT NULL`;
    const params = status ? [status] : [];

    const res = await this.database.query<Courier>(
      `SELECT id, user_id, full_name, phone, vehicle_type, license_plate, status, approved_at,
              current_latitude::text, current_longitude::text, rating::text, total_deliveries
       FROM couriers
       ${where}
       ORDER BY rating DESC, total_deliveries DESC`,
      params,
    );
    return res.rows;
  }

  /**
   * Get courier record by user ID
   */
  async getCourierByUserId(userId: string): Promise<Courier | null> {
    const res = await this.database.query<Courier>(
      `SELECT id, user_id, full_name, phone, vehicle_type, license_plate, status, approved_at,
              current_latitude::text, current_longitude::text, rating::text, total_deliveries
       FROM couriers
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Self-register as courier
   */
  async selfRegisterCourier(
    userId: string,
    dto: { fullName: string; phone: string; vehicleType: VehicleType; licensePlate?: string },
  ): Promise<Courier> {
    const existing = await this.getCourierByUserId(userId);
    if (existing) {
      return existing;
    }
    const result = await this.database.query<Courier>(
      `INSERT INTO couriers (user_id, full_name, phone, vehicle_type, license_plate, status)
       VALUES ($1, $2, $3, $4, $5, 'offline') RETURNING *`,
      [userId, dto.fullName.trim(), normalizeAngolanPhone(dto.phone), dto.vehicleType, dto.licensePlate?.trim() || null],
    );
    return result.rows[0];
  }

  /**
   * Update courier status (active/offline)
   */
  async updateCourierStatus(userId: string, status: CourierStatus): Promise<{ status: CourierStatus }> {
    const courier = await this.getCourierByUserId(userId);
    if (!courier) {
      throw new NotFoundException({ code: "COURIER_NOT_FOUND", message: "Perfil de estafeta não encontrado." });
    }
    if (!courier.approved_at) throw new BadRequestException({ code: "COURIER_PENDING_APPROVAL", message: "O perfil de estafeta aguarda aprovação da equipa PUVO." });
    if (courier.status === "busy") throw new BadRequestException({ code: "COURIER_HAS_ACTIVE_DELIVERY", message: "Conclui a entrega atribuída antes de alterar a disponibilidade." });
    await this.database.query(
      `UPDATE couriers SET status = $1, updated_at = now() WHERE id = $2`,
      [status, courier.id],
    );
    return { status };
  }

  /**
   * List deliveries assigned to courier (active and completed)
   */
  async getCourierDeliveries(userId: string): Promise<{ active: any[]; completed: any[] }> {
    const courier = await this.getCourierByUserId(userId);
    if (!courier) {
      throw new NotFoundException({ code: "COURIER_NOT_FOUND", message: "Perfil de estafeta não encontrado." });
    }

    const res = await this.database.query(
      `SELECT da.id, da.order_id, da.status, da.shipping_fee,
              da.destination_province, da.destination_municipality, da.destination_address,
              da.destination_landmark, da.recipient_name, da.recipient_phone,
              da.pin_attempts, da.max_pin_attempts,
              da.assigned_at, da.picked_up_at, da.delivered_at, da.notes,
              o.reference AS order_reference, o.total_amount AS order_total,
              sp.display_name AS store_name,
              sss.pickup_address AS store_pickup_address
       FROM delivery_assignments da
       JOIN orders o ON o.id = da.order_id
       JOIN seller_profiles sp ON sp.id = da.seller_profile_id
       LEFT JOIN store_shipping_settings sss ON sss.seller_profile_id = sp.id
       WHERE da.courier_id = $1
       ORDER BY da.created_at DESC`,
      [courier.id],
    );

    const activeStatuses = ["assigned", "picked_up", "in_transit", "arrived"];
    const active = res.rows.filter((r: any) => activeStatuses.includes(r.status));
    const completed = res.rows.filter((r: any) => !activeStatuses.includes(r.status));

    return { active, completed };
  }

  /**
   * Assign courier, generate cryptographically safe 4-digit PIN and dispatch delivery
   */
  async assignCourierToOrder(params: AssignCourierParams): Promise<{ deliveryId: string; status: string }> {
    return this.database.transaction(async (client) => {
      // 1. Verify order state and lock
      const orderRes = await client.query<{ id: string; reference: string; seller_profile_id: string; status: string; payment_status: string; delivery_mode: string; delivery_details_ciphertext: string | null; shipping_fee: string }>(
        `SELECT o.id, o.reference, o.seller_profile_id, o.status, o.payment_status, o.delivery_mode, o.delivery_details_ciphertext, o.shipping_fee::text
         FROM orders o
         JOIN store_memberships sm ON sm.seller_profile_id = o.seller_profile_id
         WHERE o.id = $1 AND sm.user_id = $2 AND sm.role IN ('owner', 'editor')
         FOR UPDATE OF o`,
        [params.orderId, params.actorUserId],
      );

      if (!orderRes.rowCount) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Encomenda não encontrada." });
      const order = orderRes.rows[0];

      if (order.status !== "preparing" || order.payment_status !== "confirmed_by_seller") {
        throw new BadRequestException({
          code: "ORDER_INVALID_STATE_FOR_DISPATCH",
          message: `A encomenda está no estado '${order.status}' e não pode ser despachada.`,
        });
      }
      if (order.delivery_mode !== "courier" || !order.delivery_details_ciphertext) {
        throw new BadRequestException({ code: "COURIER_NOT_PURCHASED", message: "Esta encomenda foi criada para levantamento na loja." });
      }
      const destination = JSON.parse(decryptPrivateValue(order.delivery_details_ciphertext)) as { province: string; municipality: string; address: string; landmark?: string; recipientName: string; recipientPhone: string };

      // 2. Select or auto-assign courier
      const available = await client.query<{ id: string }>(
        `SELECT id FROM couriers
         WHERE status = 'active' AND user_id IS NOT NULL AND approved_at IS NOT NULL
           AND ($1::uuid IS NULL OR id = $1)
         ORDER BY rating DESC, total_deliveries ASC
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [params.courierId ?? null],
      );
      if (!available.rowCount) throw new BadRequestException({ code: "COURIER_UNAVAILABLE", message: "Nenhum estafeta disponível para esta entrega." });
      const courierId = available.rows[0].id;

      // 3. Generate secure 4-digit PIN & SHA-256 hash
      const pin = String(randomInt(1000, 10000));
      const pinHash = createHash("sha256").update(pin).digest("hex");

      // 4. Create delivery assignment
      const insertDelivery = await client.query<{ id: string }>(
        `INSERT INTO delivery_assignments (
          order_id, courier_id, seller_profile_id, destination_province, destination_municipality,
          destination_address, destination_landmark, destination_latitude, destination_longitude,
          recipient_name, recipient_phone, shipping_fee, status, delivery_pin_hash, raw_pin_for_buyer, assigned_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'assigned', $13, $14, now())
        ON CONFLICT (order_id) DO UPDATE SET
          courier_id = EXCLUDED.courier_id,
          delivery_pin_hash = EXCLUDED.delivery_pin_hash,
          raw_pin_for_buyer = EXCLUDED.raw_pin_for_buyer,
          status = 'assigned',
          pin_attempts = 0,
          updated_at = now()
        RETURNING id`,
        [
          order.id,
          courierId,
          order.seller_profile_id,
          destination.province,
          destination.municipality,
          destination.address,
          destination.landmark || null,
          null,
          null,
          destination.recipientName,
          normalizeAngolanPhone(destination.recipientPhone),
          order.shipping_fee,
          pinHash,
          encryptPrivateValue(pin),
        ],
      );

      const deliveryId = insertDelivery.rows[0].id;

      // 5. Update courier status
      await client.query(`UPDATE couriers SET status = 'busy', updated_at = now() WHERE id = $1`, [courierId]);

      // 6. Update order status to out_for_delivery
      await client.query(`UPDATE orders SET status = 'out_for_delivery', updated_at = now() WHERE id = $1`, [order.id]);

      // 7. Record delivery events
      await client.query(
        `INSERT INTO delivery_events (delivery_id, actor_id, event_type, note)
         VALUES ($1, $2, 'delivery.assigned', $3)`,
        [deliveryId, params.actorUserId, `Estafeta atribuído à encomenda #${order.reference}`],
      );

      await client.query(
        `INSERT INTO order_events (order_id, actor_id, event_type, note)
         VALUES ($1, $2, 'fulfillment.out_for_delivery', $3)`,
        [order.id, params.actorUserId, `Encomenda despachada para entrega com PIN de confirmação.`],
      );

      // 8. Notify the buyer that tracking is available; the PIN stays in the authenticated buyer view.
      const storeRes = await client.query<{ display_name: string }>(
        `SELECT display_name FROM seller_profiles WHERE id = $1`,
        [order.seller_profile_id],
      );
      const storeName = storeRes.rows[0]?.display_name || "Loja PUVO";

      await this.notifications.queueNotification(
        {
          recipientPhone: destination.recipientPhone,
          channel: "whatsapp",
          templateSlug: "order_shipped_buyer",
          variables: {
            order_ref: order.reference,
            store_name: storeName,
          },
          metadata: { delivery_id: deliveryId },
        },
        client,
      );

      return { deliveryId, status: "assigned" };
    });
  }

  /**
   * Courier confirms pickup from merchant
   */
  async courierPickup(deliveryId: string, actorUserId: string): Promise<{ deliveryId: string; status: string }> {
    return this.database.transaction(async (client) => {
      const res = await client.query<{ id: string; status: string }>(
        `UPDATE delivery_assignments
         SET status = 'picked_up', picked_up_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'assigned'
           AND courier_id IN (SELECT id FROM couriers WHERE user_id = $2)
         RETURNING id, status`,
        [deliveryId, actorUserId],
      );

      if (!res.rowCount) {
        throw new BadRequestException({
          code: "CANNOT_PICKUP_DELIVERY",
          message: "Esta entrega não está no estado adequado para recolha.",
        });
      }

      await client.query(
        `INSERT INTO delivery_events (delivery_id, actor_id, event_type, note)
         VALUES ($1, $2, 'delivery.picked_up', 'Estafeta recolheu a encomenda na loja.')`,
        [deliveryId, actorUserId],
      );

      return { deliveryId, status: "picked_up" };
    });
  }

  /**
   * Courier verifies the 4-digit buyer PIN upon physical delivery (Anti-burla handshake)
   */
  async verifyDeliveryPin(params: VerifyDeliveryPinParams): Promise<{ verified: boolean; message: string }> {
    const result = await this.database.transaction(async (client) => {
      const res = await client.query<DeliveryAssignment>(
        `SELECT d.* FROM delivery_assignments d
         JOIN couriers c ON c.id = d.courier_id
         WHERE d.id = $1 AND c.user_id = $2 FOR UPDATE OF d`,
        [params.deliveryId, params.courierUserId],
      );

      if (!res.rowCount) throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Registo de entrega não encontrado." });
      const delivery = res.rows[0];

      if (delivery.status === "delivered") {
        return { verified: true, message: "Esta entrega já foi confirmada anteriormente." };
      }

      if (!["picked_up", "in_transit", "arrived"].includes(delivery.status)) {
        throw new BadRequestException({ code: "DELIVERY_NOT_READY", message: "A encomenda ainda não foi recolhida pelo estafeta." });
      }

      // Check anti-brute force lockout
      if (delivery.pin_attempts >= delivery.max_pin_attempts) {
        throw new BadRequestException({
          code: "DELIVERY_PIN_LOCKED",
          message: "Entrega bloqueada: Limite de 3 tentativas de PIN excedido. Contacta o suporte ou a loja.",
        });
      }

      // Hash provided PIN
      const providedPinClean = params.pin.trim();
      const providedHash = createHash("sha256").update(providedPinClean).digest("hex");

      if (!timingSafeEqual(Buffer.from(providedHash, "hex"), Buffer.from(delivery.delivery_pin_hash, "hex"))) {
        const newAttempts = delivery.pin_attempts + 1;
        await client.query(
          `UPDATE delivery_assignments SET pin_attempts = $2, updated_at = now() WHERE id = $1`,
          [delivery.id, newAttempts],
        );

        await client.query(
          `INSERT INTO delivery_events (delivery_id, event_type, latitude, longitude, note)
           VALUES ($1, 'delivery.pin_failed', $2, $3, $4)`,
          [
            delivery.id,
            params.latitude || null,
            params.longitude || null,
            `Tentativa incorreta de PIN (${newAttempts}/${delivery.max_pin_attempts})`,
          ],
        );

        const remaining = delivery.max_pin_attempts - newAttempts;
        return { verified: false, message: `Código PIN de entrega incorreto. Restam ${remaining} tentativa(s).` };
      }

      // PIN is valid: Complete delivery
      await client.query(
        `UPDATE delivery_assignments
         SET status = 'delivered',
             delivered_at = now(),
             raw_pin_for_buyer = NULL, -- Security wipe
             notes = $2,
             updated_at = now()
         WHERE id = $1`,
        [delivery.id, params.notes || "Entrega concluída com validação de PIN."],
      );

      // Release courier back to 'active' status and increment counter
      if (delivery.courier_id) {
        await client.query(
          `UPDATE couriers
           SET status = 'active', total_deliveries = total_deliveries + 1, updated_at = now()
           WHERE id = $1`,
          [delivery.courier_id],
        );
      }

      // Complete the parent order
      await client.query(
        `UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1`,
        [delivery.order_id],
      );

      // Record completion events
      await client.query(
        `INSERT INTO delivery_events (delivery_id, event_type, latitude, longitude, note)
         VALUES ($1, 'delivery.completed', $2, $3, 'PIN validado pelo estafeta. Entrega com sucesso!')`,
        [delivery.id, params.latitude || null, params.longitude || null],
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, note)
         VALUES ($1, 'order.completed_by_delivery', 'Encomenda entregue fisicamente com validação de PIN.')`,
        [delivery.order_id],
      );

      this.logger.log(`[LogisticsService] Delivery ${delivery.id} confirmed with valid PIN for order ${delivery.order_id}`);
      return { verified: true, message: "Entrega física confirmada com sucesso!" };
    });
    if (!result.verified) throw new BadRequestException({ code: "INVALID_DELIVERY_PIN", message: result.message });
    return result;
  }

  /**
   * Get full tracking timeline and details for a customer or merchant
   */
  async getOrderTracking(orderId: string, requesterUserId: string) {
    const orderRes = await this.database.query<{ buyer_id: string; reference: string }>(
      `SELECT o.buyer_id, o.reference FROM orders o
       WHERE o.id = $1 AND (
         o.buyer_id = $2
         OR EXISTS (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = o.seller_profile_id AND sm.user_id = $2)
         OR EXISTS (SELECT 1 FROM delivery_assignments da JOIN couriers c ON c.id = da.courier_id
                    WHERE da.order_id = o.id AND c.user_id = $2)
       )`,
      [orderId, requesterUserId],
    );
    if (!orderRes.rowCount) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Encomenda não encontrada." });
    const order = orderRes.rows[0];
    const isBuyer = requesterUserId === order.buyer_id;

    const deliveryRes = await this.database.query<DeliveryAssignment>(
      `SELECT d.*, c.full_name AS courier_name, c.phone AS courier_phone,
              c.vehicle_type AS courier_vehicle_type, c.license_plate AS courier_license_plate,
              c.rating::text AS courier_rating
       FROM delivery_assignments d
       LEFT JOIN couriers c ON c.id = d.courier_id
       WHERE d.order_id = $1 LIMIT 1`,
      [orderId],
    );

    if (!deliveryRes.rowCount) {
      return { trackingAvailable: false, message: "Ainda não há entrega física despachada para esta encomenda." };
    }

    const delivery = deliveryRes.rows[0];

    // Load timeline events
    const eventsRes = await this.database.query(
      `SELECT id, event_type, latitude, longitude, note, created_at
       FROM delivery_events
       WHERE delivery_id = $1
       ORDER BY created_at ASC`,
      [delivery.id],
    );

    return {
      trackingAvailable: true,
      deliveryId: delivery.id,
      orderReference: order?.reference,
      status: delivery.status,
      recipient: {
        name: delivery.recipient_name,
        phone: delivery.recipient_phone,
        province: delivery.destination_province,
        municipality: delivery.destination_municipality,
        address: delivery.destination_address,
        landmark: delivery.destination_landmark,
      },
      courier: delivery.courier_id
        ? {
            name: (delivery as any).courier_name,
            phone: (delivery as any).courier_phone,
            vehicle: (delivery as any).courier_vehicle_type,
            licensePlate: (delivery as any).courier_license_plate,
            rating: (delivery as any).courier_rating,
          }
        : null,
      shippingFee: delivery.shipping_fee,
      // Only disclose raw PIN to the verified buyer
      buyerDeliveryPin: isBuyer && delivery.raw_pin_for_buyer ? decryptPrivateValue(delivery.raw_pin_for_buyer) : undefined,
      timeline: eventsRes.rows,
      assignedAt: delivery.assigned_at,
      pickedUpAt: delivery.picked_up_at,
      deliveredAt: delivery.delivered_at,
    };
  }
}
