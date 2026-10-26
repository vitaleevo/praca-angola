import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AiClientService } from "../ai/ai-client.service";
import { decryptPrivateValue } from "../auth/auth.crypto";

/* ─── Types ─── */
export interface ChatSession {
  id: string;
  seller_profile_id: string;
  visitor_user_id: string | null;
  visitor_session_id: string | null;
  visitor_name: string | null;
  status: string;
  messages_count: number;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata: any;
  created_at: string;
}

@Injectable()
export class StorefrontChatService {
  private readonly logger = new Logger(StorefrontChatService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly aiClient: AiClientService,
  ) {}

  issueAccessToken(sessionId: string, visitorSessionId: string): string {
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    const payload = `${sessionId}:${visitorSessionId}:${expires}`;
    const signature = createHmac("sha256", this.chatSecret()).update(payload).digest("base64url");
    return `${visitorSessionId}.${expires}.${signature}`;
  }

  verifyAccessToken(sessionId: string, token?: string): void {
    if (!token) throw new ForbiddenException({ code: "CHAT_ACCESS_DENIED", message: "Acesso à conversa expirado ou inválido." });
    const [visitorSessionId, expiresText, signature] = token.split(".");
    const expires = Number(expiresText);
    if (!visitorSessionId || !Number.isSafeInteger(expires) || expires < Date.now() || !signature) {
      throw new ForbiddenException({ code: "CHAT_ACCESS_DENIED", message: "Acesso à conversa expirado ou inválido." });
    }
    const expected = createHmac("sha256", this.chatSecret())
      .update(`${sessionId}:${visitorSessionId}:${expires}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ForbiddenException({ code: "CHAT_ACCESS_DENIED", message: "Acesso à conversa expirado ou inválido." });
    }
  }

  private chatSecret(): string {
    const secret = process.env.APP_ENCRYPTION_KEY;
    if (!secret) throw new Error("APP_ENCRYPTION_KEY is required for storefront chat");
    return secret;
  }

  /**
   * Open or resume a chat session for a store visitor
   */
  async getOrCreateSession(
    sellerProfileId: string,
    visitorSessionId: string,
    visitorName?: string,
  ): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
    const sessionRes = await this.database.query<ChatSession>(
      `SELECT * FROM storefront_chat_sessions
       WHERE seller_profile_id = $1 AND visitor_session_id = $2 AND status = 'active'
       ORDER BY last_message_at DESC LIMIT 1`,
      [sellerProfileId, visitorSessionId],
    );

    let session: ChatSession;

    if (!sessionRes.rows.length) {
      // Create new session
      const insertRes = await this.database.query<ChatSession>(
        `INSERT INTO storefront_chat_sessions (seller_profile_id, visitor_user_id, visitor_session_id, visitor_name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [sellerProfileId, null, visitorSessionId, visitorName || null],
      );
      session = insertRes.rows[0];
    } else {
      session = sessionRes.rows[0];
    }

    // Fetch messages
    const msgsRes = await this.database.query<ChatMessage>(
      `SELECT * FROM storefront_chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [session.id],
    );

    return { session, messages: msgsRes.rows };
  }

  /**
   * Process a visitor message and generate AI reply
   */
  async sendVisitorMessage(
    sessionId: string,
    sellerProfileId: string,
    visitorMessage: string,
  ): Promise<{
    visitorMsg: ChatMessage;
    aiReply: ChatMessage;
    suggestedProducts: any[];
    shouldConvertToLead: boolean;
    conversionReason: string;
    guardrailTripped?: boolean;
    guardrailAction?: string;
  }> {
    const session = await this.database.query(
      `SELECT 1 FROM storefront_chat_sessions
       WHERE id = $1 AND seller_profile_id = $2 AND status IN ('active', 'converted_to_lead')`,
      [sessionId, sellerProfileId],
    );
    if (!session.rowCount) throw new NotFoundException({ code: "CHAT_SESSION_NOT_FOUND", message: "Conversa não encontrada." });
    // 1. Save visitor message
    const visitorMsgRes = await this.database.query<ChatMessage>(
      `INSERT INTO storefront_chat_messages (session_id, role, content)
       VALUES ($1, 'visitor', $2) RETURNING *`,
      [sessionId, visitorMessage.trim()],
    );
    const visitorMsg = visitorMsgRes.rows[0];

    // 2. Update session stats
    await this.database.query(
      `UPDATE storefront_chat_sessions
       SET messages_count = messages_count + 1, last_message_at = now()
       WHERE id = $1`,
      [sessionId],
    );

    // 3. Get conversation history
    const historyRes = await this.database.query<{ role: string; content: string }>(
      `SELECT role, content FROM storefront_chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );

    // 4. Get store context
    const storeCtx = await this.getStoreContext(sellerProfileId);

    // 5. Get AI config for this store
    const aiConfig = await this.getStoreAiConfigForChatbot(sellerProfileId);

    // 6. Call AI worker for reply
    let aiReplyText = "";
    let suggestedProducts: any[] = [];
    let shouldConvertToLead = false;
    let conversionReason = "";
    let guardrailTripped = false;
    let guardrailAction = "allow";
    let guardrailViolations: any[] = [];

    try {
      const aiResponse = await this.aiClient.request<{
        ai_reply: string;
        suggested_products: any[];
        should_convert_to_lead: boolean;
        conversion_reason: string;
        provider_used: string;
        guardrail_tripped?: boolean;
        guardrail_action?: string;
        guardrail_violations?: any[];
      }>("/v1/storefront-chat/reply", {
        method: "POST",
        body: JSON.stringify({
          visitor_message: visitorMessage,
          conversation_history: historyRes.rows.map((m) => ({
            role: m.role === "ai" ? "ai" : "visitor",
            content: m.content,
          })),
          store_name: storeCtx.storeName,
          store_description: storeCtx.storeDescription,
          store_categories: storeCtx.categories,
          catalog_summary: storeCtx.catalogSummary,
          knowledge_context: storeCtx.knowledgeText,
          ai_config: aiConfig,
          visitor_province: "Luanda",
        }),
      });

      if (aiResponse) {
        aiReplyText = aiResponse.ai_reply;
        suggestedProducts = aiResponse.suggested_products || [];
        shouldConvertToLead = aiResponse.should_convert_to_lead;
        conversionReason = aiResponse.conversion_reason || "";
        guardrailTripped = Boolean(aiResponse.guardrail_tripped);
        guardrailAction = aiResponse.guardrail_action || "allow";
        guardrailViolations = aiResponse.guardrail_violations || [];
      } else {
        aiReplyText = `Olá! 👋 Obrigado pelo interesse na ${storeCtx.storeName}. A nossa equipa vai responder-te em breve!`;
      }
    } catch (err) {
      this.logger.warn(`Storefront chat AI error: ${err instanceof Error ? err.message : "unknown"}`);
      aiReplyText = `Olá! 👋 Obrigado pelo interesse na ${storeCtx.storeName}. A nossa equipa vai responder-te em breve!`;
    }

    // 7. Save AI reply with guardrail metadata
    const aiMsgRes = await this.database.query<ChatMessage>(
      `INSERT INTO storefront_chat_messages (session_id, role, content, metadata)
       VALUES ($1, 'ai', $2, $3) RETURNING *`,
      [
        sessionId,
        aiReplyText,
        JSON.stringify({
          suggestedProducts,
          shouldConvertToLead,
          guardrailTripped,
          guardrailAction,
          guardrailViolations,
        }),
      ],
    );
    const aiReply = aiMsgRes.rows[0];

    // 8. Update session again
    await this.database.query(
      `UPDATE storefront_chat_sessions SET messages_count = messages_count + 1, last_message_at = now() WHERE id = $1`,
      [sessionId],
    );

    // 9. Auto-convert to CRM lead if detected
    if (shouldConvertToLead) {
      await this.maybeConvertToLead(sessionId, sellerProfileId, conversionReason);
    }

    return {
      visitorMsg,
      aiReply,
      suggestedProducts,
      shouldConvertToLead,
      conversionReason,
      guardrailTripped,
      guardrailAction,
    };
  }

