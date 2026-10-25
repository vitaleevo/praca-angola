import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { CrmAutomationsService } from "./crm-automations.service";

@Controller("crm/webhooks")
export class CrmWebhooksController {
  constructor(
    private readonly database: DatabaseService,
    private readonly automations: CrmAutomationsService,
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

  @Post("meta")
  @HttpCode(200)
  async handleMetaWebhook(@Body() body: any, @Req() request: Request & { rawBody?: Buffer }) {
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
    // Immediate 200 response to satisfy Meta Webhook delivery SLAs
    try {
      const entry = body?.entry?.[0];
      if (!entry) return { status: "ignored" };

      // Case A: Facebook / Instagram Leadgen
      const leadgenChange = entry.changes?.find((c: any) => c.field === "leadgen");
      if (leadgenChange?.value) {
        const pageId = entry.id;
        const formId = leadgenChange.value.form_id;
        const leadgenId = leadgenChange.value.leadgen_id;

        // Find workspace associated with this page
        const connection = await this.database.query<{ workspace_id: string }>(
          `SELECT workspace_id FROM crm_channel_connections WHERE external_account_id = $1 AND status = 'connected' LIMIT 1`,
          [pageId],
        );

        if (connection.rows.length) {
          const workspaceId = connection.rows[0].workspace_id;
          const leadName = `Lead Facebook #${String(leadgenId).slice(-4)}`;

          await this.database.transaction(async (client) => {
            const contact = await client.query<{ id: string }>(
              `INSERT INTO crm_contacts (workspace_id, full_name, origin_channel, notes)
               VALUES ($1, $2, 'facebook_lead', $3)
               RETURNING id`,
              [workspaceId, leadName, `Lead gerado automaticamente via Formulário Meta ID: ${formId}`],
            );

            const firstStage = await client.query<{ id: string }>(
              `SELECT s.id FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id WHERE p.workspace_id = $1 AND p.is_default = true ORDER BY s.sort_order ASC LIMIT 1`,
              [workspaceId],
            );

            if (firstStage.rows.length) {
              await client.query(
                `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa)
                 VALUES ($1, $2, $3, $4, 0.00)`,
                [workspaceId, contact.rows[0].id, firstStage.rows[0].id, `Negócio · ${leadName}`],
              );
            }
          });
        }
      }

      // Case B: WhatsApp Cloud API incoming message
      const messagingChange = entry.changes?.find((c: any) => c.field === "messages");
      if (messagingChange?.value?.messages?.[0]) {
        const msg = messagingChange.value.messages[0];
        const fromPhone = msg.from;
        const textBody = msg.text?.body || "[Mídia recebida]";
        const phoneNumberId = messagingChange.value.metadata?.phone_number_id;

        const connection = await this.database.query<{ workspace_id: string }>(
          `SELECT workspace_id FROM crm_channel_connections WHERE external_account_id = $1 AND status = 'connected' LIMIT 1`,
          [phoneNumberId],
        );

        if (connection.rows.length) {
          const workspaceId = connection.rows[0].workspace_id;

          await this.database.transaction(async (client) => {
            // Find or create contact
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

            // Find or create conversation
            const convo = await client.query<{ id: string }>(
              `INSERT INTO crm_conversations (workspace_id, contact_id, channel, last_message_preview, last_message_at, unread_count)
               VALUES ($1, $2, 'whatsapp', $3, now(), 1)
               ON CONFLICT (workspace_id, contact_id, channel)
               DO UPDATE SET last_message_preview = $3, last_message_at = now(), unread_count = crm_conversations.unread_count + 1
               RETURNING id`,
              [workspaceId, contact.rows[0].id, textBody.slice(0, 100)],
            );

            // Insert inbound message
            await client.query(
              `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status)
               VALUES ($1, $2, 'inbound', 'text', $3, 'delivered')`,
              [convo.rows[0].id, workspaceId, textBody],
            );

            // Fire automation trigger for inbound message
            this.automations.fireTrigger({
              workspaceId,
              event: "new_message_inbound",
              contactId: contact.rows[0].id,
              conversationId: convo.rows[0].id,
              channel: "whatsapp",
              messageContent: textBody,
            }).catch(() => {});
          });
        }
      }
    } catch (err) {
      console.error("Meta Webhook processing error:", err);
    }

    return { status: "received" };
  }
}
