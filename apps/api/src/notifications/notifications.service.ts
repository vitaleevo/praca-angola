import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import {
  DriverSendResult,
  NotificationChannel,
  NotificationDriver,
  NotificationProvider,
  QueueNotificationParams,
} from "./notifications.types";
import { MockDriver } from "./drivers/mock.driver";
import { TwilioDriver } from "./drivers/twilio.driver";
import { WhatsAppCloudApiDriver } from "./drivers/whatsapp-cloud.driver";
import { AngolaSmsGatewayDriver } from "./drivers/angola-sms.driver";
import { normalizeAngolanPhone } from "./phone.utils";

interface OutboxRow {
  id: string;
  user_id: string | null;
  recipient_phone: string;
  channel: NotificationChannel;
  provider: NotificationProvider;
  template_slug: string | null;
  payload: Record<string, any>;
  rendered_content: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  metadata: Record<string, any>;
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isProcessing = false;

  private readonly drivers = new Map<NotificationProvider, NotificationDriver>();

  constructor(
    private readonly database: DatabaseService,
    private readonly mockDriver: MockDriver,
    private readonly twilioDriver: TwilioDriver,
    private readonly whatsAppCloudDriver: WhatsAppCloudApiDriver,
    private readonly angolaSmsDriver: AngolaSmsGatewayDriver,
  ) {
    this.registerDriver(mockDriver);
    this.registerDriver(twilioDriver);
    this.registerDriver(whatsAppCloudDriver);
    this.registerDriver(angolaSmsDriver);
  }

