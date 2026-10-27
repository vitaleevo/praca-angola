import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { CrmRealtimeService } from "./crm-realtime.service";
import { CrmService } from "./crm.service";
import { publicMetaImageUrl } from "./meta-media";

interface MetaMessage {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
}

interface MetaSyncContact { type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }

interface MetaChange {
  field?: string;
  value?: {
    form_id?: string;
    leadgen_id?: string;
    event?: string;
    waba_info?: { waba_id?: string };
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    history?: Array<{ metadata?: { progress?: number }; threads?: Array<{ id?: string; messages?: MetaMessage[] }>; errors?: Array<{ code?: number }> }>;
    message_echoes?: MetaMessage[];
    state_sync?: MetaSyncContact[];
    messages?: MetaMessage[];
  };
}

interface MetaEntry {
  id?: string;
  changes?: MetaChange[];
  messaging?: Array<{
    sender?: { id?: string };
    message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
  }>;
}

@Controller("crm/webhooks")
export class CrmWebhooksController {
  constructor(
    private readonly database: DatabaseService,
    private readonly automations: CrmAutomationsService,
    private readonly realtime: CrmRealtimeService,
    private readonly crmService: CrmService,
  ) {}

  @Get("meta")
  verifyMetaWebhook(
    @Query("hub.mode") mode: string,
    @Query("hub.challenge") challenge: string,
    @Query("hub.verify_token") verifyToken: string,
    @Res() res: Response,
  ) {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) return res.status(503).send("Webhook not configured");
    if (mode === "subscribe" && verifyToken === expectedToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  @Get("meta/callback")
  async completeMetaOAuth(
    @Query("state") state: string,
    @Query("code") code: string,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const destination = new URL("/vendedor/crm/conversas", process.env.PUBLIC_SITE_URL || process.env.WEB_ORIGIN || "http://localhost:3100");
    if (error || !state || !code) {
      destination.searchParams.set("meta_error", "authorization_cancelled");
      return res.redirect(302, destination.toString());
    }
    try {
      const result = await this.crmService.finishMetaAuthorization(state, code);
      destination.searchParams.set("meta_attempt", result.attemptId);
    } catch {
      destination.searchParams.set("meta_error", "authorization_failed");
    }
    return res.redirect(302, destination.toString());
  }

  @Post("meta")
  @HttpCode(200)
  async handleMetaWebhook(@Body() body: { object?: string; entry?: MetaEntry[] }, @Req() request: Request & { rawBody?: Buffer }) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) throw new ServiceUnavailableException("Webhook not configured");
    const signature = request.header("x-hub-signature-256");
    if (!request.rawBody || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      throw new ForbiddenException("Invalid webhook signature");
    }
    const expected = createHmac("sha256", appSecret).update(request.rawBody).digest();
    const provided = Buffer.from(signature.slice(7), "hex");
    if (!timingSafeEqual(expected, provided)) {
      throw new ForbiddenException("Invalid webhook signature");
    }
    let processed = 0;
    for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
      for (const event of Array.isArray(entry?.messaging) ? entry.messaging : []) {
        if (!entry.id || !event.sender?.id || !event.message?.mid || event.message.is_echo) continue;
        const imageUrls = (event.message.attachments ?? [])
          .filter((attachment) => attachment.type === "image")
          .map((attachment) => publicMetaImageUrl(attachment.payload?.url))
          .filter((url): url is string => Boolean(url)).slice(0, 8);
        const inbound = await this.crmService.ingestExternalMessage({
          channel: body.object === "instagram" ? "instagram_dm" : "facebook_messenger",
          accountId: entry.id,
          senderId: event.sender.id,
          messageId: event.message.mid,
          text: event.message.text,
          imageUrls,
        });
        if (inbound) {
          processed++;
          this.realtime.emitWorkspaceEvent(inbound.workspaceId, "new_message", { message: inbound.message, conversationId: inbound.conversationId });
        }
      }
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        if (body.object === "whatsapp_business_account" && change.field === "account_update" &&
          ["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED"].includes(change.value?.event ?? "") && (change.value?.waba_info?.waba_id || entry.id)) {
          const expired = await this.database.query(
            `UPDATE crm_channel_connections SET status = 'expired', updated_at = now()
             WHERE channel_type = 'whatsapp_cloud' AND meta_waba_id = $1 AND status = 'connected' RETURNING id`,
            [change.value?.waba_info?.waba_id || entry.id],
          );
          processed += expired.rowCount || 0;
        }
        if (change.field === "leadgen" && await this.processLead(entry.id, change.value)) processed++;
        if (body.object === "whatsapp_business_account" && change.field === "history") {
          for (const chunk of change.value?.history ?? []) {
            if (change.value?.metadata?.phone_number_id) {
              const progress = chunk.metadata?.progress;
              const declined = chunk.errors?.some((error) => error.code === 2593109) ?? false;
              if ((Number.isInteger(progress) && progress! >= 0 && progress! <= 100) || declined) {
                await this.database.query(
                  `UPDATE crm_whatsapp_sync_requests sr
                   SET history_progress = CASE WHEN $2::integer IS NULL THEN sr.history_progress ELSE GREATEST(COALESCE(sr.history_progress, 0), $2::integer) END,
                       history_declined = sr.history_declined OR $3
                   FROM crm_channel_connections cc
                   WHERE cc.id = sr.channel_connection_id AND cc.external_account_id = $1 AND cc.channel_type = 'whatsapp_cloud'`,
                  [change.value.metadata.phone_number_id, Number.isInteger(progress) ? progress : null, declined],
                );
              }
            }
            for (const thread of chunk.threads ?? []) {
              for (const message of thread.messages ?? []) {
                if (message.type === "media_placeholder" && change.value?.metadata?.phone_number_id && thread.id && message.id) {
                  await this.database.query(
                    `INSERT INTO crm_whatsapp_history_media (phone_number_id, message_id, contact_phone) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [change.value.metadata.phone_number_id, message.id, thread.id],
                  );
                  continue;
                }
                if (await this.processSyncedWhatsAppMessage(change.value?.metadata?.phone_number_id, thread.id, message, false, change.value?.metadata?.display_phone_number)) processed++;
              }
            }
          }
          // Meta sends recent media in a separate history change after a media_placeholder.
          for (const message of change.value?.messages ?? []) {
            const displayPhone = change.value?.metadata?.display_phone_number;
            let contactPhone = message.to || (message.from !== displayPhone ? message.from : undefined);
            if (!contactPhone && message.id && change.value?.metadata?.phone_number_id) {
              const known = await this.database.query<{ contact_phone: string }>(
                `SELECT contact_phone FROM crm_whatsapp_history_media WHERE phone_number_id = $1 AND message_id = $2`,
                [change.value.metadata.phone_number_id, message.id],
              );
              contactPhone = known.rows[0]?.contact_phone;
            }
            if (await this.processSyncedWhatsAppMessage(change.value?.metadata?.phone_number_id, contactPhone, message, false, displayPhone)) processed++;
          }
        }
        if (body.object === "whatsapp_business_account" && change.field === "smb_message_echoes") {
          for (const message of change.value?.message_echoes ?? []) {
            if (await this.processSyncedWhatsAppMessage(change.value?.metadata?.phone_number_id, message.to, message, true)) processed++;
          }
        }
        if (body.object === "whatsapp_business_account" && change.field === "smb_app_state_sync") {
          for (const item of change.value?.state_sync ?? []) {
            if (await this.processWhatsAppContact(change.value?.metadata?.phone_number_id, item)) processed++;
          }
        }
        if (change.field === "messages" && Array.isArray(change.value?.messages)) {
          for (const message of change.value.messages) {
            if (await this.processMessage(change.value.metadata?.phone_number_id, message)) processed++;
          }
        }
      }
    }
    return { status: processed ? "received" : "ignored" };
  }

  private async processWhatsAppContact(phoneNumberId: string | undefined, item: MetaSyncContact): Promise<boolean> {
    if (!phoneNumberId || item?.type !== "contact" || item.action !== "add" || !/^\d{5,20}$/.test(item.contact?.phone_number ?? "")) return false;
    const linked = await this.database.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM crm_channel_connections WHERE channel_type = 'whatsapp_cloud' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
      [phoneNumberId],
    );
    if (!linked.rows[0]) return false;
    const phone = item.contact!.phone_number!;
    const name = (item.contact?.full_name || item.contact?.first_name || `WhatsApp +${phone}`).slice(0, 100);
    const existing = await this.database.query<{ id: string }>(`SELECT id FROM crm_contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`, [linked.rows[0].workspace_id, phone]);
    if (existing.rows.length) return false;
    await this.database.query(`INSERT INTO crm_contacts (workspace_id, full_name, phone, origin_channel) VALUES ($1, $2, $3, 'whatsapp')`, [linked.rows[0].workspace_id, name, phone]);
    return true;
  }

  private async processSyncedWhatsAppMessage(phoneNumberId?: string, contactPhone?: string, message?: MetaMessage, echo = false, displayPhone?: string): Promise<boolean> {
    if (!phoneNumberId || !/^\d{5,20}$/.test(contactPhone ?? "") || !message?.id || message.type === "media_placeholder") return false;
    const connection = await this.database.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM crm_channel_connections WHERE channel_type = 'whatsapp_cloud' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
      [phoneNumberId],
    );
    const linked = connection.rows[0];
    if (!linked) return false;
    const phone = contactPhone!;
    const outbound = echo || Boolean(displayPhone && message.from?.replace(/\D/g, "") === displayPhone.replace(/\D/g, "")) || message.to === phone;
    const mediaId = message.image?.id;
    const content = (message.text?.body || message.image?.caption || (mediaId ? "Fotografia" : "[Mensagem multimédia]")).slice(0, 4000);
    const unixTime = Number(message.timestamp);
    const timestamp = Number.isSafeInteger(unixTime) && unixTime > 1_500_000_000 && unixTime < Date.now() / 1000 + 3600 ? new Date(unixTime * 1000) : new Date();
    const stored = await this.database.transaction(async (client) => {
      const event = await client.query(`INSERT INTO crm_meta_webhook_events (event_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_key`, [`whatsapp:${message.id}`]);
      if (!event.rows.length) return null;
      let contact = await client.query<{ id: string }>(`SELECT id FROM crm_contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`, [linked.workspace_id, phone]);
      if (!contact.rows.length) contact = await client.query<{ id: string }>(
        `INSERT INTO crm_contacts (workspace_id, full_name, phone, origin_channel) VALUES ($1, $2, $3, 'whatsapp') RETURNING id`,
        [linked.workspace_id, `WhatsApp +${phone}`, phone],
      );
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO crm_conversations (workspace_id, contact_id, channel, channel_connection_id, external_thread_id, last_message_preview, last_message_at, unread_count)
         VALUES ($1, $2, 'whatsapp', $3, $4, $5, $6, 0)
         ON CONFLICT (workspace_id, contact_id, channel)
         DO UPDATE SET channel_connection_id = EXCLUDED.channel_connection_id,
           last_message_preview = CASE WHEN crm_conversations.last_message_at <= EXCLUDED.last_message_at THEN EXCLUDED.last_message_preview ELSE crm_conversations.last_message_preview END,
           last_message_at = GREATEST(crm_conversations.last_message_at, EXCLUDED.last_message_at)
         RETURNING id`,
        [linked.workspace_id, contact.rows[0].id, linked.id, phone, content.slice(0, 100), timestamp],
      );
      const saved = await client.query<{ id: string; workspace_id: string; conversation_id: string; direction: string; message_type: string; content: string; metadata: Record<string, unknown>; status: string; created_at: string }>(
        `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'delivered', $6::jsonb, $7)
         RETURNING id, workspace_id, conversation_id, direction, message_type, content, metadata, status, created_at`,
        [conversation.rows[0].id, linked.workspace_id, outbound ? "outbound" : "inbound", mediaId ? "image" : "text", content,
          JSON.stringify({ meta_message_id: message.id, ...(mediaId ? { media_id: mediaId } : {}), source: echo ? "whatsapp_business_app" : "whatsapp_history" }), timestamp],
      );
      return saved.rows[0];
    });
    if (stored) this.realtime.emitWorkspaceEvent(stored.workspace_id, "new_message", { message: stored, conversationId: stored.conversation_id });
    return Boolean(stored);
  }

  private async processLead(pageId?: string, value?: MetaChange["value"]): Promise<boolean> {
    const leadgenId = value?.leadgen_id;
    if (!pageId || !leadgenId) return false;
    const connection = await this.database.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM crm_channel_connections
       WHERE channel_type = 'facebook_page' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
      [pageId],
    );
    const workspaceId = connection.rows[0]?.workspace_id;
    if (!workspaceId) return false;
    const leadName = `Lead Facebook #${leadgenId.slice(-4)}`;

    return this.database.transaction(async (client) => {
      const event = await client.query(
        `INSERT INTO crm_meta_webhook_events (event_key) VALUES ($1)
         ON CONFLICT DO NOTHING RETURNING event_key`,
        [`leadgen:${leadgenId}`],
      );
      if (!event.rows.length) return false;
      const contact = await client.query<{ id: string }>(
        `INSERT INTO crm_contacts (workspace_id, full_name, origin_channel, notes)
         VALUES ($1, $2, 'facebook_lead', $3) RETURNING id`,
        [workspaceId, leadName, `Lead gerado automaticamente via Formulário Meta ID: ${value?.form_id ?? "desconhecido"}`],
      );
      const firstStage = await client.query<{ id: string }>(
        `SELECT s.id FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id
         WHERE p.workspace_id = $1 AND p.is_default = true ORDER BY s.sort_order ASC LIMIT 1`,
        [workspaceId],
      );
      if (firstStage.rows.length) {
        await client.query(
          `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa)
           VALUES ($1, $2, $3, $4, 0.00)`,
          [workspaceId, contact.rows[0].id, firstStage.rows[0].id, `Negócio · ${leadName}`],
        );
      }
      return true;
    });
  }

  private async processMessage(phoneNumberId?: string, message?: MetaMessage): Promise<boolean> {
    if (!phoneNumberId || !message?.id || !message.from) return false;
    const connection = await this.database.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM crm_channel_connections
       WHERE channel_type = 'whatsapp_cloud' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
      [phoneNumberId],
    );
    const workspaceId = connection.rows[0]?.workspace_id;
    if (!workspaceId) return false;
    const fromPhone = message.from;
    const mediaId = message.image?.id;
    const textBody = message.text?.body || message.image?.caption || (mediaId ? "Fotografia recebida" : "[Mídia recebida]");

    const result = await this.database.transaction(async (client) => {
      const event = await client.query(
        `INSERT INTO crm_meta_webhook_events (event_key) VALUES ($1)
         ON CONFLICT DO NOTHING RETURNING event_key`,
        [`whatsapp:${message.id}`],
      );
      if (!event.rows.length) return null;
      let contact = await client.query<{ id: string }>(
        `SELECT id FROM crm_contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`,
        [workspaceId, fromPhone],
      );
      if (!contact.rows.length) {
        contact = await client.query<{ id: string }>(
          `INSERT INTO crm_contacts (workspace_id, full_name, phone, origin_channel)
           VALUES ($1, $2, $3, 'whatsapp') RETURNING id`,
          [workspaceId, `WhatsApp +${fromPhone}`, fromPhone],
        );
      }
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO crm_conversations (workspace_id, contact_id, channel, channel_connection_id, external_thread_id, last_message_preview, last_message_at, unread_count)
         VALUES ($1, $2, 'whatsapp', $3, $4, $5, now(), 1)
         ON CONFLICT (workspace_id, contact_id, channel)
         DO UPDATE SET channel_connection_id = EXCLUDED.channel_connection_id, external_thread_id = EXCLUDED.external_thread_id,
                       last_message_preview = EXCLUDED.last_message_preview, last_message_at = now(), unread_count = crm_conversations.unread_count + 1
         RETURNING id`,
        [workspaceId, contact.rows[0].id, connection.rows[0].id, fromPhone, textBody.slice(0, 100)],
      );
      const stored = await client.query<{ id: string; conversation_id: string; workspace_id: string; direction: "inbound"; message_type: "text" | "image"; content: string; status: "delivered"; created_at: string; metadata: Record<string, unknown> }>(
        `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, metadata)
         VALUES ($1, $2, 'inbound', $3, $4, 'delivered', $5::jsonb)
         RETURNING id, conversation_id, workspace_id, direction, message_type, content, status, metadata, created_at`,
        [conversation.rows[0].id, workspaceId, mediaId ? "image" : "text", textBody, JSON.stringify({ meta_message_id: message.id, ...(mediaId ? { media_id: mediaId } : {}) })],
      );
      await client.query(`UPDATE crm_channel_connections SET last_sync_at = now() WHERE id = $1 AND workspace_id = $2`, [connection.rows[0].id, workspaceId]);
      return { contactId: contact.rows[0].id, conversationId: conversation.rows[0].id, message: stored.rows[0] };
    });
    if (!result) return false;
    this.realtime.emitWorkspaceEvent(workspaceId, "new_message", { message: result.message, conversationId: result.conversationId });
    void this.automations.fireTrigger({
      workspaceId,
      event: "new_message_inbound",
      contactId: result.contactId,
      conversationId: result.conversationId,
      channel: "whatsapp",
      messageContent: textBody,
    }).catch(() => {});
    return true;
  }
}
