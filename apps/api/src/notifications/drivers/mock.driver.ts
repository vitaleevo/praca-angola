import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DriverSendResult,
  NotificationChannel,
  NotificationDriver,
  NotificationProvider,
  SendNotificationOptions,
  WebhookDeliveryResult,
} from "../notifications.types";

@Injectable()
export class MockDriver implements NotificationDriver {
  readonly name: NotificationProvider = "mock";
  private readonly logger = new Logger(MockDriver.name);

  // In-memory inspection log for tests & local verification
  public readonly sentHistory: Array<SendNotificationOptions & { providerMessageId: string; timestamp: Date }> = [];

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === "sms" || channel === "whatsapp";
  }

  async send(options: SendNotificationOptions): Promise<DriverSendResult> {
    const { recipientPhone, channel, renderedContent } = options;

    // Simulation of invalid recipient / simulated delivery rejection
    if (recipientPhone.includes("000000") || recipientPhone.endsWith("9999")) {
      this.logger.warn(`[MockDriver] Simulated failure for recipient ${recipientPhone}`);
      return {
        success: false,
        status: "failed",
        error: "Simulated gateway error: Recipient unreachable",
      };
    }

    const providerMessageId = `mock-${channel}-${randomUUID().slice(0, 12)}`;

    this.sentHistory.push({
      ...options,
      providerMessageId,
      timestamp: new Date(),
    });

    this.logger.log(
      `[MockDriver] 📱 DISPATCHED [${channel.toUpperCase()}] to ${recipientPhone} (ID: ${providerMessageId}): "${renderedContent}"`,
    );

    return {
      success: true,
      providerMessageId,
      status: "delivered", // Mock immediately confirms delivery
      rawResponse: { simulated: true, channel, to: recipientPhone },
    };
  }

  parseWebhookDelivery(body: any): WebhookDeliveryResult | null {
    if (!body || !body.providerMessageId) return null;
    return {
      providerMessageId: body.providerMessageId,
      status: body.status === "failed" ? "failed" : "delivered",
      error: body.error,
      timestamp: new Date(),
      raw: body,
    };
  }
}