  onModuleInit() {
    // Background polling cycle every 10 seconds for outbox dispatch
    this.timer = setInterval(() => {
      void this.dispatchPendingBatch().catch((err) => {
        this.logger.error("Outbox dispatch background cycle error", err);
      });
    }, 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  registerDriver(driver: NotificationDriver) {
    this.drivers.set(driver.name, driver);
  }

  getDriver(name: NotificationProvider): NotificationDriver {
    const driver = this.drivers.get(name);
    if (!driver) {
      this.logger.warn(`Driver ${name} not found, falling back to mock driver`);
      return this.mockDriver;
    }
    return driver;
  }

  /**
   * Resolves the primary provider to use for a given channel and recipient.
   */
  resolveProviderForChannel(channel: NotificationChannel): NotificationProvider {
    const envProvider = (process.env.NOTIFICATION_DEFAULT_PROVIDER || "mock") as NotificationProvider;

    if (envProvider === "mock") return "mock";

    if (channel === "whatsapp") {
      if (this.whatsAppCloudDriver.isConfigured()) return "whatsapp_cloud";
      if (this.twilioDriver.isConfigured()) return "twilio";
      return "mock";
    }

    // SMS Channel
    if (this.angolaSmsDriver.isConfigured()) return "angola_sms_gateway";
    if (this.twilioDriver.isConfigured()) return "twilio";
    return "mock";
  }

  /**
   * Renders a template from database or falls back to basic interpolation.
   */
  async renderTemplate(slug: string, variables: Record<string, any>): Promise<string> {
    const res = await this.database.query<{ content_template: string }>(
      `SELECT content_template FROM notification_templates WHERE slug = $1 LIMIT 1`,
      [slug],
    );

    if (!res.rows.length) {
      this.logger.warn(`Template ${slug} not found in database, using generic message.`);
      return `Alerta PUVO Angola: ${JSON.stringify(variables)}`;
    }

    let text = res.rows[0].content_template;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`{{${key}}}`, "g"), String(val));
    }
    return text;
  }

  /**
   * Transactional queueing of a notification into notification_outbox.
   * Can run within an existing database transaction client or standalone.
   */
  async queueNotification(params: QueueNotificationParams, client?: PoolClient): Promise<{ id: string }> {
    const normalizedPhone = normalizeAngolanPhone(params.recipientPhone);
    const channel: NotificationChannel = params.channel || "whatsapp";
    const provider = this.resolveProviderForChannel(channel);

    const rendered = await this.renderTemplate(params.templateSlug, params.variables);

    const query = `
      INSERT INTO notification_outbox (
        user_id, recipient_phone, channel, provider, template_slug, payload, rendered_content, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const values = [
      params.userId || null,
      normalizedPhone,
      channel,
      provider,
      params.templateSlug,
      JSON.stringify(params.variables),
      rendered,
      JSON.stringify(params.metadata || {}),
    ];

    if (client) {
      const res = await client.query<{ id: string }>(query, values);
      return res.rows[0];
    } else {
      const res = await this.database.query<{ id: string }>(query, values);
      return res.rows[0];
    }
  }

  /**
   * Processes a batch of pending/failed outbox records using FOR UPDATE SKIP LOCKED.
   */
  async dispatchPendingBatch(limit = 10): Promise<{ processed: number; sent: number; failed: number }> {
    if (this.isProcessing) return { processed: 0, sent: 0, failed: 0 };
    this.isProcessing = true;

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < limit; i++) {
        const item = await this.database.transaction(async (client) => {
          const res = await client.query<OutboxRow>(
            `SELECT id, user_id, recipient_phone, channel, provider, template_slug, payload,
                    rendered_content, status, attempts, max_attempts, last_error, provider_message_id, metadata
             FROM notification_outbox
             WHERE (status = 'pending' OR (status = 'failed' AND attempts < max_attempts))
               AND next_attempt_at <= now()
             ORDER BY created_at ASC
             LIMIT 1
             FOR UPDATE OF notification_outbox SKIP LOCKED`,
          );

          if (!res.rowCount) return null;

          const row = res.rows[0];
          await client.query(
            `UPDATE notification_outbox
             SET status = 'processing', attempts = attempts + 1, updated_at = now()
             WHERE id = $1`,
            [row.id],
          );
          return row;
        });

        if (!item) break;
        processedCount++;

        const result = await this.executeSend(item);

        if (result.success) {
          sentCount++;
          await this.database.query(
            `UPDATE notification_outbox
             SET status = $2,
                 provider_message_id = $3,
                 sent_at = now(),
                 delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
                 last_error = NULL,
                 updated_at = now()
             WHERE id = $1`,
            [item.id, result.status, result.providerMessageId || null],
          );
        } else {
          failedCount++;
          // Exponential backoff: min(60m, 2^attempts minutes)
          await this.database.query(
            `UPDATE notification_outbox
             SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
                 last_error = $2,
                 next_attempt_at = now() + make_interval(mins => LEAST(60, power(2, attempts)::int)),
                 updated_at = now()
             WHERE id = $1`,
            [item.id, result.error || "Erro desconhecido"],
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed: processedCount, sent: sentCount, failed: failedCount };
  }

  private async executeSend(item: OutboxRow): Promise<DriverSendResult> {
    const driver = this.getDriver(item.provider);

    // Initial attempt
    const result = await driver.send({
      recipientPhone: item.recipient_phone,
      channel: item.channel,
      renderedContent: item.rendered_content,
      templateSlug: item.template_slug || undefined,
      variables: item.payload,
      metadata: item.metadata,
    });

    // Smart Fallback: if WhatsApp dispatch failed, failover to SMS
    if (!result.success && item.channel === "whatsapp") {
      this.logger.warn(
        `[NotificationsService] WhatsApp failed for ${item.recipient_phone} (${result.error}). Attempting SMS failover...`,
      );

      const smsProvider = this.resolveProviderForChannel("sms");
      const smsDriver = this.getDriver(smsProvider);

      const smsResult = await smsDriver.send({
        recipientPhone: item.recipient_phone,
        channel: "sms",
        renderedContent: item.rendered_content,
        templateSlug: item.template_slug || undefined,
        variables: item.payload,
        metadata: { ...item.metadata, failover_from: "whatsapp" },
      });

      if (smsResult.success) {
        this.logger.log(`[NotificationsService] SMS failover SUCCEEDED for ${item.recipient_phone}!`);
        return smsResult;
      }
    }

    return result;
  }

  /**
   * Handles incoming webhooks from Twilio, WhatsApp Cloud API or Angola SMS Gateways.
   */
  async handleWebhook(providerName: NotificationProvider, body: any): Promise<{ received: boolean; updated: boolean }> {
    const driver = this.getDriver(providerName);

    // Log the webhook raw payload
    const logRes = await this.database.query<{ id: string }>(
      `INSERT INTO notification_webhook_logs (provider, event_type, payload)
       VALUES ($1, 'delivery_receipt', $2)
       RETURNING id`,
      [providerName, JSON.stringify(body)],
    );

    const delivery = driver.parseWebhookDelivery ? driver.parseWebhookDelivery(body) : null;
    let updated = false;

    if (delivery?.providerMessageId) {
      const updateRes = await this.database.query(
        `UPDATE notification_outbox
         SET status = $2,
             delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
             last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE last_error END,
             updated_at = now()
         WHERE provider_message_id = $1`,
        [delivery.providerMessageId, delivery.status, delivery.error || null],
      );

      if ((updateRes.rowCount ?? 0) > 0) {
        updated = true;
        await this.database.query(`UPDATE notification_webhook_logs SET processed = true WHERE id = $1`, [logRes.rows[0].id]);
      }
    }

    return { received: true, updated };
  }

  /**
   * Fetch recent outbox items with statistics.
   */
  async getOutboxTelemetry(limit = 50) {
    const stats = await this.database.query<{
      status: string;
      channel: string;
      count: number;
    }>(
      `SELECT status, channel, count(*)::int AS count
       FROM notification_outbox
       GROUP BY status, channel`,
    );

    const items = await this.database.query(
      `SELECT id, recipient_phone, channel, provider, template_slug,
              rendered_content, status, attempts, last_error, provider_message_id,
              created_at, sent_at, delivered_at
       FROM notification_outbox
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    return {
      stats: stats.rows,
      items: items.rows,
    };
  }
}