  /* ──── Store Context ──── */
  private async getStoreContext(sellerProfileId: string): Promise<{
    storeName: string;
    storeDescription: string;
    categories: string[];
    catalogSummary: any[];
    knowledgeText: string;
  }> {
    // Store info
    const storeRes = await this.database.query<{ display_name: string; description: string | null }>(
      `SELECT display_name, description FROM seller_profiles WHERE id = $1`,
      [sellerProfileId],
    );
    const store = storeRes.rows[0];

    // Top catalog items
    const catalogRes = await this.database.query<{ title: string; price: string; slug: string }>(
      `SELECT title, price::text, slug FROM listings
       WHERE seller_profile_id = $1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 15`,
      [sellerProfileId],
    );

    // Categories
    const catRes = await this.database.query<{ slug: string }>(
      `SELECT DISTINCT c.slug FROM categories c
       JOIN listings l ON l.category_id = c.id
       WHERE l.seller_profile_id = $1 AND l.status = 'published' LIMIT 10`,
      [sellerProfileId],
    );

    // Knowledge base (if store has CRM workspace)
    let knowledgeText = "";
    const wsRes = await this.database.query<{ id: string }>(
      `SELECT id FROM crm_workspaces WHERE seller_profile_id = $1 LIMIT 1`,
      [sellerProfileId],
    );
    if (wsRes.rows.length) {
      const kbRes = await this.database.query<{ title: string; category: string; content: string }>(
        `SELECT title, category, content FROM store_ai_knowledge WHERE workspace_id = $1 AND is_active = true`,
        [wsRes.rows[0].id],
      );
      knowledgeText = kbRes.rows.map((d) => `[${d.category.toUpperCase()}: ${d.title}]\n${d.content}`).join("\n\n");
    }

    return {
      storeName: store?.display_name || "Loja PUVO",
      storeDescription: store?.description || "",
      categories: catRes.rows.map((c) => c.slug),
      catalogSummary: catalogRes.rows.map((l) => ({
        title: l.title,
        price: l.price,
        slug: l.slug,
      })),
      knowledgeText,
    };
  }

