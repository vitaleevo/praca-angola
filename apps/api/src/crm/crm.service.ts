import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AiClientService } from "../ai/ai-client.service";
import { CrmAutomationsService } from "./crm-automations.service";
import {
  CrmConversation,
  CrmDeal,
  CrmMessage,
  CrmPipelineStage,
  CrmWorkspace,
  CreateContactDto,
  SendMessageDto,
  StoreAiConfig,
  StoreAiKnowledge,
  SaveStoreAiConfigDto,
  CreateKnowledgeDto,
} from "./crm.types";
import { decryptPrivateValue, encryptPrivateValue } from "../auth/auth.crypto";
import { MetaGraphService } from "./meta-graph.service";

const DEFAULT_STAGES = [
  { name: "Novo Lead", slug: "new", color: "#3b82f6", sort_order: 1 },
  { name: "Em Contacto", slug: "contacted", color: "#eab308", sort_order: 2 },
  { name: "Orçamento", slug: "proposal", color: "#8b5cf6", sort_order: 3 },
  { name: "Aguarda Pagamento", slug: "awaiting_payment", color: "#f97316", sort_order: 4 },
  { name: "Vendido / Ganho", slug: "won", color: "#22c55e", sort_order: 5 },
  { name: "Perdido", slug: "lost", color: "#ef4444", sort_order: 6 },
];

@Injectable()
export class CrmService {
  constructor(
    private readonly database: DatabaseService,
    private readonly aiClient: AiClientService,
    @Inject(forwardRef(() => CrmAutomationsService))
    private readonly automations: CrmAutomationsService,
    private readonly metaGraph: MetaGraphService,
  ) {}

