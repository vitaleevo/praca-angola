import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { decryptPrivateValue } from "../auth/auth.crypto";
import { MetaGraphService } from "./meta-graph.service";

export interface MetaAdDraftInput {
  name: string;
  objective: "whatsapp_messages" | "instagram_direct" | "store_traffic" | "lead_generation";
  budgetType: "daily" | "lifetime";
  budgetAmount: number;
  budgetCurrency: "AOA" | "USD" | "EUR";
  startsAt: string;
  endsAt?: string;
  targetLocations: string[];
  targetAgeMin: number;
  targetAgeMax: number;
  targetGender: "all" | "male" | "female";
  headline: string;
  primaryText: string;
  destinationUrl?: string;
  listingId?: string;
}

export interface MetaAdReferral { source_type?: string; source_id?: string; headline?: string }

@Injectable()
export class CrmMetaAdsService {
  constructor(private readonly database: DatabaseService, private readonly meta: MetaGraphService) {}

  private async readConnection(workspaceId: string) {
    const result = await this.database.query<{
      access_token_ciphertext: string; token_expires_at: Date | null;
      selected_ad_account_id: string | null; selected_ad_account_name: string | null; selected_currency: string | null;
    }>(`SELECT access_token_ciphertext, token_expires_at, selected_ad_account_id, selected_ad_account_name, selected_currency
        FROM crm_meta_ad_connections WHERE workspace_id=$1`, [workspaceId]);
    return result.rows[0] ?? null;
  }

