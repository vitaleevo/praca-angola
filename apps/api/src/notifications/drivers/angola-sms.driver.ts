import { Injectable, Logger } from "@nestjs/common";
import {
  DriverSendResult,
  NotificationChannel,
  NotificationDriver,
  NotificationProvider,
  SendNotificationOptions,
  WebhookDeliveryResult,
} from "../notifications.types";
import { detectAngolanCarrier, normalizeAngolanPhone } from "../phone.utils";

@Injectable()
export class AngolaSmsGatewayDriver implements NotificationDriver {
  readonly name: NotificationProvider = "angola_sms_gateway";
  private readonly logger = new Logger(AngolaSmsGatewayDriver.name);

  private readonly gatewayUrl = process.env.ANGOLA_SMS_GATEWAY_URL;
  private readonly apiKey = process.env.ANGOLA_SMS_API_KEY;
  private readonly senderId = process.env.ANGOLA_SMS_SENDER_ID || "PUVO";

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === "sms";
  }

  isConfigured(): boolean {
    return Boolean(this.gatewayUrl && this.apiKey);
  }

  async send(options: SendNotificationOptions): Promise<DriverSendResult> {
    const { recipientPhone, renderedContent } = options;
    const normalizedPhone = normalizeAngolanPhone(recipientPhone);
    const carrier = detectAngolanCarrier(normalizedPhone);

    if (!this.isConfigured()) {
      return {
        success: false,
        status: "failed",
        error: "Angola SMS Gateway not configured (ANGOLA_SMS_GATEWAY_URL / ANGOLA_SMS_API_KEY missing)",
      };
    }

    try {
      this.logger.log(`[AngolaSmsGatewayDriver] Dispatching to ${normalizedPhone} (Carrier: ${carrier})`);

      const res = await fetch(this.gatewayUrl!, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: this.senderId,
          recipient: normalizedPhone,
          message: renderedContent,
          carrier,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`[AngolaSmsGatewayDriver] Error response: ${JSON.stringify(data)}`);
        return {
          success: false,
          status: "failed",
          error: data.message || `Angola Gateway HTTP ${res.status}`,
          rawResponse: data,
        };
      }

      return {
        success: true,
        providerMessageId: data.message_id || data.id,
        status: data.status === "DELIVRD" ? "delivered" : "sent",
        rawResponse: data,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[AngolaSmsGatewayDriver] Network error: ${errMsg}`);
      return {
        success: false,
        status: "failed",
        error: errMsg,
      };
    }
  }

  parseWebhookDelivery(body: any): WebhookDeliveryResult | null {
    if (!body || (!body.message_id && !body.id)) return null;

    const id = body.message_id || body.id;
    const statusStr = (body.status || "").toUpperCase();

    const isDelivered = ["DELIVRD", "DELIVERED", "SUCCESS"].includes(statusStr);
    const isFailed = ["UNDELIV", "FAILED", "REJECTED", "EXPIRED"].includes(statusStr);

    return {
      providerMessageId: id,
      status: isDelivered ? "delivered" : isFailed ? "failed" : "sent",
      error: isFailed ? body.error || statusStr : undefined,
      timestamp: new Date(),
      raw: body,
    };
  }
}