  async resolveWorkspaceForUser(userId: string): Promise<CrmWorkspace> {
    // 1. Check if user is associated with a seller profile
    const sellerResult = await this.database.query<{ id: string; display_name: string }>(
      `SELECT sp.id, sp.display_name
       FROM seller_profiles sp
       LEFT JOIN store_memberships sm ON sm.seller_profile_id = sp.id
       WHERE sp.owner_user_id = $1 OR sm.user_id = $1
       ORDER BY sp.created_at ASC LIMIT 1`,
      [userId],
    );

    const seller = sellerResult.rows[0];
    if (!seller) {
      throw new BadRequestException({
        code: "NO_COMMERCIAL_PROFILE",
        message: "Precisas de ter uma loja ou perfil comercial ativo para aceder ao CRM.",
      });
    }

    // 2. Find existing workspace or create one
    const workspaceResult = await this.database.query<CrmWorkspace>(
      `SELECT id, owner_user_id, seller_profile_id, professional_profile_id, name, settings, created_at
       FROM crm_workspaces
       WHERE seller_profile_id = $1 LIMIT 1`,
      [seller.id],
    );

    if (!workspaceResult.rows.length) {
      // Create workspace and seed default pipeline + stages
      const newWorkspace = await this.database.transaction(async (client) => {
        const ws = await client.query<CrmWorkspace>(
          `INSERT INTO crm_workspaces (owner_user_id, seller_profile_id, name)
           VALUES ($1, $2, $3)
           RETURNING id, owner_user_id, seller_profile_id, professional_profile_id, name, settings, created_at`,
          [userId, seller.id, `CRM · ${seller.display_name}`],
        );

        const pipeline = await client.query<{ id: string }>(
          `INSERT INTO crm_pipelines (workspace_id, name, is_default)
           VALUES ($1, 'Funil Principal de Vendas', true)
           RETURNING id`,
          [ws.rows[0].id],
        );

        for (const stage of DEFAULT_STAGES) {
          await client.query(
            `INSERT INTO crm_pipeline_stages (pipeline_id, name, slug, color, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [pipeline.rows[0].id, stage.name, stage.slug, stage.color, stage.sort_order],
          );
        }

        return ws.rows[0];
      });

      return newWorkspace;
    }

    return workspaceResult.rows[0];
  }

  async getPipeline(workspaceId: string) {
    const pipelineResult = await this.database.query<{ id: string; name: string }>(
      `SELECT id, name FROM crm_pipelines WHERE workspace_id = $1 AND is_default = true LIMIT 1`,
      [workspaceId],
    );

    if (!pipelineResult.rows.length) {
      throw new NotFoundException({ code: "PIPELINE_NOT_FOUND", message: "Funil de vendas não encontrado." });
    }

    const pipelineId = pipelineResult.rows[0].id;

    const stagesResult = await this.database.query<CrmPipelineStage>(
      `SELECT id, pipeline_id, name, slug, color, sort_order
       FROM crm_pipeline_stages
       WHERE pipeline_id = $1
       ORDER BY sort_order ASC`,
      [pipelineId],
    );

    const dealsResult = await this.database.query<CrmDeal>(
      `SELECT d.id, d.workspace_id, d.contact_id, c.full_name AS contact_name, c.phone AS contact_phone,
              d.stage_id, d.title, d.value_aoa::float AS value_aoa, d.status, c.origin_channel, d.created_at
       FROM crm_deals d
       JOIN crm_contacts c ON c.id = d.contact_id
       WHERE d.workspace_id = $1
       ORDER BY d.created_at DESC`,
      [workspaceId],
    );

    const stagesWithDeals = stagesResult.rows.map((stage) => {
      const stageDeals = dealsResult.rows.filter((deal) => deal.stage_id === stage.id);
      const totalValue = stageDeals.reduce((acc, d) => acc + (d.value_aoa || 0), 0);
      return {
        ...stage,
        deals: stageDeals,
        count: stageDeals.length,
        totalValueAoa: totalValue,
      };
    });

    const totalDeals = dealsResult.rows.length;
    const totalPipelineValue = dealsResult.rows.reduce((acc, d) => acc + (d.value_aoa || 0), 0);
    const wonDeals = dealsResult.rows.filter((d) => d.status === "won");

    return {
      pipeline: pipelineResult.rows[0],
      stages: stagesWithDeals,
      summary: {
        totalDeals,
        totalPipelineValueAoa: totalPipelineValue,
        wonDealsCount: wonDeals.length,
        conversionRatePercent: totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0,
      },
    };
  }

  async moveDealStage(workspaceId: string, dealId: string, newStageId: string): Promise<{ success: boolean }> {
    const stageCheck = await this.database.query<{ id: string; slug: string }>(
      `SELECT s.id, s.slug
       FROM crm_pipeline_stages s
       JOIN crm_pipelines p ON p.id = s.pipeline_id
       WHERE s.id = $1 AND p.workspace_id = $2`,
      [newStageId, workspaceId],
    );

    if (!stageCheck.rows.length) {
      throw new BadRequestException({ code: "INVALID_STAGE", message: "Etapa de destino inválida." });
    }

    const stage = stageCheck.rows[0];
    let newStatus = "open";
    if (stage.slug === "won") newStatus = "won";
    else if (stage.slug === "lost") newStatus = "lost";

    const updateResult = await this.database.query(
      `UPDATE crm_deals
       SET stage_id = $1, status = $2, updated_at = now()
       WHERE id = $3 AND workspace_id = $4`,
      [newStageId, newStatus, dealId, workspaceId],
    );

    if (!updateResult.rowCount) {
      throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Oportunidade não encontrada." });
    }

    // Fire automation trigger
    this.automations.fireTrigger({
      workspaceId,
      event: "deal_stage_changed",
      dealId,
      stageId: newStageId,
    }).catch(() => {});

    return { success: true };
  }

  async getContacts(workspaceId: string, search?: string) {
    let query = `
      SELECT c.id, c.full_name, c.phone, c.email, c.origin_channel, c.province, c.municipality,
             c.tags, c.notes, c.created_at, c.updated_at,
             (SELECT count(*)::int FROM crm_deals d WHERE d.contact_id = c.id) AS deals_count,
             (SELECT COALESCE(sum(d.value_aoa), 0)::float FROM crm_deals d WHERE d.contact_id = c.id) AS total_value_aoa
      FROM crm_contacts c
      WHERE c.workspace_id = $1
    `;
    const params: (string | number)[] = [workspaceId];

    if (search?.trim()) {
      query += ` AND (c.full_name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2)`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY c.updated_at DESC LIMIT 100`;

    const result = await this.database.query(query, params);
    return { contacts: result.rows };
  }

  async createContact(workspaceId: string, dto: CreateContactDto) {
    const result = await this.database.transaction(async (client) => {
      const contactResult = await client.query<{ id: string; full_name: string }>(
        `INSERT INTO crm_contacts (workspace_id, full_name, phone, email, origin_channel, province, municipality, notes, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, full_name`,
        [
          workspaceId,
          dto.fullName.trim(),
          dto.phone?.trim() || null,
          dto.email?.trim() || null,
          dto.originChannel,
          dto.province || "Luanda",
          dto.municipality || "Luanda",
          dto.notes || null,
          dto.tags || [],
        ],
      );

      const contact = contactResult.rows[0];

      // Create initial conversation channel
      const channel = dto.originChannel === "whatsapp" ? "whatsapp" : dto.originChannel === "instagram" ? "instagram_dm" : "puvo_chat";
      await client.query(
        `INSERT INTO crm_conversations (workspace_id, contact_id, channel, last_message_preview, last_message_at)
         VALUES ($1, $2, $3, 'Contacto criado no CRM', now())
         ON CONFLICT (workspace_id, contact_id, channel) DO NOTHING`,
        [workspaceId, contact.id, channel],
      );

      // Create initial deal if requested
      if (dto.initialDealTitle) {
        const firstStage = await client.query<{ id: string }>(
          `SELECT s.id
           FROM crm_pipeline_stages s
           JOIN crm_pipelines p ON p.id = s.pipeline_id
           WHERE p.workspace_id = $1 AND p.is_default = true
           ORDER BY s.sort_order ASC LIMIT 1`,
          [workspaceId],
        );

        if (firstStage.rows.length) {
          await client.query(
            `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa)
             VALUES ($1, $2, $3, $4, $5)`,
            [workspaceId, contact.id, firstStage.rows[0].id, dto.initialDealTitle, dto.initialDealValueAoa || 0],
          );
        }
      }

      // Fire automation trigger for new lead
      this.automations.fireTrigger({
        workspaceId,
        event: "new_lead",
        contactId: contact.id,
        channel: dto.originChannel,
      }).catch(() => {});

      return contact;
    });
    return result;
  }

  async getConversations(workspaceId: string) {
    const result = await this.database.query<CrmConversation>(
      `SELECT cv.id, cv.workspace_id, cv.contact_id, c.full_name AS contact_name, c.phone AS contact_phone,
              cv.channel, cv.last_message_preview, cv.last_message_at, cv.unread_count
       FROM crm_conversations cv
       JOIN crm_contacts c ON c.id = cv.contact_id
       WHERE cv.workspace_id = $1
       ORDER BY cv.last_message_at DESC LIMIT 50`,
      [workspaceId],
    );

    return { conversations: result.rows };
  }

  async getMessages(workspaceId: string, conversationId: string) {
    const convoCheck = await this.database.query<{ id: string; contact_id: string; channel: string }>(
      `SELECT id, contact_id, channel FROM crm_conversations WHERE id = $1 AND workspace_id = $2`,
      [conversationId, workspaceId],
    );

    if (!convoCheck.rows.length) {
      throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversa não encontrada." });
    }

    // Mark as read
    await this.database.query(
      `UPDATE crm_conversations SET unread_count = 0 WHERE id = $1`,
      [conversationId],
    );

    const messages = await this.database.query<CrmMessage>(
      `SELECT id, conversation_id, workspace_id, direction, message_type, content, media_url, metadata, status, sent_by_user_id, sent_by_ai, created_at
       FROM crm_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC LIMIT 200`,
      [conversationId],
    );

    return { messages: messages.rows };
  }

  async sendMessage(workspaceId: string, conversationId: string, senderUserId: string, dto: SendMessageDto) {
    const conversation = await this.database.query<{
      channel: "whatsapp" | "instagram_dm" | "facebook_messenger" | "puvo_chat";
      external_thread_id: string | null;
      channel_connection_id: string | null;
    }>(
      `SELECT channel, external_thread_id, channel_connection_id
       FROM crm_conversations WHERE id = $1 AND workspace_id = $2`,
      [conversationId, workspaceId],
    );
    const target = conversation.rows[0];
    if (!target) throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversa não encontrada." });

    let providerMessageId: string | undefined;
    const externalChannel = target.channel === "whatsapp" ? "whatsapp_cloud"
      : target.channel === "instagram_dm" ? "instagram_direct"
      : target.channel === "facebook_messenger" ? "facebook_page" : null;

    if (externalChannel) {
      if (!target.channel_connection_id || !target.external_thread_id) {
        throw new BadRequestException({ code: "CHANNEL_NOT_CONNECTED", message: "Esta conversa não tem uma ligação Meta ativa." });
      }
      if (dto.mediaUrl || !["text", "catalog_product", "payment_request"].includes(dto.messageType || "text")) {
        throw new BadRequestException({ code: "UNSUPPORTED_MESSAGE_TYPE", message: "Este canal aceita respostas de texto nesta versão." });
      }
      const connection = await this.database.query<{ external_account_id: string; credentials_ciphertext: string; status: string }>(
        `SELECT external_account_id, credentials_ciphertext, status
         FROM crm_channel_connections WHERE id = $1 AND workspace_id = $2 AND channel_type = $3`,
        [target.channel_connection_id, workspaceId, externalChannel],
      );
      const linked = connection.rows[0];
      if (!linked || linked.status !== "connected") {
        throw new BadRequestException({ code: "CHANNEL_NOT_CONNECTED", message: "A ligação deste canal expirou ou foi removida." });
      }
      let accessToken: string;
      try {
        const credentials = decryptPrivateValue(linked.credentials_ciphertext);
        accessToken = JSON.parse(credentials).accessToken || credentials;
      } catch {
        throw new BadRequestException({ code: "CHANNEL_CREDENTIALS_INVALID", message: "As credenciais guardadas deste canal são inválidas. Liga a conta novamente." });
      }
      try {
        providerMessageId = await this.metaGraph.sendText(externalChannel, linked.external_account_id, target.external_thread_id, accessToken, dto.content.trim());
      } catch (error) {
        await this.persistOutgoingMessage(workspaceId, conversationId, senderUserId, dto, "failed");
        throw error;
      }
    }
    return this.persistOutgoingMessage(workspaceId, conversationId, senderUserId, dto, "sent", providerMessageId);
  }

  private async persistOutgoingMessage(
    workspaceId: string,
    conversationId: string,
    senderUserId: string,
    dto: SendMessageDto,
    status: "sent" | "failed",
    providerMessageId?: string,
  ) {
    return this.database.transaction(async (client) => {
      const msg = await client.query<CrmMessage>(
        `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, media_url, metadata, status, sent_by_user_id)
         VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8)
         RETURNING id, conversation_id, workspace_id, direction, message_type, content, media_url, metadata, status, sent_by_user_id, sent_by_ai, created_at`,
        [
          conversationId,
          workspaceId,
          dto.messageType || "text",
          dto.content.trim(),
          dto.mediaUrl || null,
          JSON.stringify({ ...(dto.metadata || {}), ...(providerMessageId ? { meta_message_id: providerMessageId } : {}) }),
          status,
          senderUserId,
        ],
      );

      await client.query(
        `UPDATE crm_conversations
         SET last_message_preview = $2, last_message_at = now()
         WHERE id = $1`,
        [conversationId, dto.content.trim().slice(0, 100)],
      );

      return msg.rows[0];
    });
  }

  async sendProductCard(workspaceId: string, conversationId: string, senderUserId: string, listingId: string) {
    const listingResult = await this.database.query<{ id: string; title: string; price: string; slug: string }>(
      `SELECT l.id, l.title, l.price::text, l.slug
       FROM listings l
       JOIN crm_workspaces w ON w.seller_profile_id = l.seller_profile_id
       WHERE l.id = $1 AND w.id = $2`,
      [listingId, workspaceId],
    );

    if (!listingResult.rows.length) {
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado no teu catálogo." });
    }

    const product = listingResult.rows[0];
    const cardContent = `🛍️ *${product.title}*\nPreço: ${Number(product.price).toLocaleString("pt-AO")} Kz\nLink: https://puvo.ao/produtos/${product.slug}`;

    return this.sendMessage(workspaceId, conversationId, senderUserId, {
      content: cardContent,
      messageType: "catalog_product",
      metadata: { listingId: product.id, title: product.title, price: product.price, slug: product.slug },
    });
  }

  async sendPaymentDetails(workspaceId: string, conversationId: string, senderUserId: string) {
    const wsResult = await this.database.query<{ seller_profile_id: string }>(
      `SELECT seller_profile_id FROM crm_workspaces WHERE id = $1`,
      [workspaceId],
    );

    if (!wsResult.rows[0]?.seller_profile_id) {
      throw new BadRequestException({ code: "NO_PAYMENT_CONFIG", message: "Dados de pagamento não configurados." });
    }

    const sellerId = wsResult.rows[0].seller_profile_id;
    const destResult = await this.database.query<{
      method: string;
      recipient_name_ciphertext: string;
      recipient_identifier_ciphertext: string;
      provider_name_ciphertext: string | null;
    }>(
      `SELECT method, recipient_name_ciphertext, recipient_identifier_ciphertext, provider_name_ciphertext
       FROM seller_payment_destinations
       WHERE seller_profile_id = $1 AND enabled = true`,
      [sellerId],
    );

    if (!destResult.rows.length) {
      throw new BadRequestException({ code: "NO_PAYMENT_METHODS", message: "Não tens métodos de pagamento ativos configurados na loja." });
    }

    let paymentText = `💳 *Dados Oficiais de Pagamento PUVO:*\n\n`;
    for (const dest of destResult.rows) {
      try {
        const name = decryptPrivateValue(dest.recipient_name_ciphertext);
        const ident = decryptPrivateValue(dest.recipient_identifier_ciphertext);
        if (dest.method === "manual_multicaixa_express_transfer") {
          paymentText += `📲 *Multicaixa Express*\nTitular: ${name}\nTelemóvel: ${ident}\n\n`;
        } else if (dest.method === "manual_bank_transfer") {
          paymentText += `🏛️ *Transferência Bancária (IBAN)*\nTitular: ${name}\nIBAN: ${ident}\n\n`;
        }
      } catch {
        // ignore decryption issue
      }
    }
    paymentText += `Após a transferência, envia o comprovativo aqui para confirmação rápida!`;

    return this.sendMessage(workspaceId, conversationId, senderUserId, {
      content: paymentText,
      messageType: "payment_request",
    });
  }

  async getChannels(workspaceId: string) {
    const channels = await this.database.query<{
      id: string;
      channel_type: string;
      account_name: string;
      status: string;
      last_sync_at: string | null;
      created_at: string;
    }>(
      `SELECT id, channel_type, account_name, status, last_sync_at, created_at
       FROM crm_channel_connections
       WHERE workspace_id = $1`,
      [workspaceId],
    );

    return { channels: channels.rows };
  }

  async connectChannel(
    workspaceId: string,
    channelType: "facebook_page" | "instagram_direct" | "whatsapp_cloud" | "whatsapp_instance",
    accountName: string,
    externalAccountId: string,
    credentials: string,
  ) {
    const encrypted = encryptPrivateValue(credentials);
    const result = await this.database.query(
      `INSERT INTO crm_channel_connections (workspace_id, channel_type, account_name, external_account_id, credentials_ciphertext, status, last_sync_at)
       VALUES ($1, $2, $3, $4, $5, 'connected', now())
       ON CONFLICT (workspace_id, channel_type, external_account_id)
       DO UPDATE SET credentials_ciphertext = $5, status = 'connected', last_sync_at = now(), updated_at = now()
       RETURNING id, channel_type, account_name, status`,
      [workspaceId, channelType, accountName, externalAccountId, encrypted],
    );

    return result.rows[0];
  }

  async startMetaConnection(userId: string, workspaceId: string) {
    const state = randomBytes(32).toString("base64url");
    const stateHash = createHash("sha256").update(state).digest("hex");
    await this.database.query(
      `INSERT INTO crm_meta_oauth_attempts (workspace_id, user_id, state_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '10 minutes')`,
      [workspaceId, userId, stateHash],
    );
    return { authorizationUrl: this.metaGraph.createAuthorizationUrl(state) };
  }

  async finishMetaAuthorization(state: string, code: string): Promise<{ attemptId: string; userId: string }> {
    const stateHash = createHash("sha256").update(state).digest("hex");
    const attempt = await this.database.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM crm_meta_oauth_attempts
       WHERE state_hash = $1 AND expires_at > now() AND authorized_at IS NULL AND completed_at IS NULL
       LIMIT 1`,
      [stateHash],
    );
    if (!attempt.rows.length) throw new UnauthorizedException({ code: "META_OAUTH_STATE_INVALID", message: "A ligação Meta expirou. Inicia novamente no CRM." });
    const pages = await this.metaGraph.exchangeCodeForPages(code);
    await this.database.query(
      `UPDATE crm_meta_oauth_attempts
       SET accounts_ciphertext = $2, authorized_at = now(), expires_at = now() + interval '10 minutes'
       WHERE id = $1`,
      [attempt.rows[0].id, encryptPrivateValue(JSON.stringify(pages))],
    );
    return { attemptId: attempt.rows[0].id, userId: attempt.rows[0].user_id };
  }

  async getMetaConnectionPreview(userId: string, workspaceId: string, attemptId: string) {
    const attempt = await this.loadMetaAttempt(userId, workspaceId, attemptId);
    const pages = this.decryptMetaPages(attempt.accounts_ciphertext);
    return {
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        instagram: page.instagram ? { id: page.instagram.id, name: page.instagram.name, username: page.instagram.username } : null,
      })),
    };
  }

  async completeMetaConnections(userId: string, workspaceId: string, attemptId: string, pageIds: string[]) {
    const attempt = await this.loadMetaAttempt(userId, workspaceId, attemptId);
    const selected = this.decryptMetaPages(attempt.accounts_ciphertext).filter((page) => pageIds.includes(page.id));
    if (!selected.length) throw new BadRequestException({ code: "META_PAGE_REQUIRED", message: "Seleciona pelo menos uma Página Facebook." });
    if (selected.length !== new Set(pageIds).size) throw new BadRequestException({ code: "META_PAGE_INVALID", message: "Uma Página selecionada não pertence a esta autorização." });

    const connected = await this.database.transaction(async (client) => {
      const result: Array<{ channelType: string; accountName: string }> = [];
      for (const page of selected) {
        await this.metaGraph.subscribeAccount("facebook_page", page.id, page.pageAccessToken);
        const credentials = encryptPrivateValue(JSON.stringify({ accessToken: page.pageAccessToken }));
        await client.query(
          `INSERT INTO crm_channel_connections (workspace_id, channel_type, account_name, external_account_id, credentials_ciphertext, status, last_sync_at)
           VALUES ($1, 'facebook_page', $2, $3, $4, 'connected', now())
           ON CONFLICT (workspace_id, channel_type, external_account_id)
           DO UPDATE SET account_name = EXCLUDED.account_name, credentials_ciphertext = EXCLUDED.credentials_ciphertext,
                         status = 'connected', last_sync_at = now(), updated_at = now()`,
          [workspaceId, page.name, page.id, credentials],
        );
        result.push({ channelType: "facebook_page", accountName: page.name });
        if (page.instagram) {
          await this.metaGraph.subscribeAccount("instagram_direct", page.instagram.id, page.pageAccessToken);
          await client.query(
            `INSERT INTO crm_channel_connections (workspace_id, channel_type, account_name, external_account_id, credentials_ciphertext, status, last_sync_at)
             VALUES ($1, 'instagram_direct', $2, $3, $4, 'connected', now())
             ON CONFLICT (workspace_id, channel_type, external_account_id)
             DO UPDATE SET account_name = EXCLUDED.account_name, credentials_ciphertext = EXCLUDED.credentials_ciphertext,
                           status = 'connected', last_sync_at = now(), updated_at = now()`,
            [workspaceId, page.instagram.name, page.instagram.id, credentials],
          );
          result.push({ channelType: "instagram_direct", accountName: page.instagram.name });
        }
      }
      await client.query(`UPDATE crm_meta_oauth_attempts SET completed_at = now(), accounts_ciphertext = NULL WHERE id = $1`, [attemptId]);
      return result;
    });
    return { channels: connected };
  }

  async connectWhatsAppCloud(workspaceId: string, accountName: string, phoneNumberId: string, accessToken: string) {
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(phoneNumberId) || accessToken.length < 20 || accessToken.length > 4096) {
      throw new BadRequestException({ code: "WHATSAPP_CREDENTIALS_INVALID", message: "O ID do número ou token WhatsApp é inválido." });
    }
    return this.connectChannel(workspaceId, "whatsapp_cloud", accountName.trim().slice(0, 120), phoneNumberId, JSON.stringify({ accessToken }));
  }

  async disconnectChannel(workspaceId: string, channelId: string) {
    const result = await this.database.query(
      `UPDATE crm_channel_connections SET status = 'disconnected', updated_at = now()
       WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected' RETURNING id`,
      [channelId, workspaceId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: "CHANNEL_NOT_FOUND", message: "Canal não encontrado ou já desligado." });
    return { success: true };
  }

  async ingestExternalMessage(input: {
    channel: "facebook_messenger" | "instagram_dm";
    accountId: string;
    senderId: string;
    messageId: string;
    text?: string;
    senderName?: string;
  }) {
    const channelType = input.channel === "facebook_messenger" ? "facebook_page" : "instagram_direct";
    const connection = await this.database.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM crm_channel_connections
       WHERE channel_type = $1 AND external_account_id = $2 AND status = 'connected' LIMIT 1`,
      [channelType, input.accountId],
    );
    const linked = connection.rows[0];
    if (!linked || !input.senderId || !input.messageId) return null;
    const content = input.text?.trim() || "[Mensagem sem texto]";
    const result = await this.database.transaction(async (client) => {
      const event = await client.query(
        `INSERT INTO crm_meta_webhook_events (event_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_key`,
        [`${input.channel}:${input.messageId}`],
      );
      if (!event.rows.length) return null;
      let identity = await client.query<{ contact_id: string }>(
        `SELECT contact_id FROM crm_contact_external_identities
         WHERE workspace_id = $1 AND channel = $2 AND external_user_id = $3 LIMIT 1`,
        [linked.workspace_id, input.channel, input.senderId],
      );
      if (!identity.rows.length) {
        const label = input.senderName?.trim().slice(0, 100) || `${input.channel === "instagram_dm" ? "Instagram" : "Facebook"} ${input.senderId.slice(-4)}`;
        const contact = await client.query<{ id: string }>(
          `INSERT INTO crm_contacts (workspace_id, full_name, origin_channel, instagram_username)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [linked.workspace_id, label, input.channel === "instagram_dm" ? "instagram" : "facebook", input.channel === "instagram_dm" ? label : null],
        );
        identity = await client.query<{ contact_id: string }>(
          `INSERT INTO crm_contact_external_identities (workspace_id, contact_id, channel, external_user_id, display_name)
           VALUES ($1, $2, $3, $4, $5) RETURNING contact_id`,
          [linked.workspace_id, contact.rows[0].id, input.channel, input.senderId, input.senderName?.trim().slice(0, 100) || null],
        );
      }
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO crm_conversations (workspace_id, contact_id, channel, channel_connection_id, external_thread_id, last_message_preview, last_message_at, unread_count)
         VALUES ($1, $2, $3, $4, $5, $6, now(), 1)
         ON CONFLICT (workspace_id, contact_id, channel)
         DO UPDATE SET channel_connection_id = EXCLUDED.channel_connection_id, external_thread_id = EXCLUDED.external_thread_id,
                       last_message_preview = EXCLUDED.last_message_preview, last_message_at = now(), unread_count = crm_conversations.unread_count + 1
         RETURNING id`,
        [linked.workspace_id, identity.rows[0].contact_id, input.channel, linked.id, input.senderId, content.slice(0, 100)],
      );
      const message = await client.query<CrmMessage>(
        `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, metadata)
         VALUES ($1, $2, 'inbound', 'text', $3, 'delivered', $4::jsonb)
         RETURNING id, conversation_id, workspace_id, direction, message_type, content, status, created_at`,
        [conversation.rows[0].id, linked.workspace_id, content, JSON.stringify({ meta_message_id: input.messageId, sender_id: input.senderId })],
      );
      return { workspaceId: linked.workspace_id, contactId: identity.rows[0].contact_id, conversationId: conversation.rows[0].id, message: message.rows[0], channel: input.channel };
    });
    if (result) {
      void this.automations.fireTrigger({
        workspaceId: result.workspaceId,
        event: "new_message_inbound",
        contactId: result.contactId,
        conversationId: result.conversationId,
        channel: result.channel === "instagram_dm" ? "instagram" : "facebook_lead",
        messageContent: content,
      }).catch(() => {});
    }
    return result;
  }

  private async loadMetaAttempt(userId: string, workspaceId: string, attemptId: string) {
    const result = await this.database.query<{ accounts_ciphertext: string | null }>(
      `SELECT accounts_ciphertext FROM crm_meta_oauth_attempts
       WHERE id = $1 AND user_id = $2 AND workspace_id = $3 AND expires_at > now()
         AND authorized_at IS NOT NULL AND completed_at IS NULL LIMIT 1`,
      [attemptId, userId, workspaceId],
    );
    if (!result.rows.length || !result.rows[0].accounts_ciphertext) {
      throw new NotFoundException({ code: "META_AUTHORIZATION_NOT_FOUND", message: "A autorização Meta expirou. Liga a conta novamente." });
    }
    return { accounts_ciphertext: result.rows[0].accounts_ciphertext };
  }

  private decryptMetaPages(ciphertext: string) {
    try {
      const pages = JSON.parse(decryptPrivateValue(ciphertext));
      if (!Array.isArray(pages)) throw new Error("not an array");
      return pages as Array<{ id: string; name: string; pageAccessToken: string; instagram?: { id: string; name: string; username?: string } }>;
    } catch {
      throw new BadRequestException({ code: "META_AUTHORIZATION_INVALID", message: "Não foi possível ler a autorização Meta. Liga a conta novamente." });
    }
  }

  async getStoreAiConfig(workspaceId: string): Promise<StoreAiConfig> {
    const res = await this.database.query<{
      id: string;
      workspace_id: string;
      provider: "gemini" | "openai" | "claude" | "openrouter" | "custom";
      model_name: string;
      api_key_ciphertext: string | null;
      custom_endpoint_url: string | null;
      system_instructions: string;
      temperature: number;
      auto_reply_enabled: boolean;
      is_active: boolean;
      updated_at: string;
    }>(
      `SELECT id, workspace_id, provider, model_name, api_key_ciphertext, custom_endpoint_url,
              system_instructions, temperature::float AS temperature, auto_reply_enabled, is_active, updated_at
       FROM store_ai_configs
       WHERE workspace_id = $1`,
      [workspaceId],
    );

    if (!res.rows.length) {
      return {
        id: "",
        workspace_id: workspaceId,
        provider: "gemini",
        model_name: "gemini-1.5-flash",
        has_api_key: false,
        custom_endpoint_url: null,
        system_instructions: "És o assistente virtual de vendas desta loja em Angola. Sê cordial, acolhedor, profissional e ajuda o cliente a tirar dúvidas, conhecer produtos e fechar encomendas com segurança.",
        temperature: 0.7,
        auto_reply_enabled: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
    }

    const row = res.rows[0];
    let maskedKey: string | undefined = undefined;
    if (row.api_key_ciphertext) {
      try {
        const decrypted = decryptPrivateValue(row.api_key_ciphertext);
        maskedKey = decrypted.length > 8 ? `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}` : "********";
      } catch {
        maskedKey = "********";
      }
    }

    return {
      id: row.id,
      workspace_id: row.workspace_id,
      provider: row.provider,
      model_name: row.model_name,
      has_api_key: Boolean(row.api_key_ciphertext),
      masked_api_key: maskedKey,
      custom_endpoint_url: row.custom_endpoint_url,
      system_instructions: row.system_instructions,
      temperature: row.temperature,
      auto_reply_enabled: row.auto_reply_enabled,
      is_active: row.is_active,
      updated_at: row.updated_at,
    };
  }

  async saveStoreAiConfig(workspaceId: string, dto: SaveStoreAiConfigDto): Promise<StoreAiConfig> {
    let encryptedKey: string | null = null;
    if (dto.apiKey?.trim()) {
      encryptedKey = encryptPrivateValue(dto.apiKey.trim());
    }

    let query: string;
    let params: any[];

    if (encryptedKey) {
      query = `
        INSERT INTO store_ai_configs (workspace_id, provider, model_name, api_key_ciphertext, custom_endpoint_url, system_instructions, temperature, auto_reply_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (workspace_id)
        DO UPDATE SET provider = $2, model_name = $3, api_key_ciphertext = $4, custom_endpoint_url = $5, system_instructions = $6, temperature = $7, auto_reply_enabled = $8, updated_at = now()
        RETURNING id
      `;
      params = [
        workspaceId,
        dto.provider,
        dto.modelName.trim(),
        encryptedKey,
        dto.customEndpointUrl?.trim() || null,
        dto.systemInstructions?.trim() || "És o assistente virtual de vendas desta loja em Angola.",
        dto.temperature ?? 0.7,
        Boolean(dto.autoReplyEnabled),
      ];
    } else {
      query = `
        INSERT INTO store_ai_configs (workspace_id, provider, model_name, custom_endpoint_url, system_instructions, temperature, auto_reply_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (workspace_id)
        DO UPDATE SET provider = $2, model_name = $3, custom_endpoint_url = $4, system_instructions = $5, temperature = $6, auto_reply_enabled = $7, updated_at = now()
        RETURNING id
      `;
      params = [
        workspaceId,
        dto.provider,
        dto.modelName.trim(),
        dto.customEndpointUrl?.trim() || null,
        dto.systemInstructions?.trim() || "És o assistente virtual de vendas desta loja em Angola.",
        dto.temperature ?? 0.7,
        Boolean(dto.autoReplyEnabled),
      ];
    }

    await this.database.query(query, params);
    return this.getStoreAiConfig(workspaceId);
  }

  async getKnowledgeList(workspaceId: string): Promise<StoreAiKnowledge[]> {
    const res = await this.database.query<StoreAiKnowledge>(
      `SELECT id, workspace_id, title, category, content, is_active, created_at, updated_at
       FROM store_ai_knowledge
       WHERE workspace_id = $1
       ORDER BY updated_at DESC`,
      [workspaceId],
    );
    return res.rows;
  }

  async addKnowledge(workspaceId: string, dto: CreateKnowledgeDto): Promise<StoreAiKnowledge> {
    const res = await this.database.query<StoreAiKnowledge>(
      `INSERT INTO store_ai_knowledge (workspace_id, title, category, content, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace_id, title, category, content, is_active, created_at, updated_at`,
      [workspaceId, dto.title.trim(), dto.category, dto.content.trim(), dto.isActive ?? true],
    );
    return res.rows[0];
  }

  async deleteKnowledge(workspaceId: string, id: string): Promise<{ success: boolean }> {
    await this.database.query(
      `DELETE FROM store_ai_knowledge WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId],
    );
    return { success: true };
  }

  async suggestReplyForConversation(workspaceId: string, conversationId: string) {
    // 1. Get recent messages
    const msgsRes = await this.database.query<{ direction: string; content: string }>(
      `SELECT direction, content FROM crm_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [conversationId],
    );

    const history = msgsRes.rows.reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));

    if (!history.length) {
      history.push({ role: "user", content: "Olá, gostaria de saber mais informações sobre os vossos produtos e entregas." });
    }

    // 2. Fetch active store knowledge
    const knowledgeDocs = await this.getKnowledgeList(workspaceId);
    const knowledgeText = knowledgeDocs
      .filter((d) => d.is_active)
      .map((d) => `[${d.category.toUpperCase()}: ${d.title}]\n${d.content}`)
      .join("\n\n");

    // 3. Fetch store AI config
    const configRow = await this.database.query<{
      provider: string;
      model_name: string;
      api_key_ciphertext: string | null;
      custom_endpoint_url: string | null;
      system_instructions: string;
      temperature: number;
    }>(
      `SELECT provider, model_name, api_key_ciphertext, custom_endpoint_url, system_instructions, temperature::float AS temperature
       FROM store_ai_configs WHERE workspace_id = $1`,
      [workspaceId],
    );

    const cfg = configRow.rows[0];
    const provider = cfg?.provider || "gemini";
    const modelName = cfg?.model_name || "gemini-1.5-flash";
    const systemPrompt = cfg?.system_instructions || "És o assistente virtual de vendas desta loja em Angola.";
    const temp = cfg?.temperature ?? 0.7;

    let decryptedKey: string | undefined = undefined;
    if (cfg?.api_key_ciphertext) {
      try {
        decryptedKey = decryptPrivateValue(cfg.api_key_ciphertext);
      } catch {}
    }

    const response = await this.aiClient.generateLLMResponse({
      provider,
      modelName,
      apiKey: decryptedKey,
      customEndpointUrl: cfg?.custom_endpoint_url || undefined,
      systemPrompt,
      knowledgeContext: knowledgeText,
      messages: history,
      temperature: temp,
    });

    return {
      suggestion: response.generatedText,
      providerUsed: response.providerUsed,
      modelUsed: response.modelUsed,
      isFallback: response.isFallback,
    };
  }

  async testStoreAi(workspaceId: string, testPrompt: string) {
    const knowledgeDocs = await this.getKnowledgeList(workspaceId);
    const knowledgeText = knowledgeDocs
      .filter((d) => d.is_active)
      .map((d) => `[${d.category.toUpperCase()}: ${d.title}]\n${d.content}`)
      .join("\n\n");

    const configRow = await this.database.query<{
      provider: string;
      model_name: string;
      api_key_ciphertext: string | null;
      custom_endpoint_url: string | null;
      system_instructions: string;
      temperature: number;
    }>(
      `SELECT provider, model_name, api_key_ciphertext, custom_endpoint_url, system_instructions, temperature::float AS temperature
       FROM store_ai_configs WHERE workspace_id = $1`,
      [workspaceId],
    );

    const cfg = configRow.rows[0];
    const provider = cfg?.provider || "gemini";
    const modelName = cfg?.model_name || "gemini-1.5-flash";
    const systemPrompt = cfg?.system_instructions || "És o assistente virtual de vendas desta loja em Angola.";
    const temp = cfg?.temperature ?? 0.7;

    let decryptedKey: string | undefined = undefined;
    if (cfg?.api_key_ciphertext) {
      try {
        decryptedKey = decryptPrivateValue(cfg.api_key_ciphertext);
      } catch {}
    }

    const response = await this.aiClient.generateLLMResponse({
      provider,
      modelName,
      apiKey: decryptedKey,
      customEndpointUrl: cfg?.custom_endpoint_url || undefined,
      systemPrompt,
      knowledgeContext: knowledgeText,
      messages: [{ role: "user", content: testPrompt }],
      temperature: temp,
    });

    return {
      generatedText: response.generatedText,
      providerUsed: response.providerUsed,
      modelUsed: response.modelUsed,
      isFallback: response.isFallback,
    };
  }

  /* ──── Analytics & AI Insights ──── */
  async getCrmAnalytics(workspaceId: string) {
    const wsRes = await this.database.query<{ seller_profile_id: string }>(
      `SELECT seller_profile_id FROM crm_workspaces WHERE id = $1`,
      [workspaceId],
    );
    const sellerProfileId = wsRes.rows[0]?.seller_profile_id;

    // 1. Deals & Pipeline KPI
    const dealsKpiRes = await this.database.query<{
      total_deals: string;
      total_pipeline_value: string;
      won_deals: string;
      won_value: string;
      lost_deals: string;
      lost_value: string;
    }>(
      `SELECT 
         COUNT(*)::text AS total_deals,
         COALESCE(SUM(value_aoa), 0)::text AS total_pipeline_value,
         COUNT(*) FILTER (WHERE status = 'won')::text AS won_deals,
         COALESCE(SUM(value_aoa) FILTER (WHERE status = 'won'), 0)::text AS won_value,
         COUNT(*) FILTER (WHERE status = 'lost')::text AS lost_deals,
         COALESCE(SUM(value_aoa) FILTER (WHERE status = 'lost'), 0)::text AS lost_value
       FROM crm_deals
       WHERE workspace_id = $1`,
      [workspaceId],
    );
    const kpi = dealsKpiRes.rows[0];
    const totalDeals = parseInt(kpi?.total_deals || "0", 10);
    const wonDeals = parseInt(kpi?.won_deals || "0", 10);
    const lostDeals = parseInt(kpi?.lost_deals || "0", 10);
    const totalPipelineValue = parseFloat(kpi?.total_pipeline_value || "0");
    const wonValue = parseFloat(kpi?.won_value || "0");
    const lostValue = parseFloat(kpi?.lost_value || "0");
    const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;

    // 2. Stages breakdown
    const stagesRes = await this.database.query<{
      id: string;
      name: string;
      color: string;
      is_won: boolean;
      is_lost: boolean;
      deal_count: string;
      total_value: string;
    }>(
      `SELECT s.id, s.name, s.color, (s.slug = 'won') AS is_won, (s.slug = 'lost') AS is_lost,
              COUNT(d.id)::text AS deal_count,
              COALESCE(SUM(d.value_aoa), 0)::text AS total_value
       FROM crm_pipeline_stages s
       JOIN crm_pipelines p ON p.id = s.pipeline_id
       LEFT JOIN crm_deals d ON d.stage_id = s.id AND d.workspace_id = $1
       WHERE p.workspace_id = $1
       GROUP BY s.id, s.name, s.color, s.slug, s.sort_order
       ORDER BY s.sort_order ASC`,
      [workspaceId],
    );

    // 3. Contacts & Channels
    const channelsRes = await this.database.query<{ origin_channel: string; count: string }>(
      `SELECT origin_channel, COUNT(*)::text AS count FROM crm_contacts WHERE workspace_id = $1 GROUP BY origin_channel`,
      [workspaceId],
    );
    const totalContactsRes = await this.database.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM crm_contacts WHERE workspace_id = $1`,
      [workspaceId],
    );
    const totalContacts = parseInt(totalContactsRes.rows[0]?.total || "0", 10);

    // 4. Storefront Chatbot & AI Stats
    let chatSessionsCount = 0;
    let convertedChatCount = 0;
    let totalChatMessages = 0;
    let guardrailInterventions = 0;
    const violationCategories: Record<string, number> = {};

    if (sellerProfileId) {
      const chatSessionsRes = await this.database.query<{
        total_sessions: string;
        converted_sessions: string;
        total_messages: string;
      }>(
        `SELECT 
           COUNT(*)::text AS total_sessions,
           COUNT(*) FILTER (WHERE status = 'converted_to_lead')::text AS converted_sessions,
           COALESCE(SUM(messages_count), 0)::text AS total_messages
         FROM storefront_chat_sessions
         WHERE seller_profile_id = $1`,
        [sellerProfileId],
      );
      chatSessionsCount = parseInt(chatSessionsRes.rows[0]?.total_sessions || "0", 10);
      convertedChatCount = parseInt(chatSessionsRes.rows[0]?.converted_sessions || "0", 10);
      totalChatMessages = parseInt(chatSessionsRes.rows[0]?.total_messages || "0", 10);

      // Check messages for guardrail flags
      const recentAiMsgs = await this.database.query<{ metadata: any }>(
        `SELECT metadata FROM storefront_chat_messages 
         WHERE session_id IN (SELECT id FROM storefront_chat_sessions WHERE seller_profile_id = $1)
           AND role = 'ai'
         ORDER BY created_at DESC LIMIT 200`,
        [sellerProfileId],
      );

      for (const row of recentAiMsgs.rows) {
        const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
        if (meta?.guardrailTripped) {
          guardrailInterventions++;
          if (Array.isArray(meta.guardrailViolations)) {
            for (const v of meta.guardrailViolations) {
              const cat = v.category || "other";
              violationCategories[cat] = (violationCategories[cat] || 0) + 1;
            }
          }
        }
      }
    }

    const chatConversionRate =
      chatSessionsCount > 0 ? Math.round((convertedChatCount / chatSessionsCount) * 100) : 0;

    // 5. Automated AI Insights & Recommendations
    const insights: Array<{ type: "opportunity" | "alert" | "success"; message: string }> = [];

    if (chatConversionRate >= 15) {
      insights.push({
        type: "success",
        message: `Excelente desempenho do Chatbot IA: taxa de conversão de visitantes em leads de ${chatConversionRate}%.`,
      });
    } else if (chatSessionsCount > 5) {
      insights.push({
        type: "opportunity",
        message: `Oportunidade no Chatbot: ${chatSessionsCount} visitantes interagiram. Ajuste a base de conhecimento para incentivar pedidos de contacto.`,
      });
    }

    if (guardrailInterventions > 0) {
      insights.push({
        type: "alert",
        message: `Proteção activa: O motor de guardrails interceptou ${guardrailInterventions} tentativas com potenciais riscos de segurança ou desvios de pagamento.`,
      });
    }

    if (totalPipelineValue > 0 && winRate > 0) {
      insights.push({
        type: "success",
        message: `Funil com ${totalPipelineValue.toLocaleString("pt-AO")} Kz negociados e taxa de fecho de ${winRate}%.`,
      });
    } else {
      insights.push({
        type: "opportunity",
        message: "Cadastre novos negócios e associe valores em Kz para desbloquear projeções financeiras automatizadas.",
      });
    }

    return {
      pipeline: {
        totalDeals,
        totalPipelineValue,
        wonDeals,
        wonValue,
        lostDeals,
        lostValue,
        winRate,
        stages: stagesRes.rows.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          isWon: s.is_won,
          isLost: s.is_lost,
          dealCount: parseInt(s.deal_count, 10),
          totalValue: parseFloat(s.total_value),
        })),
      },
      contacts: {
        totalContacts,
        byChannel: channelsRes.rows.map((c) => ({
          channel: c.origin_channel,
          count: parseInt(c.count, 10),
        })),
        byStatus: [],
      },
      chatbot: {
        totalSessions: chatSessionsCount,
        convertedSessions: convertedChatCount,
        conversionRate: chatConversionRate,
        totalMessages: totalChatMessages,
        guardrailInterventions,
        violationsByCategory: violationCategories,
      },
      insights,
    };
  }
}
