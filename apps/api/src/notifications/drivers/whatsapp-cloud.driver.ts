import { Injectable, Logger } from "@nestjs/common";
import {
  DriverSendResult,
  NotificationChannel,
  NotificationDriver,
  NotificationProvider,
  SendNotificationOptions,
  WebhookDeliveryResult,
} from "../notifications.types";

@Injectable()
export class WhatsAppCloudApiDriver implements NotificationDriver {
  readonly name: NotificationProvider = "whatsapp_cloud";
  private readonly logger = new Logger(WhatsAppCloudApiDriver.name);

  private readonly accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === "whatsapp";
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  async send(options: SendNotificationOptions): Promise<DriverSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: "failed",
        error: "WhatsApp Cloud API credentials not configured (WHATSAPP_CLOUD_ACCESS_TOKEN / PHONE_NUMBER_ID missing)",
      };
    }

    const { recipientPhone, renderedContent, templateSlug } = options;
    const cleanPhone = recipientPhone.replace(/\+/g, "");

    const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;

    // If templateSlug is mapped, send template payload; otherwise send text
    let payload: any;
    if (templateSlug) {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { preview_url: true, body: renderedContent },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { preview_url: true, body: renderedContent },
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`[WhatsAppCloudApiDriver] Error response: ${JSON.stringify(data)}`);
        return {
          success: false,
          status: "failed",
          error: data.error?.message || `WhatsApp Cloud API HTTP ${res.status}`,
          rawResponse: data,
        };
      }

      const msgId = data.messages?.[0]?.id;
      return {
        success: true,
        providerMessageId: msgId,
        status: "sent",
        rawResponse: data,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[WhatsAppCloudApiDriver] Network error: ${errMsg}`);
      return {
        success: false,
        status: "failed",
        error: errMsg,
      };
    }
  }

  parseWebhookDelivery(body: any): WebhookDeliveryResult | null {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const statusObj = change?.statuses?.[0];

      if (!statusObj) return null;

      const statusMap: Record<string, "delivered" | "failed" | "sent"> = {
        delivered: "delivered",
        read: "delivered",
        failed: "failed",
        sent: "sent",
      };

      return {
        providerMessageId: statusObj.id,
        status: statusMap[statusObj.status] || "sent",
        error: statusObj.errors?.[0]?.title,
        timestamp: new Date(Number(statusObj.timestamp) * 1000),
        raw: statusObj,
      };
    } catch {
      return null;
    }
  }
}
