import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AiClientService } from "../ai/ai-client.service";
import { decryptPrivateValue } from "../auth/auth.crypto";

/* ─── Types ─── */
export interface AutomationRule {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  trigger_config: Record<string, any>;
  conditions: ConditionBlock[];
  actions: ActionBlock[];
  is_active: boolean;
  priority: number;
  execution_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConditionBlock {
  field: string;       // e.g. 'channel', 'contact.origin_channel', 'deal.value_aoa'
  operator: string;    // 'eq', 'neq', 'gt', 'lt', 'contains', 'in'
  value: any;
}

interface ActionBlock {
  type: string;        // 'auto_reply_ai', 'auto_reply_text', 'move_deal_stage', 'assign_to_user', 'add_tag', 'create_deal', 'send_notification'
  config: Record<string, any>;
}

interface TriggerPayload {
  workspaceId: string;
  event: string;
  contactId?: string;
  conversationId?: string;
  dealId?: string;
  stageId?: string;
  channel?: string;
  messageContent?: string;
  [key: string]: any;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  trigger_event: string;
  actions_executed: any[];
  status: string;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

/* ─── Service ─── */
@Injectable()
export class CrmAutomationsService {
  private readonly logger = new Logger(CrmAutomationsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly aiClient: AiClientService,
  ) {}

  /* ──── CRUD ──── */
  async getRules(workspaceId: string): Promise<AutomationRule[]> {
    const res = await this.database.query<AutomationRule>(
      `SELECT id, workspace_id, name, description, trigger_event, trigger_config, conditions, actions,
              is_active, priority, execution_count, last_triggered_at, created_at, updated_at
       FROM crm_automation_rules
       WHERE workspace_id = $1
       ORDER BY priority ASC, created_at DESC`,
      [workspaceId],
    );
    return res.rows;
  }

  async createRule(workspaceId: string, dto: {
    name: string;
    description?: string;
    triggerEvent: string;
    triggerConfig?: Record<string, any>;
    conditions?: ConditionBlock[];
    actions: ActionBlock[];
    priority?: number;
  }): Promise<AutomationRule> {
    const res = await this.database.query<AutomationRule>(
      `INSERT INTO crm_automation_rules (workspace_id, name, description, trigger_event, trigger_config, conditions, actions, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        workspaceId,
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.triggerEvent,
        JSON.stringify(dto.triggerConfig || {}),
        JSON.stringify(dto.conditions || []),
        JSON.stringify(dto.actions),
        dto.priority ?? 100,
      ],
    );
    return res.rows[0];
  }

  async updateRule(workspaceId: string, ruleId: string, dto: Partial<{
    name: string;
    description: string;
    triggerEvent: string;
    triggerConfig: Record<string, any>;
    conditions: ConditionBlock[];
    actions: ActionBlock[];
    isActive: boolean;
    priority: number;
  }>): Promise<AutomationRule | null> {
    const fields: string[] = [];
    const params: any[] = [ruleId, workspaceId];
    let idx = 3;

    if (dto.name !== undefined) { fields.push(`name = $${idx++}`); params.push(dto.name.trim()); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); params.push(dto.description); }
    if (dto.triggerEvent !== undefined) { fields.push(`trigger_event = $${idx++}`); params.push(dto.triggerEvent); }
    if (dto.triggerConfig !== undefined) { fields.push(`trigger_config = $${idx++}`); params.push(JSON.stringify(dto.triggerConfig)); }
    if (dto.conditions !== undefined) { fields.push(`conditions = $${idx++}`); params.push(JSON.stringify(dto.conditions)); }
    if (dto.actions !== undefined) { fields.push(`actions = $${idx++}`); params.push(JSON.stringify(dto.actions)); }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(dto.isActive); }
    if (dto.priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(dto.priority); }

    if (!fields.length) return null;
    fields.push("updated_at = now()");

    const res = await this.database.query<AutomationRule>(
      `UPDATE crm_automation_rules SET ${fields.join(", ")} WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      params,
    );
    return res.rows[0] || null;
  }

  async deleteRule(workspaceId: string, ruleId: string): Promise<{ success: boolean }> {
    await this.database.query(
      `DELETE FROM crm_automation_rules WHERE id = $1 AND workspace_id = $2`,
      [ruleId, workspaceId],
    );
    return { success: true };
  }

