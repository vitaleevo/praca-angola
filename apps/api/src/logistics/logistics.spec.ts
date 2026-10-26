import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { LogisticsService } from "./logistics.service";
import { BadRequestException } from "@nestjs/common";
import { encryptPrivateValue } from "../auth/auth.crypto";

describe("Logistics & Courier Delivery Subsystem", () => {
  describe("Freight Calculation Engine (Angolan Zones & Municipalities)", () => {
    it("calculates correct base rate for Luanda Urbana, Periferias and Benguela", async () => {
      const mockDb: any = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("FROM delivery_zones")) {
            return Promise.resolve({
              rows: [
                {
                  id: "zone-luanda-urbana",
                  name: "Luanda Urbana & Sul",
                  province: "Luanda",
                  municipalities: ["Luanda", "Maianga", "Talatona", "Belas"],
                  base_rate: "2000.00",
                  estimated_hours_min: 2,
                  estimated_hours_max: 6,
                  active: true,
                },
                {
                  id: "zone-luanda-periferias",
                  name: "Luanda Periferias",
                  province: "Luanda",
                  municipalities: ["Viana", "Cazenga", "Cacuaco"],
                  base_rate: "3500.00",
                  estimated_hours_min: 4,
                  estimated_hours_max: 12,
                  active: true,
                },
                {
                  id: "zone-benguela",
                  name: "Província de Benguela",
                  province: "Benguela",
                  municipalities: ["Benguela", "Lobito", "Catumbela"],
                  base_rate: "4500.00",
                  estimated_hours_min: 24,
                  estimated_hours_max: 48,
                  active: true,
                },
              ],
            });
          }
          if (sql.includes("FROM store_shipping_settings")) {
            return Promise.resolve({
              rows: [
                {
                  free_shipping_threshold: "50000.00",
                  local_pickup_enabled: true,
                  pickup_address: "Rua Rainha Ginga, Luanda",
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
        transaction: vi.fn(),
      };

      const mockNotif: any = { queueNotification: vi.fn() };
      const service = new LogisticsService(mockDb, mockNotif);

      // 1. Talatona (Luanda Urbana)
      const resTalatona = await service.calculateFreight({
        sellerProfileId: "store-uuid-1",
        province: "Luanda",
        municipality: "Talatona",
        totalCartAmount: 15000,
      });
      expect(resTalatona.zoneId).toBe("zone-luanda-urbana");
      expect(resTalatona.finalRate).toBe(2000);
      expect(resTalatona.isFreeShipping).toBe(false);

      // 2. Viana (Luanda Periferias)
      const resViana = await service.calculateFreight({
        sellerProfileId: "store-uuid-1",
        province: "Luanda",
        municipality: "Viana",
        totalCartAmount: 20000,
      });
      expect(resViana.zoneId).toBe("zone-luanda-periferias");
      expect(resViana.finalRate).toBe(3500);

      // 3. Lobito (Benguela)
      const resLobito = await service.calculateFreight({
        sellerProfileId: "store-uuid-1",
        province: "Benguela",
        municipality: "Lobito",
        totalCartAmount: 10000,
      });
      expect(resLobito.zoneId).toBe("zone-benguela");
      expect(resLobito.finalRate).toBe(4500);

      // 4. Free shipping threshold qualification
      const resFree = await service.calculateFreight({
        sellerProfileId: "store-uuid-1",
        province: "Luanda",
        municipality: "Talatona",
        totalCartAmount: 75000, // Exceeds 50,000 Kz threshold
      });
      expect(resFree.finalRate).toBe(0);
      expect(resFree.isFreeShipping).toBe(true);
    });
  });

  describe("Courier Handshake & Secure PIN Validation (Anti-Burla)", () => {
    it("keeps a self-registered courier unavailable until administrator approval", async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "courier-1", status: "offline", approved_at: null }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "courier-1", status: "offline", approved_at: null }] });
      const service = new LogisticsService({ query } as any, {} as any);
      const courier = await service.selfRegisterCourier("user-1", { fullName: "Test Courier", phone: "923111222", vehicleType: "motorcycle" });
      expect(courier.status).toBe("offline");
      expect(courier.approved_at).toBeNull();
      await expect(service.updateCourierStatus("user-1", "active")).rejects.toThrow(BadRequestException);
      expect(query).toHaveBeenCalledTimes(3);
    });

    it("rejects dispatch for an unpaid order before creating a delivery", async () => {
      const query = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "order-1", status: "preparing", payment_status: "buyer_reported" }] });
      const db: any = { transaction: (callback: any) => callback({ query }) };
      const service = new LogisticsService(db, { queueNotification: vi.fn() } as any);
      await expect(service.assignCourierToOrder({
        orderId: "order-1", actorUserId: "seller-1",
      })).rejects.toThrow(BadRequestException);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("denies tracking to a user outside the order", async () => {
      const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
      const service = new LogisticsService({ query } as any, { queueNotification: vi.fn() } as any);
      await expect(service.getOrderTracking("order-1", "stranger")).rejects.toThrow();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("requires the assigned courier for pickup", async () => {
      const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
      const db: any = { transaction: (callback: any) => callback({ query }) };
      const service = new LogisticsService(db, { queueNotification: vi.fn() } as any);
      await expect(service.courierPickup("delivery-1", "stranger")).rejects.toThrow(BadRequestException);
      expect(query.mock.calls[0][0]).toContain("c.user_id = $2".replace("c.", ""));
    });

    it("commits a failed PIN attempt before returning an error", async () => {
      const hash = createHash("sha256").update("4819").digest("hex");
      let committedAttempts = 0;
      const db: any = {
        transaction: async (callback: any) => {
          let pendingAttempts = committedAttempts;
          const result = await callback({ query: async (sql: string, params: any[]) => {
            if (sql.includes("FROM delivery_assignments d")) return { rowCount: 1, rows: [{
              id: "delivery-1", order_id: "order-1", status: "picked_up", delivery_pin_hash: hash,
              pin_attempts: pendingAttempts, max_pin_attempts: 3,
            }] };
            if (sql.includes("SET pin_attempts")) pendingAttempts = params[1];
            return { rowCount: 1, rows: [] };
          } });
          committedAttempts = pendingAttempts;
          return result;
        },
      };
      const service = new LogisticsService(db, { queueNotification: vi.fn() } as any);
      for (let index = 0; index < 3; index++) {
        await expect(service.verifyDeliveryPin({ deliveryId: "delivery-1", pin: "9999", courierUserId: "courier-1" })).rejects.toThrow(BadRequestException);
      }
      expect(committedAttempts).toBe(3);
      await expect(service.verifyDeliveryPin({ deliveryId: "delivery-1", pin: "4819", courierUserId: "courier-1" })).rejects.toThrow(BadRequestException);
      expect(committedAttempts).toBe(3);
    });
    it("assigns an active courier to a paid order without disclosing the PIN", async () => {
      process.env.APP_ENCRYPTION_KEY = "logistics-test-key-at-least-32-characters";
      const mockDb: any = {
        query: vi.fn(),
        transaction: vi.fn().mockImplementation(async (callback) => {
          const fakeClient = {
            query: vi.fn().mockImplementation((sql: string) => {
              if (sql.includes("FROM orders o")) {
                return Promise.resolve({
                  rowCount: 1,
                  rows: [{ id: "order-123", reference: "PA-TEST1", seller_profile_id: "seller-1", status: "preparing", payment_status: "confirmed_by_seller", delivery_mode: "courier", delivery_details_ciphertext: encryptPrivateValue(JSON.stringify({ province: "Luanda", municipality: "Talatona", address: "Morro Bento, Casa 12", recipientName: "Mauro Comprador", recipientPhone: "+244923111222" })), shipping_fee: "2000.00" }],
                });
              }
              if (sql.includes("FROM couriers")) return Promise.resolve({ rowCount: 1, rows: [{ id: "courier-1" }] });
              if (sql.includes("INSERT INTO delivery_assignments")) {
                return Promise.resolve({ rows: [{ id: "delivery-uuid-99" }] });
              }
              if (sql.includes("FROM seller_profiles")) {
                return Promise.resolve({ rows: [{ display_name: "Loja Teste" }] });
              }
              return Promise.resolve({ rowCount: 1, rows: [] });
            }),
          };
          return callback(fakeClient);
        }),
      };

      const mockNotif: any = { queueNotification: vi.fn().mockResolvedValue({ id: "notif-1" }) };
      const service = new LogisticsService(mockDb, mockNotif);

      const result = await service.assignCourierToOrder({
        orderId: "order-123",
        courierId: "courier-1",
        actorUserId: "user-seller-1",
      });

      expect(result.deliveryId).toBe("delivery-uuid-99");
      expect(result.status).toBe("assigned");
      expect(result).not.toHaveProperty("pin");
      expect(mockNotif.queueNotification).toHaveBeenCalled();
      expect(mockNotif.queueNotification.mock.calls[0][0].metadata).not.toHaveProperty("pin_code");
    });

    it("rejects wrong PIN and blocks after 3 failed attempts", async () => {
      const realPin = "4819";
      const pinHash = createHash("sha256").update(realPin).digest("hex");

      const mockDb: any = {
        query: vi.fn(),
        transaction: vi.fn().mockImplementation(async (callback) => {
          const fakeClient = {
            query: vi.fn().mockImplementation((sql: string) => {
              if (sql.includes("FROM delivery_assignments d")) {
                return Promise.resolve({
                  rowCount: 1,
                  rows: [
                    {
                      id: "deliv-1",
                      order_id: "order-1",
                      status: "picked_up",
                      delivery_pin_hash: pinHash,
                      pin_attempts: 2, // 2 failed attempts so far
                      max_pin_attempts: 3,
                    },
                  ],
                });
              }
              return Promise.resolve({ rowCount: 1, rows: [] });
            }),
          };
          return callback(fakeClient);
        }),
      };

      const mockNotif: any = { queueNotification: vi.fn() };
      const service = new LogisticsService(mockDb, mockNotif);

      // Attempt with wrong PIN "9999"
      await expect(
        service.verifyDeliveryPin({
          deliveryId: "deliv-1",
          pin: "9999",
          courierUserId: "courier-1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("confirms delivery and completes order when correct PIN is provided", async () => {
      const realPin = "5521";
      const pinHash = createHash("sha256").update(realPin).digest("hex");

      const mockDb: any = {
        query: vi.fn(),
        transaction: vi.fn().mockImplementation(async (callback) => {
          const fakeClient = {
            query: vi.fn().mockImplementation((sql: string) => {
              if (sql.includes("FROM delivery_assignments d")) {
                return Promise.resolve({
                  rowCount: 1,
                  rows: [
                    {
                      id: "deliv-ok",
                      order_id: "order-ok",
                      courier_id: "courier-moto-1",
                      status: "picked_up",
                      delivery_pin_hash: pinHash,
                      pin_attempts: 0,
                      max_pin_attempts: 3,
                    },
                  ],
                });
              }
              return Promise.resolve({ rowCount: 1, rows: [] });
            }),
          };
          return callback(fakeClient);
        }),
      };

      const mockNotif: any = { queueNotification: vi.fn() };
      const service = new LogisticsService(mockDb, mockNotif);

      const verification = await service.verifyDeliveryPin({
        deliveryId: "deliv-ok",
        pin: realPin,
        courierUserId: "courier-1",
        notes: "Entregue ao próprio cliente no portão.",
      });

      expect(verification.verified).toBe(true);
      expect(verification.message).toContain("sucesso");
    });
  });

  describe("Courier Portal & Self-Management", () => {
    it("handles courier status update and listing active deliveries", async () => {
      const mockDb: any = {
        query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes("FROM couriers") && sql.includes("user_id = $1")) {
            return Promise.resolve({
              rows: [
                {
                  id: "courier-123",
                  user_id: params?.[0],
                  full_name: "Mateus Estafeta",
                  phone: "+244923444555",
                  vehicle_type: "motorcycle",
                  status: "active",
                  approved_at: "2026-10-25T00:00:00.000Z",
                  rating: "4.9",
                  total_deliveries: 18,
                },
              ],
            });
          }
          if (sql.includes("UPDATE couriers SET status = $1")) {
            return Promise.resolve({ rowCount: 1 });
          }
          if (sql.includes("FROM delivery_assignments da")) {
            return Promise.resolve({
              rows: [
                {
                  id: "deliv-active-1",
                  order_id: "order-1",
                  status: "assigned",
                  shipping_fee: "2000.00",
                  destination_province: "Luanda",
                  destination_municipality: "Talatona",
                  destination_address: "Condomínio Cidade Financeira",
                  recipient_name: "Ana Compradora",
                  recipient_phone: "+244912333444",
                  order_reference: "ORD-AO-100",
                  store_name: "Loja Luanda Tech",
                },
                {
                  id: "deliv-done-1",
                  order_id: "order-2",
                  status: "delivered",
                  shipping_fee: "3500.00",
                  destination_province: "Luanda",
                  destination_municipality: "Viana",
                  destination_address: "Ponte Partida",
                  recipient_name: "Carlos",
                  recipient_phone: "+244923111222",
                  order_reference: "ORD-AO-99",
                  store_name: "Loja Luanda Tech",
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const mockNotif: any = { queueNotification: vi.fn() };
      const service = new LogisticsService(mockDb, mockNotif);

      // Check courier profile
      const courier = await service.getCourierByUserId("user-c1");
      expect(courier).not.toBeNull();
      expect(courier?.full_name).toBe("Mateus Estafeta");

      // Update status
      const updated = await service.updateCourierStatus("user-c1", "offline");
      expect(updated.status).toBe("offline");

      // List deliveries
      const deliveries = await service.getCourierDeliveries("user-c1");
      expect(deliveries.active).toHaveLength(1);
      expect(deliveries.active[0].id).toBe("deliv-active-1");
      expect(deliveries.completed).toHaveLength(1);
      expect(deliveries.completed[0].id).toBe("deliv-done-1");
    });
  });
});

