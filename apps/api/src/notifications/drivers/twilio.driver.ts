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
export class TwilioDriver implements NotificationDriver {
  readonly name: NotificationProvider = "twilio";
  private readonly logger = new Logger(TwilioDriver.name);

  private readonly accountSid = process.env.TWILIO_ACCOUNT_SID;
  private readonly authToken = process.env.TWILIO_AUTH_TOKEN;
  private readonly smsFrom = process.env.TWILIO_PHONE_NUMBER;
  private readonly whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === "sms" || channel === "whatsapp";
  }

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken && (this.smsFrom || this.whatsappFrom));
  }

  async send(options: SendNotificationOptions): Promise<DriverSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: "failed",
        error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)",
      };
    }

    const { recipientPhone, channel, renderedContent } = options;
    const isWhatsApp = channel === "whatsapp";

    const from = isWhatsApp ? `whatsapp:${this.whatsappFrom}` : this.smsFrom;
    const to = isWhatsApp ? `whatsapp:${recipientPhone}` : recipientPhone;

    if (!from) {
      return {
        success: false,
        status: "failed",
        error: `No sender configured for channel ${channel} (check TWILIO_PHONE_NUMBER or TWILIO_WHATSAPP_NUMBER)`,
      };
    }

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      const params = new URLSearchParams({
        From: from,
        To: to,
        Body: renderedContent,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`[TwilioDriver] API error: ${JSON.stringify(data)}`);
        return {
          success: false,
          status: "failed",
          error: data.message || `Twilio HTTP ${res.status}`,
          rawResponse: data,
        };
      }

      return {
        success: true,
        providerMessageId: data.sid,
        status: data.status === "delivered" ? "delivered" : "sent",
        rawResponse: data,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[TwilioDriver] Network error: ${errMsg}`);
      return {
        success: false,
        status: "failed",
        error: errMsg,
      };
    }
  }

  parseWebhookDelivery(body: any): WebhookDeliveryResult | null {
    if (!body || !body.MessageSid) return null;

    const statusMap: Record<string, "delivered" | "failed" | "sent"> = {
      delivered: "delivered",
      undelivered: "failed",
      failed: "failed",
      sent: "sent",
    };

    return {
      providerMessageId: body.MessageSid,
      status: statusMap[body.MessageStatus] || "sent",
      error: body.ErrorCode ? `Twilio Error ${body.ErrorCode}` : undefined,
      timestamp: new Date(),
      raw: body,
    };
  }
}
