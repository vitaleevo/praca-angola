import { describe, expect, it, vi } from "vitest";
import { firstValueFrom } from "rxjs";
import { ModerationAlertsService } from "./moderation-alerts.service";
import { AdminController } from "./admin.controller";
import { BadRequestException } from "@nestjs/common";

describe("Moderation and Fraud Prevention E2E Suite", () => {
  describe("ModerationAlertsService Real-time Event Stream", () => {
    it("emits high risk listing alerts to subscribed stream listeners", async () => {
      const service = new ModerationAlertsService();
      const stream$ = service.subscribeAlerts();

      const alertPromise = firstValueFrom(stream$);

      service.emitAlert({
        type: "high_risk_listing",
        entityId: "listing-uuid-123",
        title: "iPhone 15 Pro Max 1TB - Preço Irrisório 5.000 Kz",
        riskScore: 92,
        reasons: ["Preço muito abaixo da média de mercado", "Pedido de sinal antecipado"],
        suggestedAction: "auto_reject",
      });

      const event = await alertPromise;
      expect(event.data).toMatchObject({
        type: "high_risk_listing",
        entityId: "listing-uuid-123",
        riskScore: 92,
        suggestedAction: "auto_reject",
      });
      expect(event.data.reasons).toContain("Preço muito abaixo da média de mercado");
      expect(event.data.id).toMatch(/^alert_/);
      expect(event.data.timestamp).toBeDefined();
    });

    it("emits fraud receipt alerts on forensics detection", async () => {
      const service = new ModerationAlertsService();
      const stream$ = service.subscribeAlerts();
      const alertPromise = firstValueFrom(stream$);

      service.emitAlert({
        type: "fraud_receipt",
        entityId: "order-uuid-999",
        title: "Comprovativo sob suspeita na encomenda #ORD-AO-2026",
        riskScore: 88,
        verdict: "HIGH_RISK",
        reasons: ["Sinais de adulteração digital nas fontes do banco BAI", "Divergência de montante"],
      });

      const event = await alertPromise;
      expect(event.data.type).toBe("fraud_receipt");
      expect(event.data.verdict).toBe("HIGH_RISK");
      expect(event.data.riskScore).toBe(88);
    });
  });

  describe("AdminController Moderation Analytics", () => {
    it("aggregates listings, fraud inspections, and performance metrics correctly", async () => {
      const mockDb = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("FROM listings\n") || sql.includes("FROM listings ")) {
            return Promise.resolve({
              rows: [{
                totalListings: 150,
                pendingReview: 12,
                published: 128,
                rejected: 10,
                highRiskPending: 2,
                mediumRiskPending: 3,
                lowRiskPending: 7,
                avgRiskScore: 35,
              }],
            });
          }
          if (sql.includes("unnest(COALESCE(ai_flagged_reasons")) {
            return Promise.resolve({
              rows: [
                { reason: "Preço suspeito", count: 18 },
                { reason: "Artigo réplica", count: 9 },
              ],
            });
          }
          if (sql.includes("bank_detected AS bank")) {
            return Promise.resolve({
              rows: [
                { bank: "Multicaixa Express", count: 32 },
                { bank: "Banco BAI", count: 10 },
              ],
            });
          }
          if (sql.includes("totalInspections") || sql.includes("amountProtectedAoa")) {
            return Promise.resolve({
              rows: [{
                totalInspections: 45,
                highRisk: 3,
                suspicious: 5,
                lowRisk: 37,
                tamperingDetected: 2,
                amountProtectedAoa: "1450000.00",
              }],
            });
          }
          if (sql.includes("FROM moderation_actions ma")) {
            return Promise.resolve({
              rows: [{
                avgReviewTimeMinutes: 4,
                aiAlignmentRate: 94,
                totalActionsRecorded: 138,
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const alertsService = new ModerationAlertsService();
      const controller = new AdminController(mockDb as never, alertsService);

      const analytics = await controller.moderationAnalytics();

      expect(analytics.listings.totalListings).toBe(150);
      expect(analytics.listings.highRiskPending).toBe(2);
      expect(analytics.fraud.amountProtectedAoa).toBe("1450000.00");
      expect(analytics.fraud.tamperingDetected).toBe(2);
      expect(analytics.performance.aiAlignmentRate).toBe(94);
      expect(analytics.topReasons).toHaveLength(2);
      expect(analytics.topBanks[0].bank).toBe("Multicaixa Express");
    });
  });

  describe("AdminController Bulk Moderation", () => {
    it("approves multiple listings in batch transaction", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("UPDATE listings")) {
            return Promise.resolve({
              rowCount: 3,
              rows: [{ id: "l-1" }, { id: "l-2" }, { id: "l-3" }],
            });
          }
          return Promise.resolve({ rowCount: 1, rows: [] });
        }),
      };

      const mockDb = {
        transaction: vi.fn().mockImplementation((cb: (c: typeof mockClient) => Promise<any>) => cb(mockClient)),
      };

      const alertsService = new ModerationAlertsService();
      const controller = new AdminController(mockDb as never, alertsService);

      const result = await controller.bulkReviewListings(
        { ids: ["l-1", "l-2", "l-3"], action: "approved" },
        { id: "mod-1", email: "moderator@puvo.ao", roles: ["moderator"] } as never,
      );

      expect(result.updatedCount).toBe(3);
      expect(result.updatedIds).toEqual(["l-1", "l-2", "l-3"]);
      expect(result.status).toBe("published");
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE listings"),
        expect.any(Array),
      );
    });

    it("requires reason when rejecting in bulk", async () => {
      const mockDb = { transaction: vi.fn() };
      const alertsService = new ModerationAlertsService();
      const controller = new AdminController(mockDb as never, alertsService);

      await expect(
        controller.bulkReviewListings(
          { ids: ["l-1"], action: "rejected", reason: "   " },
          { id: "mod-1", roles: ["moderator"] } as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