  async getLogs(workspaceId: string, limit = 50): Promise<AutomationLog[]> {
    const res = await this.database.query<AutomationLog>(
      `SELECT al.id, al.rule_id, ar.name AS rule_name, al.trigger_event, al.actions_executed,
              al.status, al.error_message, al.duration_ms, al.created_at
       FROM crm_automation_logs al
       JOIN crm_automation_rules ar ON ar.id = al.rule_id
       WHERE al.workspace_id = $1
       ORDER BY al.created_at DESC LIMIT $2`,
      [workspaceId, limit],
    );
    return res.rows;
  }

  /* ──── ENGINE: Fire Trigger ──── */
  async fireTrigger(payload: TriggerPayload): Promise<void> {
    const start = Date.now();
    const { workspaceId, event } = payload;

    try {
      // Find all active rules matching this trigger
      const rules = await this.database.query<AutomationRule>(
        `SELECT * FROM crm_automation_rules
         WHERE workspace_id = $1 AND trigger_event = $2 AND is_active = true
         ORDER BY priority ASC`,
        [workspaceId, event],
      );

      for (const rule of rules.rows) {
        await this.executeRule(rule, payload, start);
      }
    } catch (err) {
      this.logger.error(`Automation engine error for event ${event}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  private async executeRule(rule: AutomationRule, payload: TriggerPayload, startMs: number): Promise<void> {
    const executedActions: any[] = [];
    let status = "success";
    let errorMessage: string | null = null;

    try {
      // 1. Check conditions
      const conditions = (typeof rule.conditions === "string" ? JSON.parse(rule.conditions as any) : rule.conditions) as ConditionBlock[];
      if (!this.evaluateConditions(conditions, payload)) {
        return; // Conditions not met, skip silently
      }

      // 2. Execute actions
      const actions = (typeof rule.actions === "string" ? JSON.parse(rule.actions as any) : rule.actions) as ActionBlock[];
      for (const action of actions) {
        try {
          const result = await this.executeAction(action, payload);
          executedActions.push({ type: action.type, status: "ok", result });
        } catch (actionErr) {
          executedActions.push({ type: action.type, status: "error", error: actionErr instanceof Error ? actionErr.message : "unknown" });
          status = "partial_failure";
          errorMessage = actionErr instanceof Error ? actionErr.message : "Action failed";
        }
      }
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : "Rule execution failed";
    }

    const durationMs = Date.now() - startMs;

    // 3. Log execution
    await this.database.query(
      `INSERT INTO crm_automation_logs (workspace_id, rule_id, trigger_event, trigger_payload, actions_executed, status, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        payload.workspaceId,
        rule.id,
        payload.event,
        JSON.stringify({ contactId: payload.contactId, conversationId: payload.conversationId, dealId: payload.dealId }),
        JSON.stringify(executedActions),
        status,
        errorMessage,
        durationMs,
      ],
    );

    // 4. Update rule stats
    await this.database.query(
      `UPDATE crm_automation_rules SET execution_count = execution_count + 1, last_triggered_at = now() WHERE id = $1`,
      [rule.id],
    );
  }

  private evaluateConditions(conditions: ConditionBlock[], payload: TriggerPayload): boolean {
    if (!conditions || !conditions.length) return true;

    return conditions.every((cond) => {
      const actualValue = this.resolveField(cond.field, payload);
      switch (cond.operator) {
        case "eq": return actualValue === cond.value;
        case "neq": return actualValue !== cond.value;
        case "gt": return Number(actualValue) > Number(cond.value);
        case "lt": return Number(actualValue) < Number(cond.value);
        case "contains": return String(actualValue ?? "").toLowerCase().includes(String(cond.value).toLowerCase());
        case "in": return Array.isArray(cond.value) && cond.value.includes(actualValue);
        default: return true;
      }
    });
  }

  private resolveField(field: string, payload: TriggerPayload): any {
    const mapping: Record<string, any> = {
      "channel": payload.channel,
      "contact.origin_channel": payload.channel,
      "message.content": payload.messageContent,
      "deal.value_aoa": payload.dealValueAoa,
      "deal.stage_id": payload.stageId,
    };
    return mapping[field] ?? payload[field];
  }

  private async executeAction(action: ActionBlock, payload: TriggerPayload): Promise<any> {
    switch (action.type) {
      case "auto_reply_text":
        return this.actionAutoReplyText(action.config, payload);
      case "auto_reply_ai":
        return this.actionAutoReplyAi(action.config, payload);
      case "move_deal_stage":
        return this.actionMoveDealStage(action.config, payload);
      case "assign_to_user":
        return this.actionAssignToUser(action.config, payload);
      case "add_tag":
        return this.actionAddTag(action.config, payload);
      case "create_deal":
        return this.actionCreateDeal(action.config, payload);
      case "send_notification":
        return this.actionSendNotification(action.config, payload);
      default:
        this.logger.warn(`Unknown automation action type: ${action.type}`);
        return { skipped: true, reason: `Unknown action type: ${action.type}` };
    }
  }

  /* ──── Individual Action Executors ──── */
  private async actionAutoReplyText(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.conversationId || !config.message) return { skipped: true };

    await this.database.query(
      `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, sent_by_ai, metadata)
       VALUES ($1, $2, 'outbound', 'text', $3, 'sent', true, '{"source": "automation"}'::jsonb)`,
      [payload.conversationId, payload.workspaceId, config.message],
    );

    await this.database.query(
      `UPDATE crm_conversations SET last_message_preview = $2, last_message_at = now() WHERE id = $1`,
      [payload.conversationId, String(config.message).slice(0, 100)],
    );

    return { sent: true, messagePreview: String(config.message).slice(0, 60) };
  }