  async accounts(workspaceId: string) {
    const connection = await this.readConnection(workspaceId);
    if (!connection) return { status: "permission_required", accounts: [], selected: null };
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) {
      return { status: "expired", accounts: [], selected: null };
    }
    const token = decryptPrivateValue(connection.access_token_ciphertext);
    const diagnostics = await this.meta.inspectAccessToken(token);
    if (!diagnostics.valid || !diagnostics.appMatches || !diagnostics.grantedScopes.includes("ads_read")) {
      return { status: "permission_required", accounts: [], selected: null };
    }
    const accounts = await this.meta.listAdAccounts(token);
    const selected = accounts.find((account) => account.id === connection.selected_ad_account_id) ?? null;
    return { status: "connected", accounts, selected };
  }

  async selectAccount(workspaceId: string, accountId: string) {
    if (!/^act_\d{5,30}$/.test(accountId)) throw new BadRequestException("Conta publicitária inválida.");
    const available = await this.accounts(workspaceId);
    if (available.status !== "connected") throw new UnauthorizedException("É preciso autorizar ads_read no Login Meta.");
    const account = available.accounts.find((item) => item.id === accountId);
    if (!account) throw new BadRequestException("Esta conta publicitária não foi autorizada para a loja.");
    await this.database.query(
      `UPDATE crm_meta_ad_connections SET selected_ad_account_id=$2, selected_ad_account_name=$3,
       selected_currency=$4, updated_at=now() WHERE workspace_id=$1`,
      [workspaceId, account.id, account.name, account.currency],
    );
    return { selected: account };
  }

  async metaInsights(workspaceId: string) {
    const connection = await this.readConnection(workspaceId);
    if (!connection?.selected_ad_account_id) return { status: "account_required", insights: null };
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) {
      return { status: "expired", insights: null };
    }
    const token = decryptPrivateValue(connection.access_token_ciphertext);
    const diagnostics = await this.meta.inspectAccessToken(token);
    if (!diagnostics.valid || !diagnostics.appMatches || !diagnostics.grantedScopes.includes("ads_read")) {
      return { status: "permission_required", insights: null };
    }
    const accounts = await this.meta.listAdAccounts(token);
    const selected = accounts.find((account) => account.id === connection.selected_ad_account_id);
    if (!selected) return { status: "account_required", insights: null };
    const insights = await this.meta.getAdAccountInsights(selected.id, token);
    return { status: "connected", account: selected, insights };
  }

  async attributeReferral(workspaceId: string, contactId: string, referral?: MetaAdReferral): Promise<void> {
    if (referral?.source_type !== "ad" || !/^\d{5,30}$/.test(referral.source_id ?? "")) return;
    const adId = referral.source_id!;
    await this.database.transaction(async (client) => {
      const campaign = await client.query<{ id: string }>(
        `SELECT id FROM crm_meta_ad_campaigns WHERE workspace_id=$1 AND meta_ad_id=$2 LIMIT 1`, [workspaceId, adId],
      );
      if (!campaign.rows[0]) return;
      const campaignId = campaign.rows[0].id;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [contactId, campaignId]);
      const attributed = await client.query<{ meta_campaign_id: string }>(
        `UPDATE crm_contacts SET meta_campaign_id=COALESCE(meta_campaign_id,$3), meta_ad_ref=COALESCE(meta_ad_ref,$4)
         WHERE workspace_id=$1 AND id=$2 AND (meta_campaign_id IS NULL OR meta_campaign_id=$3)
         RETURNING meta_campaign_id`, [workspaceId, contactId, campaignId, adId],
      );
      if (!attributed.rows[0]) return;
      await client.query(
        `INSERT INTO crm_deals (workspace_id, contact_id, stage_id, title, value_aoa, meta_campaign_id)
         SELECT $1, $2, s.id, 'Lead de anúncio · ' || c.name, 0, $3
         FROM crm_meta_ad_campaigns c
         JOIN crm_pipelines p ON p.workspace_id=c.workspace_id AND p.is_default=true
         JOIN LATERAL (SELECT id FROM crm_pipeline_stages WHERE pipeline_id=p.id ORDER BY sort_order LIMIT 1) s ON true
         WHERE c.id=$3 AND c.workspace_id=$1
           AND NOT EXISTS (SELECT 1 FROM crm_deals d WHERE d.workspace_id=$1 AND d.contact_id=$2 AND d.meta_campaign_id=$3)
         LIMIT 1`, [workspaceId, contactId, campaignId],
      );
    });
  }

  async list(workspaceId: string) {
    const result = await this.database.query(
      `SELECT id, name, objective, status, budget_type, budget_amount::text, budget_currency,
              starts_at, ends_at, target_locations, target_age_min, target_age_max, target_gender,
              headline, primary_text, destination_url, listing_id, meta_ad_account_id, meta_campaign_id,
              created_at, updated_at
       FROM crm_meta_ad_campaigns WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`, [workspaceId],
    );
    return { items: result.rows };
  }

  async saveDraft(workspaceId: string, input: MetaAdDraftInput, id?: string) {
    if (!input.name.trim() || !input.headline.trim() || !input.primaryText.trim() || input.targetLocations.some((item) => !item.trim()))
      throw new BadRequestException("Preenche o nome, o título, o texto e a localização.");
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!Number.isFinite(startsAt.getTime()) || (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt)))
      throw new BadRequestException("As datas da campanha são inválidas.");
    if (input.budgetAmount <= 0 || input.targetAgeMin > input.targetAgeMax)
      throw new BadRequestException("Confirma o orçamento e a faixa etária.");
    let productUrl: string | null = null;
    if (input.listingId) {
      const product = await this.database.query<{ slug: string }>(
        `SELECT l.slug FROM listings l JOIN crm_workspaces w ON w.seller_profile_id = l.seller_profile_id
         WHERE w.id = $1 AND l.id = $2`, [workspaceId, input.listingId],
      );
      if (!product.rowCount) throw new BadRequestException("O produto não pertence a esta loja.");
      productUrl = new URL(`/produtos/${encodeURIComponent(product.rows[0].slug)}`,
        process.env.PUBLIC_SITE_URL ?? "https://puvo.vitaleevo.ao").toString();
    }
    const params = [workspaceId, input.name.trim(), input.objective, input.budgetType, input.budgetAmount,
      input.budgetCurrency, startsAt.toISOString(), endsAt?.toISOString() ?? null, input.targetLocations,
      input.targetAgeMin, input.targetAgeMax, input.targetGender, input.headline.trim(), input.primaryText.trim(),
      input.destinationUrl ?? productUrl, input.listingId ?? null];
    const result = id ? await this.database.query(
      `UPDATE crm_meta_ad_campaigns SET name=$2, objective=$3, budget_type=$4, budget_amount=$5,
         budget_currency=$6, starts_at=$7, ends_at=$8, target_locations=$9, target_age_min=$10,
         target_age_max=$11, target_gender=$12, headline=$13, primary_text=$14, destination_url=$15,
         listing_id=$16, updated_at=now()
       WHERE workspace_id=$1 AND id=$17 AND status='draft' RETURNING id, status`, [...params, id],
    ) : await this.database.query(
      `INSERT INTO crm_meta_ad_campaigns (workspace_id, name, objective, budget_type, budget_amount,
          budget_currency, starts_at, ends_at, target_locations, target_age_min, target_age_max,
          target_gender, headline, primary_text, destination_url, listing_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, status`, params,
    );
    if (!result.rows[0]) throw new NotFoundException("Rascunho não encontrado ou já ativado.");
    return { campaign: result.rows[0] };
  }

  async overview(workspaceId: string) {
    const result = await this.database.query<{
      spend: string; impressions: string; reach: string; clicks: string;
      conversations: string; leads: string; revenue: string; won: string;
    }>(
      `SELECT COALESCE(SUM(m.spend_amount),0)::text AS spend,
              COALESCE(SUM(m.impressions),0)::text AS impressions,
              COALESCE(SUM(m.reach),0)::text AS reach,
              COALESCE(SUM(m.clicks),0)::text AS clicks,
              COALESCE(SUM(m.conversations_started),0)::text AS conversations,
              COALESCE(SUM(m.leads_count),0)::text AS leads,
              COALESCE(SUM(m.revenue_generated_aoa),0)::text AS revenue,
              COALESCE(SUM(m.deals_won_count),0)::text AS won
       FROM crm_meta_ad_metrics m JOIN crm_meta_ad_campaigns c ON c.id=m.campaign_id
       WHERE c.workspace_id=$1`, [workspaceId],
    );
    const metrics = result.rows[0];
    const populated = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM crm_meta_ad_metrics m
       JOIN crm_meta_ad_campaigns c ON c.id=m.campaign_id WHERE c.workspace_id=$1`, [workspaceId],
    );
    const attributed = await this.database.query<{ leads: string; won: string; revenue: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM crm_contacts ct WHERE ct.workspace_id=$1 AND ct.meta_campaign_id IS NOT NULL) AS leads,
         (SELECT COUNT(*)::text FROM crm_deals d WHERE d.workspace_id=$1 AND d.meta_campaign_id IS NOT NULL AND d.status='won') AS won,
         (SELECT COALESCE(SUM(d.value_aoa),0)::text FROM crm_deals d WHERE d.workspace_id=$1 AND d.meta_campaign_id IS NOT NULL AND d.status='won') AS revenue`,
      [workspaceId],
    );
    const spend = Number(metrics.spend);
    const local = attributed.rows[0];
    return { metrics: { ...metrics, leads: local.leads, won: local.won, revenue: local.revenue,
      ctr: Number(metrics.impressions) > 0 ? Number(metrics.clicks) / Number(metrics.impressions) * 100 : null,
      costPerLead: Number(local.leads) > 0 && spend > 0 ? spend / Number(local.leads) : null,
      roas: spend > 0 ? Number(local.revenue) / spend : null },
      hasMetaMetrics: Number(populated.rows[0].count) > 0,
      hasAttribution: Number(local.leads) > 0 };
  }
}
