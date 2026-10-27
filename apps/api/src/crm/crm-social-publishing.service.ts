import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { CrmSocialService } from "./crm-social.service";

export interface SocialPostInput {
  channelIds: string[];
  content: string;
  mediaUrls: string[];
  listingId?: string | null;
}

export interface SocialPostRow {
  id: string;
  workspace_id: string;
  channel_ids: string[];
  content: string;
  media_urls: string[];
  listing_id: string | null;
  scheduled_for: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  meta_post_ids: Record<string, string> | null;
  error_message: string | null;
}

@Injectable()
export class CrmSocialPublishingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmSocialPublishingService.name);
  private timer?: ReturnType<typeof setInterval>;
  private processing = false;

  constructor(private readonly database: DatabaseService, private readonly social: CrmSocialService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processDue(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(workspaceId: string) {
    const result = await this.database.query<SocialPostRow>(
      `SELECT id, workspace_id, channel_ids, content, media_urls, listing_id, scheduled_for, status,
              meta_post_ids, error_message, created_at, updated_at, published_at
       FROM crm_social_scheduled_posts WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`, [workspaceId],
    );
    return { items: result.rows };
  }

  async saveDraft(workspaceId: string, input: SocialPostInput, id?: string) {
    await this.validateInput(workspaceId, input);
    const params = [workspaceId, input.channelIds, input.content.trim(), input.mediaUrls, input.listingId ?? null];
    if (id) {
      const result = await this.database.query<SocialPostRow>(
        `UPDATE crm_social_scheduled_posts
         SET channel_ids = $2, content = $3, media_urls = $4, listing_id = $5,
             scheduled_for = NULL, status = 'draft', error_message = NULL, updated_at = now()
         WHERE id = $6 AND workspace_id = $1 AND status IN ('draft', 'scheduled', 'failed')
           AND COALESCE(meta_post_ids, '{}'::jsonb) = '{}'::jsonb
         RETURNING *`, [...params, id],
      );
      if (!result.rows[0]) throw new ConflictException("Este rascunho já foi publicado ou está em processamento.");
      return { post: result.rows[0] };
    }
    const result = await this.database.query<SocialPostRow>(
      `INSERT INTO crm_social_scheduled_posts (workspace_id, channel_ids, content, media_urls, listing_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, params,
    );
    return { post: result.rows[0] };
  }

  async schedule(workspaceId: string, id: string, scheduledFor: string) {
    const when = new Date(scheduledFor);
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 10 * 60_000 || when.getTime() > Date.now() + 365 * 86_400_000)
      throw new BadRequestException("Escolhe uma data entre 10 minutos e um ano no futuro.");
    const post = await this.getEditable(workspaceId, id);
    await this.social.assertPublishingAccess(workspaceId, post.channel_ids, post.media_urls);
    const result = await this.database.query<SocialPostRow>(
      `UPDATE crm_social_scheduled_posts SET scheduled_for = $3, status = 'scheduled', error_message = NULL, updated_at = now()
       WHERE id = $2 AND workspace_id = $1 AND status IN ('draft', 'scheduled', 'failed')
         AND COALESCE(meta_post_ids, '{}'::jsonb) = '{}'::jsonb RETURNING *`, [workspaceId, id, when.toISOString()],
    );
    if (!result.rows[0]) throw new ConflictException("Esta publicação já começou ou foi parcialmente publicada.");
    return { post: result.rows[0] };
  }

  async publishNow(workspaceId: string, id: string) {
    const post = await this.getEditable(workspaceId, id);
    await this.social.assertPublishingAccess(workspaceId, post.channel_ids, post.media_urls);
    const claimed = await this.database.query<SocialPostRow>(
      `UPDATE crm_social_scheduled_posts SET status = 'publishing', updated_at = now()
       WHERE id = $2 AND workspace_id = $1 AND status IN ('draft', 'scheduled', 'failed') RETURNING *`, [workspaceId, id],
    );
    if (!claimed.rows[0]) throw new ConflictException("Esta publicação já está em processamento.");
    await this.publishClaimed(claimed.rows[0]);
    return this.get(workspaceId, id);
  }

  async cancel(workspaceId: string, id: string) {
    const result = await this.database.query<SocialPostRow>(
      `UPDATE crm_social_scheduled_posts SET status = 'cancelled', scheduled_for = NULL, updated_at = now()
       WHERE id = $2 AND workspace_id = $1 AND status IN ('draft', 'scheduled', 'failed') RETURNING *`, [workspaceId, id],
    );
    if (!result.rows[0]) throw new ConflictException("Não é possível cancelar uma publicação em curso ou já publicada.");
    return { post: result.rows[0] };
  }

  private async get(workspaceId: string, id: string) {
    const result = await this.database.query<SocialPostRow>(
      `SELECT * FROM crm_social_scheduled_posts WHERE id = $2 AND workspace_id = $1`, [workspaceId, id],
    );
    if (!result.rows[0]) throw new NotFoundException("Publicação não encontrada nesta loja.");
    return { post: result.rows[0] };
  }

  private async getEditable(workspaceId: string, id: string): Promise<SocialPostRow> {
    const { post } = await this.get(workspaceId, id);
    if (!['draft', 'scheduled', 'failed'].includes(post.status)) throw new ConflictException("Publicação em curso ou concluída.");
    if (!post.channel_ids.length || !post.content.trim()) throw new BadRequestException("Indica o texto e os canais de destino.");
    return post;
  }

  private async validateInput(workspaceId: string, input: SocialPostInput) {
    if (new Set(input.channelIds).size !== input.channelIds.length) throw new BadRequestException("Seleciona cada canal uma vez.");
    const selectedChannels = input.channelIds.length ? await this.social.validatePublishingChannels(workspaceId, input.channelIds) : [];
    if (input.listingId) {
      const listing = await this.database.query(
        `SELECT 1 FROM listings l JOIN crm_workspaces w ON w.seller_profile_id = l.seller_profile_id
         WHERE w.id = $1 AND l.id = $2 LIMIT 1`, [workspaceId, input.listingId],
      );
      if (!listing.rowCount) throw new BadRequestException("Produto não pertence a esta loja.");
    }
    const mediaIds = input.mediaUrls.map((url) => {
      try {
        const parsed = new URL(url);
        const site = new URL(process.env.PUBLIC_SITE_URL ?? "https://puvo.vitaleevo.ao");
        if (parsed.origin !== site.origin || !/^\/api\/v1\/media\/[0-9a-f-]{36}$/i.test(parsed.pathname) || parsed.search || parsed.hash)
          throw new Error("unsupported media URL");
        return parsed.pathname.split("/").at(-1)!;
      } catch { throw new BadRequestException("Usa fotografias carregadas na PUVO."); }
    });
    if (mediaIds.length) {
      const assets = await this.database.query<{ id: string; mime_type: string }>(
        `SELECT ma.id, ma.mime_type FROM media_assets ma
         JOIN store_memberships sm ON sm.user_id = ma.owner_user_id
         JOIN crm_workspaces w ON w.seller_profile_id = sm.seller_profile_id
         WHERE w.id = $1 AND ma.id = ANY($2::uuid[]) AND ma.deleted_at IS NULL
           AND sm.role IN ('owner', 'editor')`, [workspaceId, mediaIds],
      );
      if (assets.rows.length !== new Set(mediaIds).size)
        throw new BadRequestException("Uma fotografia não pertence a esta loja.");
      if (selectedChannels.some((channel) => channel.channel_type === "instagram_direct") && assets.rows.some((asset) => asset.mime_type !== "image/jpeg"))
        throw new BadRequestException("Usa fotografias JPEG no estúdio para publicar no Instagram.");
    }
  }

  private async processDue() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.database.query(
        `UPDATE crm_social_scheduled_posts SET status = 'failed', error_message = 'Publicação interrompida. Confirma na Meta antes de repetir.', updated_at = now()
         WHERE status = 'publishing' AND updated_at < now() - interval '10 minutes'`,
      );
      for (let i = 0; i < 5; i++) {
        const claimed = await this.database.query<SocialPostRow>(
          `UPDATE crm_social_scheduled_posts SET status = 'publishing', updated_at = now()
           WHERE id = (SELECT id FROM crm_social_scheduled_posts WHERE status = 'scheduled' AND scheduled_for <= now()
                       ORDER BY scheduled_for FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING *`,
        );
        if (!claimed.rows[0]) break;
        await this.publishClaimed(claimed.rows[0]);
      }
    } catch (error) { this.logger.error("Falha no processador de publicações", error instanceof Error ? error.stack : undefined); }
    finally { this.processing = false; }
  }

  private async publishClaimed(post: SocialPostRow) {
    try {
      for (const channelId of post.channel_ids) {
        if (post.meta_post_ids?.[channelId]) continue;
        const externalId = await this.social.publishToChannel(post.workspace_id, channelId, post.content, post.media_urls);
        await this.database.query(
          `UPDATE crm_social_scheduled_posts
           SET meta_post_ids = COALESCE(meta_post_ids, '{}'::jsonb) || jsonb_build_object($3::text, $4::text), updated_at = now()
           WHERE id = $2 AND workspace_id = $1`, [post.workspace_id, post.id, channelId, externalId],
        );
      }
      await this.database.query(
        `UPDATE crm_social_scheduled_posts SET status = 'published', published_at = now(), error_message = NULL, updated_at = now()
         WHERE id = $2 AND workspace_id = $1`, [post.workspace_id, post.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Erro ao publicar na Meta.";
      this.logger.warn(`Publicação ${post.id} falhou: ${message}`);
      await this.database.query(
        `UPDATE crm_social_scheduled_posts SET status = 'failed', error_message = $3, updated_at = now()
         WHERE id = $2 AND workspace_id = $1`, [post.workspace_id, post.id, message],
      );
    }
  }
}
