export type NotificationChannel = "sms" | "whatsapp";

export type NotificationProvider = "mock" | "twilio" | "whatsapp_cloud" | "angola_sms_gateway";

export type OutboxStatus = "pending" | "processing" | "sent" | "delivered" | "failed" | "cancelled";

export type AngolanCarrier = "unitel" | "africell" | "movicel" | "other";

export interface SendNotificationOptions {
  recipientPhone: string;
  channel: NotificationChannel;
  renderedContent: string;
  templateSlug?: string;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DriverSendResult {
  success: boolean;
  providerMessageId?: string;
  status: "sent" | "delivered" | "failed";
  error?: string;
  rawResponse?: Record<string, any>;
}

export interface WebhookDeliveryResult {
  providerMessageId: string;
  status: "delivered" | "failed" | "sent";
  error?: string;
  timestamp?: Date;
  raw?: Record<string, any>;
}

export interface NotificationDriver {
  readonly name: NotificationProvider;
  supportsChannel(channel: NotificationChannel): boolean;
  send(options: SendNotificationOptions): Promise<DriverSendResult>;
  verifyWebhookSignature?(body: any, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhookDelivery?(body: any): WebhookDeliveryResult | null;
}

export interface QueueNotificationParams {
  userId?: string;
  recipientPhone: string;
  channel?: NotificationChannel;
  templateSlug: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
  priority?: "high" | "normal";
}
