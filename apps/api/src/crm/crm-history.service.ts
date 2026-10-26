import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { decryptPrivateValue } from "../auth/auth.crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MetaGraphService, type MetaHistoryConversation, type MetaHistoryMessage } from "./meta-graph.service";
import { publicMetaImageUrl } from "./meta-media";

type HistoryChannel = "facebook_page" | "instagram_direct";

@Injectable()
export class CrmHistoryService {
  constructor(private readonly database: DatabaseService, private readonly meta: MetaGraphService) {}

  async importPage(workspaceId: string, channelId: string, after?: string) {
    const cursor = this.readCursor(after, workspaceId, channelId);
    const rows = await this.database.query<{
      channel_type: HistoryChannel; external_account_id: string; credentials_ciphertext: string;
    }>(
      `SELECT channel_type, external_account_id, credentials_ciphertext FROM crm_channel_connections
       WHERE id = $1 AND workspace_id = $2 AND status = 'connected'
         AND channel_type IN ('facebook_page', 'instagram_direct') LIMIT 1`,
      [channelId, workspaceId],
    );
    const channel = rows.rows[0];
    if (!channel) throw new NotFoundException({ code: "CHANNEL_NOT_FOUND", message: "Canal não encontrado." });
    let token: string;
    try {
      const credentials = JSON.parse(decryptPrivateValue(channel.credentials_ciphertext)) as { accessToken?: unknown };
      if (typeof credentials.accessToken !== "string" || !credentials.accessToken) throw new Error("missing token");
      token = credentials.accessToken;
    } catch {
      throw new BadRequestException({ code: "SOCIAL_RECONNECT_REQUIRED", message: "Liga novamente este canal Meta." });
    }

    const page = await this.meta.listConversationHistory(channel.channel_type, channel.external_account_id, token, cursor.conversationAfter);
    const crmChannel = channel.channel_type === "facebook_page" ? "facebook_messenger" : "instagram_dm";
    let conversations = 0;
    let messages = 0;
    for (const thread of page.conversations) {
      if (!thread.id) continue;
      if (cursor.threadId && cursor.threadId !== thread.id) throw new BadRequestException("A lista de conversas mudou. Reinicia a importação.");
      const historyPage = await this.meta.listConversationMessages(thread.id, token, cursor.messageAfter);
      const history = historyPage.messages;
      const next = historyPage.next
        ? this.writeCursor(workspaceId, channelId, cursor.conversationAfter, historyPage.next, thread.id)
        : page.next ? this.writeCursor(workspaceId, channelId, page.next) : null;
      const ownerIds = new Set([page.pageId, channel.external_account_id]);
      const customer = this.customer(thread, history, ownerIds);
      if (!customer) return { conversations, messages, next };
      const valid = history.flatMap((item) => {
        if (!item.id || !item.from?.id || !item.created_time) return [];
        const when = Date.parse(item.created_time);
        if (!Number.isFinite(when) || when < Date.UTC(2004, 0, 1) || when > Date.now() + 86_400_000) return [];
        const imageUrls = [...new Set((item.attachments?.data ?? [])
          .map((attachment) => publicMetaImageUrl(attachment.image_data?.url ?? attachment.image_data?.preview_url))
          .filter((url): url is string => Boolean(url)))].slice(0, 8);
        const text = item.message?.trim().slice(0, 4000) || (imageUrls.length ? "Fotografia recebida" : "");
        if (!text) return [];
        return [{ id: item.id, text, imageUrls, senderId: item.from.id, createdAt: new Date(when).toISOString() }];
      }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (!valid.length) return { conversations, messages, next };
      const inserted = await this.database.transaction(async (client) => {
        let identity = await client.query<{ contact_id: string }>(
          `SELECT contact_id FROM crm_contact_external_identities
           WHERE workspace_id = $1 AND channel = $2 AND external_user_id = $3 LIMIT 1`,
          [workspaceId, crmChannel, customer.id],
        );
        if (!identity.rows.length) {
          const name = customer.name?.slice(0, 100) || `${channel.channel_type === "instagram_direct" ? "Instagram" : "Facebook"} ${customer.id.slice(-4)}`;
          const contact = await client.query<{ id: string }>(
            `INSERT INTO crm_contacts (workspace_id, full_name, origin_channel, instagram_username)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [workspaceId, name, channel.channel_type === "instagram_direct" ? "instagram" : "facebook", channel.channel_type === "instagram_direct" ? name : null],
          );
          identity = await client.query<{ contact_id: string }>(
            `INSERT INTO crm_contact_external_identities (workspace_id, contact_id, channel, external_user_id, display_name)
             VALUES ($1, $2, $3, $4, $5) RETURNING contact_id`,
            [workspaceId, contact.rows[0].id, crmChannel, customer.id, customer.name?.slice(0, 100) || null],
          );
        }
        const latest = valid[valid.length - 1];
        const conversation = await client.query<{ id: string }>(
          `INSERT INTO crm_conversations (workspace_id, contact_id, channel, channel_connection_id, external_thread_id, last_message_preview, last_message_at, unread_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, 0)
           ON CONFLICT (workspace_id, contact_id, channel)
           DO UPDATE SET channel_connection_id = EXCLUDED.channel_connection_id, external_thread_id = EXCLUDED.external_thread_id,
             last_message_preview = CASE WHEN crm_conversations.last_message_at < EXCLUDED.last_message_at THEN EXCLUDED.last_message_preview ELSE crm_conversations.last_message_preview END,
             last_message_at = GREATEST(crm_conversations.last_message_at, EXCLUDED.last_message_at)
           RETURNING id`,
          [workspaceId, identity.rows[0].contact_id, crmChannel, channelId, customer.id, latest.text.slice(0, 100), latest.createdAt],
        );
        let count = 0;
        for (const item of valid) {
          // Messages sent from this CRM already carry the Meta ID, but did not
          // pass through the inbound webhook event ledger.
          const existing = await client.query(
            `SELECT 1 FROM crm_messages
             WHERE conversation_id = $1 AND metadata->>'meta_message_id' = $2 LIMIT 1`,
            [conversation.rows[0].id, item.id],
          );
          if (existing.rows.length) continue;
          const event = await client.query(
            `INSERT INTO crm_meta_webhook_events (event_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_key`,
            [`${crmChannel}:${item.id}`],
          );
          if (!event.rows.length) continue;
          await client.query(
            `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, media_url, status, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7::jsonb, $8::timestamptz)`,
            [conversation.rows[0].id, workspaceId, ownerIds.has(item.senderId) ? "outbound" : "inbound",
              item.imageUrls.length ? "image" : "text", item.text, item.imageUrls[0] ?? null,
              JSON.stringify({ meta_message_id: item.id, meta_thread_id: thread.id, imported: true, image_urls: item.imageUrls }), item.createdAt],
          );
          count++;
        }
        return count;
      });
      conversations++;
      messages += inserted;
      return { conversations, messages, next };
    }
    return { conversations, messages, next: page.next ? this.writeCursor(workspaceId, channelId, page.next) : null };
  }

  private writeCursor(workspaceId: string, channelId: string, conversationAfter?: string, messageAfter?: string, threadId?: string) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) throw new BadRequestException("Integração Meta indisponível.");
    const payload = Buffer.from(JSON.stringify({ workspaceId, channelId, conversationAfter, messageAfter, threadId, expiresAt: Date.now() + 3_600_000 })).toString("base64url");
    return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  }

  private readCursor(value: string | undefined, workspaceId: string, channelId: string): { conversationAfter?: string; messageAfter?: string; threadId?: string } {
    if (!value) return {};
    if (value.length > 4096 || !/^[A-Za-z0-9_\-.]+$/.test(value)) throw new BadRequestException("Cursor de importação inválido.");
    const [payload, signature, extra] = value.split(".");
    const secret = process.env.META_APP_SECRET;
    if (!secret || !payload || !signature || extra) throw new BadRequestException("Cursor de importação inválido.");
    const expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BadRequestException("Cursor de importação inválido.");
    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
      const validCursor = (cursor: unknown) => cursor === undefined || typeof cursor === "string" && cursor.length <= 2048 && /^[\x21-\x7E]+$/.test(cursor);
      if (decoded.workspaceId === workspaceId && decoded.channelId === channelId && typeof decoded.expiresAt === "number" && decoded.expiresAt > Date.now() &&
        validCursor(decoded.conversationAfter) && validCursor(decoded.messageAfter) &&
        (decoded.threadId === undefined || typeof decoded.threadId === "string" && /^[A-Za-z0-9_]{2,128}$/.test(decoded.threadId))) {
        return { conversationAfter: decoded.conversationAfter as string | undefined, messageAfter: decoded.messageAfter as string | undefined, threadId: decoded.threadId as string | undefined };
      }
    } catch { /* Invalid or expired cursor. */ }
    throw new BadRequestException("Cursor de importação inválido ou expirado. Reinicia a importação.");
  }

  private customer(thread: MetaHistoryConversation, history: MetaHistoryMessage[], ownerIds: Set<string>) {
    const participants = thread.participants?.data ?? [];
    const person = participants.find((candidate) => candidate.id && !ownerIds.has(candidate.id));
    if (person?.id) return { id: person.id, name: person.name };
    const sender = history.find((item) => item.from?.id && !ownerIds.has(item.from.id))?.from;
    return sender?.id ? { id: sender.id, name: sender.name } : null;
  }
}
