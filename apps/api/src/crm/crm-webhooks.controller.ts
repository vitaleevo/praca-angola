import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { CrmRealtimeService } from "./crm-realtime.service";
import { CrmService } from "./crm.service";

interface MetaMessage {
  id?: string;
  from?: string;
  text?: { body?: string };
}

interface MetaChange {
  field?: string;
  value?: {
    form_id?: string;
    leadgen_id?: string;
    metadata?: { phone_number_id?: string };
    messages?: MetaMessage[];
  };
}

interface MetaEntry {
  id?: string;
  changes?: MetaChange[];
  messaging?: Array<{
    sender?: { id?: string };
    message?: { mid?: string; text?: string; is_echo?: boolean };
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
        const inbound = await this.crmService.ingestExternalMessage({
          channel: body.object === "instagram" ? "instagram_dm" : "facebook_messenger",
          accountId: entry.id,
          senderId: event.sender.id,
          messageId: event.message.mid,
          text: event.message.text,
        });
        if (inbound) {
          processed++;
          this.realtime.emitWorkspaceEvent(inbound.workspaceId, "new_message", { message: inbound.message, conversationId: inbound.conversationId });
        }
      }
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        if (change.field === "leadgen" && await this.processLead(entry.id, change.value)) processed++;
        if (change.field === "messages" && Array.isArray(change.value?.messages)) {
          for (const message of change.value.messages) {
            if (await this.processMessage(change.value.metadata?.phone_number_id, message)) processed++;
          }
        }
      }
    }
    return { status: processed ? "received" : "ignored" };
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
    const textBody = message.text?.body || "[Mídia recebida]";

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
      const stored = await client.query<{ id: string; conversation_id: string; workspace_id: string; direction: "inbound"; message_type: "text"; content: string; status: "delivered"; created_at: string }>(
        `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, metadata)
         VALUES ($1, $2, 'inbound', 'text', $3, 'delivered', $4::jsonb)
         RETURNING id, conversation_id, workspace_id, direction, message_type, content, status, created_at`,
        [conversation.rows[0].id, workspaceId, textBody, JSON.stringify({ meta_message_id: message.id })],
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
