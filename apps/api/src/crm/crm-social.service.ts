import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { decryptPrivateValue } from "../auth/auth.crypto";
import { MetaGraphService, type MetaSocialItem } from "./meta-graph.service";

type SocialChannel = "facebook_page" | "instagram_direct";
type ReferenceKind = "media" | "comment";

export interface ChannelRow {
  id: string;
  channel_type: SocialChannel;
  account_name: string;
  external_account_id: string;
  credentials_ciphertext: string;
}

@Injectable()
export class CrmSocialService {
  constructor(private readonly database: DatabaseService, private readonly meta: MetaGraphService) {}

  async listChannels(workspaceId: string) {
    const result = await this.database.query<Pick<ChannelRow, "id" | "channel_type" | "account_name">>(
      `SELECT id, channel_type, account_name FROM crm_channel_connections
       WHERE workspace_id = $1 AND status = 'connected' AND channel_type IN ('facebook_page', 'instagram_direct')
       ORDER BY account_name, channel_type`, [workspaceId],
    );
    return { channels: result.rows };
  }

  async listMedia(workspaceId: string, channelId: string, after?: string) {
    const channel = await this.channel(workspaceId, channelId);
    const result = await this.meta.listSocialMedia(channel.channel_type, channel.external_account_id, this.token(channel), this.cursor(after));
    return {
      items: (result.data ?? []).filter((item) => item.id).map((item) => ({
        ref: this.reference(workspaceId, channelId, "media", item.id),
        text: item.message ?? item.caption ?? "",
        createdAt: item.created_time ?? item.timestamp ?? null,
        permalink: this.publicPermalink(item.permalink_url ?? item.permalink),
        mediaType: item.media_type ?? null,
        commentsCount: item.comments_count ?? null,
      })),
      next: this.cursor(result.paging?.cursors?.after),
    };
  }

  async getProfile(workspaceId: string, channelId: string) {
    const channel = await this.channel(workspaceId, channelId);
    const profile = await this.meta.getSocialProfile(channel.channel_type, channel.external_account_id, this.token(channel));
    return {
      name: profile.name ?? channel.account_name,
      username: profile.username ?? null,
      description: profile.about ?? profile.biography ?? null,
      followers: profile.followers_count ?? profile.fan_count ?? null,
      mediaCount: profile.media_count ?? null,
      website: this.publicWebsite(profile.website),
    };
  }

  async listComments(workspaceId: string, channelId: string, mediaRef: string, after?: string) {
    const channel = await this.channel(workspaceId, channelId);
    const mediaId = this.readReference(mediaRef, workspaceId, channelId, "media");
    const result = await this.meta.listSocialComments(channel.channel_type, mediaId, this.token(channel), this.cursor(after));
    return {
      items: (result.data ?? []).filter((item) => item.id).map((item: MetaSocialItem) => ({
        ref: this.reference(workspaceId, channelId, "comment", item.id),
        text: item.message ?? item.text ?? "",
        author: item.from?.name ?? item.username ?? "Utilizador",
        createdAt: item.created_time ?? item.timestamp ?? null,
      })),
      next: this.cursor(result.paging?.cursors?.after),
    };
  }

  async reply(workspaceId: string, channelId: string, commentRef: string, message: string) {
    const channel = await this.channel(workspaceId, channelId);
    const commentId = this.readReference(commentRef, workspaceId, channelId, "comment");
    const result = await this.meta.replyToSocialComment(channel.channel_type, commentId, this.token(channel), message.trim());
    return { sent: Boolean(result.id), id: result.id ?? null };
  }

  private async channel(workspaceId: string, channelId: string): Promise<ChannelRow> {
    const result = await this.database.query<ChannelRow>(
      `SELECT id, channel_type, account_name, external_account_id, credentials_ciphertext
       FROM crm_channel_connections WHERE id = $1 AND workspace_id = $2 AND status = 'connected'
       AND channel_type IN ('facebook_page', 'instagram_direct') LIMIT 1`, [channelId, workspaceId],
    );
    if (!result.rows[0]) throw new NotFoundException({ code: "SOCIAL_CHANNEL_NOT_FOUND", message: "Canal da loja não encontrado." });
    return result.rows[0];
  }

  private token(channel: ChannelRow): string {
    try {
      const value = JSON.parse(decryptPrivateValue(channel.credentials_ciphertext)) as { accessToken?: unknown };
      if (typeof value.accessToken === "string" && value.accessToken) return value.accessToken;
    } catch { /* No credentials are included in errors. */ }
    throw new BadRequestException({ code: "SOCIAL_RECONNECT_REQUIRED", message: "Liga novamente esta Página no CRM." });
  }

  private secret(): string {
    const secret = process.env.META_APP_SECRET;
    if (!secret) throw new ServiceUnavailableException("Integração Meta indisponível.");
    return secret;
  }

  private reference(workspaceId: string, channelId: string, kind: ReferenceKind, id: string): string {
    const payload = Buffer.from(JSON.stringify({ workspaceId, channelId, kind, id, expiresAt: Date.now() + 60 * 60 * 1000 })).toString("base64url");
    const signature = createHmac("sha256", this.secret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private readReference(value: string, workspaceId: string, channelId: string, kind: ReferenceKind): string {
    if (typeof value !== "string" || value.length > 1200) throw new BadRequestException("Referência inválida.");
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) throw new BadRequestException("Referência inválida.");
    const expected = createHmac("sha256", this.secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BadRequestException("Referência inválida.");
    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
      if (decoded.workspaceId === workspaceId && decoded.channelId === channelId && decoded.kind === kind &&
          typeof decoded.id === "string" && /^\d+(?:_\d+)?$/.test(decoded.id) &&
          typeof decoded.expiresAt === "number" && decoded.expiresAt > Date.now()) return decoded.id;
    } catch { /* Invalid signed payload. */ }
    throw new BadRequestException("Referência expirada ou inválida. Atualiza a lista.");
  }

  private cursor(after?: string): string | undefined {
    if (!after) return undefined;
    // Graph cursors are opaque and may contain punctuation beyond base64. The URL builder encodes the value.
    if (typeof after !== "string" || after.length > 2048 || !/^[\x21-\x7E]+$/.test(after)) throw new BadRequestException("Página de resultados inválida.");
    return after;
  }

  private publicPermalink(value?: string): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com") || url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com")) ? url.toString() : null;
    } catch { return null; }
  }

  private publicWebsite(value?: string): string | null {
    if (!value) return null;
    try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; }
    catch { return null; }
  }
}
