import { describe, expect, it, vi } from "vitest";
import { normalizeAngolanPhone, isValidAngolanMobile, detectAngolanCarrier } from "./phone.utils";
import { MockDriver } from "./drivers/mock.driver";
import { TwilioDriver } from "./drivers/twilio.driver";
import { WhatsAppCloudApiDriver } from "./drivers/whatsapp-cloud.driver";
import { AngolaSmsGatewayDriver } from "./drivers/angola-sms.driver";
import { NotificationsService } from "./notifications.service";

describe("External Notifications Subsystem (SMS, WhatsApp & Outbox)", () => {
  describe("Angolan Phone Number Normalization & Carrier Detection", () => {
    it("normalizes various formats of Angolan mobile numbers into E.164 (+2449XXXXXXXX)", () => {
      expect(normalizeAngolanPhone("923111222")).toBe("+244923111222");
      expect(normalizeAngolanPhone("+244 923 111 222")).toBe("+244923111222");
      expect(normalizeAngolanPhone("00244950123456")).toBe("+244950123456");
      expect(normalizeAngolanPhone("244912345678")).toBe("+244912345678");
    });

    it("correctly validates valid and invalid Angolan mobile numbers", () => {
      expect(isValidAngolanMobile("+244923111222")).toBe(true);
      expect(isValidAngolanMobile("950123456")).toBe(true);
      expect(isValidAngolanMobile("+244823111222")).toBe(false); // Mobile must start with 9
      expect(isValidAngolanMobile("12345")).toBe(false);
    });

    it("detects major Angolan telecom carriers by prefix", () => {
      expect(detectAngolanCarrier("+244923000000")).toBe("unitel");
      expect(detectAngolanCarrier("+244931000000")).toBe("unitel");
      expect(detectAngolanCarrier("+244940000000")).toBe("unitel");
      expect(detectAngolanCarrier("+244991000000")).toBe("unitel");
      expect(detectAngolanCarrier("+244950000000")).toBe("africell");
      expect(detectAngolanCarrier("+244912000000")).toBe("movicel");
      expect(detectAngolanCarrier("+244970000000")).toBe("movicel");
      expect(detectAngolanCarrier("+15551234567")).toBe("other");
    });
  });

  describe("MockDriver Dispatch & Simulation", () => {
    it("successfully sends SMS/WhatsApp messages and tracks history", async () => {
      const mock = new MockDriver();

      const result = await mock.send({
        recipientPhone: "+244923111222",
        channel: "whatsapp",
        renderedContent: "Olá! A tua encomenda #PA-123 foi recebida.",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("delivered");
      expect(result.providerMessageId).toMatch(/^mock-whatsapp-/);
      expect(mock.sentHistory.length).toBe(1);
      expect(mock.sentHistory[0].recipientPhone).toBe("+244923111222");
    });

    it("simulates unreachable network/recipient failure when special pattern is provided", async () => {
      const mock = new MockDriver();

      const result = await mock.send({
        recipientPhone: "+244923000000",
        channel: "sms",
        renderedContent: "Teste de falha simulada",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("Simulated gateway error");
    });
  });

  describe("Twilio & WhatsApp Cloud API Driver Configurations", () => {
    it("verifies Twilio driver reports unconfigured when environment variables are missing", async () => {
      const driver = new TwilioDriver();
      expect(driver.supportsChannel("sms")).toBe(true);
      expect(driver.supportsChannel("whatsapp")).toBe(true);

      const res = await driver.send({
        recipientPhone: "+244923111222",
        channel: "sms",
        renderedContent: "Test",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Twilio credentials not configured");
    });

    it("parses Twilio webhook DLR callback statuses correctly", () => {
      const driver = new TwilioDriver();
      const parsed = driver.parseWebhookDelivery({
        MessageSid: "SM1234567890abcdef",
        MessageStatus: "delivered",
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.providerMessageId).toBe("SM1234567890abcdef");
      expect(parsed?.status).toBe("delivered");
    });

    it("verifies WhatsApp Cloud API driver parses Meta Graph webhook payloads", () => {
      const driver = new WhatsAppCloudApiDriver();
      expect(driver.supportsChannel("whatsapp")).toBe(true);
      expect(driver.supportsChannel("sms")).toBe(false);

      const parsed = driver.parseWebhookDelivery({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: "wamid.HBgLMjQ0OTIzMTExMjIyFQIAERgSR",
                      status: "delivered",
                      timestamp: "1729830000",
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.providerMessageId).toBe("wamid.HBgLMjQ0OTIzMTExMjIyFQIAERgSR");
      expect(parsed?.status).toBe("delivered");
    });

    it("verifies Angola SMS Gateway driver identifies operators and parses delivery callbacks", () => {
      const driver = new AngolaSmsGatewayDriver();
      expect(driver.supportsChannel("sms")).toBe(true);

      const parsed = driver.parseWebhookDelivery({
        message_id: "ao-sms-998811",
        status: "DELIVRD",
      });

      expect(parsed?.providerMessageId).toBe("ao-sms-998811");
      expect(parsed?.status).toBe("delivered");
    });
  });

  describe("NotificationsService Workflow & Outbox Queue", () => {
    it("queues and dispatches notification via transactional outbox", async () => {
      const mockDb: any = {
        query: vi.fn(),
        transaction: vi.fn(),
      };

      // Mock template query
      mockDb.query.mockImplementation((sql: string) => {
        if (sql.includes("FROM notification_templates")) {
          return Promise.resolve({
            rows: [{ content_template: "Olá {{store_name}}! Encomenda #{{order_ref}} de {{amount}} Kz recebida." }],
          });
        }
        if (sql.includes("INSERT INTO notification_outbox")) {
          return Promise.resolve({
            rows: [{ id: "mock-outbox-uuid-1" }],
          });
        }
        if (sql.includes("UPDATE notification_outbox")) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const mockDriver = new MockDriver();
      const twilioDriver = new TwilioDriver();
      const whatsAppCloudDriver = new WhatsAppCloudApiDriver();
      const angolaSmsDriver = new AngolaSmsGatewayDriver();

      const service = new NotificationsService(
        mockDb,
        mockDriver,
        twilioDriver,
        whatsAppCloudDriver,
        angolaSmsDriver,
      );

      // 1. Test queue notification
      const queued = await service.queueNotification({
        recipientPhone: "+244923111222",
        channel: "whatsapp",
        templateSlug: "order_created_seller",
        variables: {
          store_name: "Loja Kilamba",
          order_ref: "PA-ABC123",
          amount: "150.000",
        },
      });

      expect(queued.id).toBe("mock-outbox-uuid-1");
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO notification_outbox"),
        expect.arrayContaining(["+244923111222", "whatsapp", "mock", "order_created_seller"]),
      );
    });

    it("performs failover from WhatsApp to SMS when WhatsApp dispatch fails", async () => {
      const mockDb: any = {
        query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
        transaction: vi.fn(),
      };

      const mockDriver = new MockDriver();
      const twilioDriver = new TwilioDriver();
      const whatsAppCloudDriver = new WhatsAppCloudApiDriver();
      const angolaSmsDriver = new AngolaSmsGatewayDriver();

      // Spy on mockDriver.send to fail for whatsapp and succeed for sms
      vi.spyOn(mockDriver, "send").mockImplementation(async (opts) => {
        if (opts.channel === "whatsapp") {
          return {
            success: false,
            status: "failed",
            error: "WhatsApp number not registered",
          };
        }
        return {
          success: true,
          status: "delivered",
          providerMessageId: "mock-sms-failover-ok",
        };
      });

      const service = new NotificationsService(
        mockDb,
        mockDriver,
        twilioDriver,
        whatsAppCloudDriver,
        angolaSmsDriver,
      );

      // Trigger executeSend directly through dispatchPendingBatch transaction mock
      mockDb.transaction.mockImplementation(async (fn: any) => {
        const fakeClient = {
          query: vi.fn().mockResolvedValue({
            rowCount: 1,
            rows: [
              {
                id: "test-uuid-failover",
                recipient_phone: "+244923111222",
                channel: "whatsapp",
                provider: "mock",
                template_slug: "order_created_seller",
                payload: {},
                rendered_content: "Mensagem de teste com failover",
                status: "pending",
                attempts: 0,
                max_attempts: 5,
                last_error: null,
                provider_message_id: null,
                metadata: {},
              },
            ],
          }),
        };
        return fn(fakeClient);
      });

      const dispatchResult = await service.dispatchPendingBatch(1);
      expect(dispatchResult.processed).toBe(1);
      expect(dispatchResult.sent).toBe(1); // Succeeds via SMS failover!
      expect(dispatchResult.failed).toBe(0);
    });
  });
});