  private async actionAutoReplyAi(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.conversationId) return { skipped: true };

    // Fetch store AI config
    const cfgRes = await this.database.query<{
      provider: string; model_name: string; api_key_ciphertext: string | null;
      custom_endpoint_url: string | null; system_instructions: string; temperature: number;
    }>(
      `SELECT provider, model_name, api_key_ciphertext, custom_endpoint_url, system_instructions, temperature::float AS temperature
       FROM store_ai_configs WHERE workspace_id = $1`,
      [payload.workspaceId],
    );

    const cfg = cfgRes.rows[0];
    if (!cfg) return { skipped: true, reason: "No AI config" };

    let apiKey: string | undefined;
    if (cfg.api_key_ciphertext) {
      try { apiKey = decryptPrivateValue(cfg.api_key_ciphertext); } catch {}
    }

    // Fetch knowledge context
    const knowledgeRes = await this.database.query<{ title: string; category: string; content: string }>(
      `SELECT title, category, content FROM store_ai_knowledge WHERE workspace_id = $1 AND is_active = true`,
      [payload.workspaceId],
    );
    const knowledgeText = knowledgeRes.rows.map((d) => `[${d.category.toUpperCase()}: ${d.title}]\n${d.content}`).join("\n\n");

    // Get recent messages for context
    const msgsRes = await this.database.query<{ direction: string; content: string }>(
      `SELECT direction, content FROM crm_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [payload.conversationId],
    );

    const messages = msgsRes.rows.reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content,
    }));

    const response = await this.aiClient.generateLLMResponse({
      provider: cfg.provider,
      modelName: cfg.model_name,
      apiKey,
      customEndpointUrl: cfg.custom_endpoint_url || undefined,
      systemPrompt: cfg.system_instructions || "És o assistente de vendas desta loja angolana. Responde de forma profissional e acolhedora.",
      knowledgeContext: knowledgeText,
      messages,
      temperature: cfg.temperature ?? 0.7,
    });

    // Save AI reply message
    await this.database.query(
      `INSERT INTO crm_messages (conversation_id, workspace_id, direction, message_type, content, status, sent_by_ai, metadata)
       VALUES ($1, $2, 'outbound', 'text', $3, 'sent', true, $4)`,
      [
        payload.conversationId,
        payload.workspaceId,
        response.generatedText,
        JSON.stringify({ source: "automation_ai", provider: response.providerUsed, model: response.modelUsed, fallback: response.isFallback }),
      ],
    );

    await this.database.query(
      `UPDATE crm_conversations SET last_message_preview = $2, last_message_at = now() WHERE id = $1`,
      [payload.conversationId, response.generatedText.slice(0, 100)],
    );

    return { sent: true, providerUsed: response.providerUsed, isFallback: response.isFallback };
  }

  private async actionMoveDealStage(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.dealId || !config.stageId) return { skipped: true };
    await this.database.query(
      `UPDATE crm_deals SET stage_id = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
      [config.stageId, payload.dealId, payload.workspaceId],
    );
    return { moved: true, dealId: payload.dealId, newStageId: config.stageId };
  }