  private async getStoreAiConfigForChatbot(sellerProfileId: string): Promise<Record<string, any>> {
    const wsRes = await this.database.query<{ id: string }>(
      `SELECT id FROM crm_workspaces WHERE seller_profile_id = $1 LIMIT 1`,
      [sellerProfileId],
    );
    if (!wsRes.rows.length) return {};

    const cfgRes = await this.database.query<{
      provider: string; model_name: string; api_key_ciphertext: string | null;
      custom_endpoint_url: string | null; system_instructions: string; temperature: number;
    }>(
      `SELECT provider, model_name, api_key_ciphertext, custom_endpoint_url, system_instructions, temperature::float AS temperature
       FROM store_ai_configs WHERE workspace_id = $1`,
      [wsRes.rows[0].id],
    );

    const cfg = cfgRes.rows[0];
    if (!cfg) return {};

    let apiKey: string | undefined;
    if (cfg.api_key_ciphertext) {
      try { apiKey = decryptPrivateValue(cfg.api_key_ciphertext); } catch {}
    }

    return {
      provider: cfg.provider,
      model_name: cfg.model_name,
      api_key: apiKey,
      custom_endpoint_url: cfg.custom_endpoint_url,
      system_instructions: cfg.system_instructions,
      temperature: cfg.temperature,
    };
  }

  private async maybeConvertToLead(sessionId: string, sellerProfileId: string, reason: string): Promise<void> {
    try {
      // Check if already converted
      const session = await this.database.query<{ converted_contact_id: string | null; visitor_name: string | null }>(
        `SELECT converted_contact_id, visitor_name FROM storefront_chat_sessions WHERE id = $1`,
        [sessionId],
      );

      if (session.rows[0]?.converted_contact_id) return;

      // Get workspace
      const wsRes = await this.database.query<{ id: string }>(
        `SELECT id FROM crm_workspaces WHERE seller_profile_id = $1 LIMIT 1`,
        [sellerProfileId],
      );
      if (!wsRes.rows.length) return;
      const workspaceId = wsRes.rows[0].id;

      // Create CRM contact
      const contactRes = await this.database.query<{ id: string }>(
        `INSERT INTO crm_contacts (workspace_id, full_name, origin_channel, notes)
         VALUES ($1, $2, 'puvo_storefront', $3)
         RETURNING id`,
        [workspaceId, session.rows[0]?.visitor_name || "Visitante da Loja", `Lead convertido automaticamente via chatbot. Razão: ${reason}`],
      );

      const contactId = contactRes.rows[0].id;

      // Create deal
      const firstStage = await this.database.query<{ id: string }>(
        `SELECT s.id FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id
         WHERE p.workspace_id = $1 AND p.is_default = true ORDER BY s.sort_order ASC LIMIT 1`,
        [workspaceId],
      );

      if (firstStage.rows.length) {
        await this.database.query(
          `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa)
           VALUES ($1, $2, $3, 'Lead via Chatbot da Loja', 0.00)`,
          [workspaceId, contactId, firstStage.rows[0].id],
        );
      }

      // Mark session as converted
      await this.database.query(
        `UPDATE storefront_chat_sessions SET converted_contact_id = $2, status = 'converted_to_lead' WHERE id = $1`,
        [sessionId, contactId],
      );

      this.logger.log(`Storefront chat session ${sessionId} converted to CRM lead ${contactId}`);
    } catch (err) {
      this.logger.warn(`Failed to convert chat to lead: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  /**
   * Get chat sessions for a seller (admin view)
   */
  async getSessionsForSeller(sellerProfileId: string): Promise<ChatSession[]> {
    const res = await this.database.query<ChatSession>(
      `SELECT * FROM storefront_chat_sessions
       WHERE seller_profile_id = $1
       ORDER BY last_message_at DESC LIMIT 50`,
      [sellerProfileId],
    );
    return res.rows;
  }
}