  private async actionAssignToUser(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.dealId || !config.userId) return { skipped: true };
    await this.database.query(
      `UPDATE crm_deals SET assigned_to = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
      [config.userId, payload.dealId, payload.workspaceId],
    );
    return { assigned: true, userId: config.userId };
  }

  private async actionAddTag(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.contactId || !config.tag) return { skipped: true };
    await this.database.query(
      `UPDATE crm_contacts SET tags = array_append(COALESCE(tags, '{}'), $1), updated_at = now()
       WHERE id = $2 AND workspace_id = $3 AND NOT ($1 = ANY(COALESCE(tags, '{}')))`,
      [config.tag, payload.contactId, payload.workspaceId],
    );
    return { tagged: true, tag: config.tag };
  }

  private async actionCreateDeal(config: Record<string, any>, payload: TriggerPayload) {
    if (!payload.contactId) return { skipped: true };

    const firstStage = await this.database.query<{ id: string }>(
      `SELECT s.id FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id
       WHERE p.workspace_id = $1 AND p.is_default = true ORDER BY s.sort_order ASC LIMIT 1`,
      [payload.workspaceId],
    );

    if (!firstStage.rows.length) return { skipped: true, reason: "No pipeline stages" };

    const dealTitle = config.title || "Novo negócio automático";
    const dealValue = config.valueAoa ?? 0;

    await this.database.query(
      `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.workspaceId, payload.contactId, firstStage.rows[0].id, dealTitle, dealValue],
    );

    return { created: true, title: dealTitle };
  }

  private async actionSendNotification(config: Record<string, any>, payload: TriggerPayload) {
    // In production this would push to WebSocket / push notification
    this.logger.log(`[Automation Notification] ${config.message || "Nova atividade no CRM"} (workspace: ${payload.workspaceId})`);
    return { notified: true };
  }

  /* ──── Pre-built Templates ──── */
  async seedDefaultRules(workspaceId: string): Promise<AutomationRule[]> {
    const existingRules = await this.database.query<{ id: string }>(
      `SELECT id FROM crm_automation_rules WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    );

    if (existingRules.rows.length) return []; // Already has rules

    const templates = [
      {
        name: "Boas-vindas automáticas (WhatsApp)",
        description: "Envia mensagem de boas-vindas quando um novo lead chega via WhatsApp",
        triggerEvent: "new_message_inbound",
        conditions: [{ field: "channel", operator: "eq", value: "whatsapp" }],
        actions: [
          {
            type: "auto_reply_text",
            config: { message: "👋 Olá! Obrigado pelo contacto. A nossa equipa vai responder-te em breve. Enquanto isso, veja o nosso catálogo completo na loja!" },
          },
        ],
        priority: 10,
      },
      {
        name: "Resposta IA para novos leads do Facebook",
        description: "Usa IA para responder automaticamente a leads do Facebook com base no conhecimento da loja",
        triggerEvent: "new_lead",
        conditions: [{ field: "channel", operator: "in", value: ["facebook_lead", "instagram"] }],
        actions: [{ type: "auto_reply_ai", config: {} }],
        priority: 20,
      },
      {
        name: "Tag 'VIP' para negócios acima de 500.000 Kz",
        description: "Marca automaticamente contactos com negócios de alto valor",
        triggerEvent: "new_deal",
        conditions: [{ field: "deal.value_aoa", operator: "gt", value: 500000 }],
        actions: [{ type: "add_tag", config: { tag: "VIP" } }],
        priority: 50,
      },
    ];

    const created: AutomationRule[] = [];
    for (const tpl of templates) {
      const rule = await this.createRule(workspaceId, tpl);
      created.push(rule);
    }

    return created;
  }
}
