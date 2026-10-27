import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export type MetaChannelType = "facebook_page" | "instagram_direct" | "whatsapp_cloud";

export interface MetaPageCandidate {
  id: string;
  name: string;
  pageAccessToken: string;
  instagram?: { id: string; name: string; username?: string };
}

export interface MetaTokenDiagnostics {
  valid: boolean;
  appMatches: boolean;
  expiresAt: number | null;
  grantedScopes: string[];
}

export interface MetaPageSubscriptionDiagnostics {
  subscribed: boolean;
  fields: string[];
}

export interface MetaSocialItem {
  id: string;
  text?: string;
  message?: string;
  caption?: string;
  created_time?: string;
  timestamp?: string;
  permalink_url?: string;
  permalink?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  full_picture?: string;
  children?: { data?: Array<{ media_type?: string; media_url?: string; thumbnail_url?: string }> };
  comments_count?: number;
  from?: { name?: string };
  username?: string;
}

export interface MetaSocialPage { data?: MetaSocialItem[]; paging?: { cursors?: { after?: string } } }

export interface MetaHistoryConversation {
  id?: string;
  participants?: { data?: Array<{ id?: string; name?: string }> };
}
export interface MetaHistoryMessage {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  attachments?: { data?: Array<{ image_data?: { url?: string; preview_url?: string } }> };
}

interface GraphErrorPayload {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

@Injectable()
export class MetaGraphService {
  private readonly logger = new Logger(MetaGraphService.name);

  private graphVersion(): string {
    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
    if (!/^v\d+\.\d+$/.test(version)) throw new ServiceUnavailableException("Configuração da API Meta inválida");
    return version;
  }

  private oauthConfig() {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) {
      throw new ServiceUnavailableException("A ligação Meta ainda não está configurada");
    }
    try {
      const url = new URL(redirectUri);
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("https required");
    } catch {
      throw new ServiceUnavailableException("URL de retorno Meta inválido");
    }
    const businessLoginConfigId = process.env.META_BUSINESS_LOGIN_CONFIG_ID?.trim();
    if (businessLoginConfigId && !/^\d{8,32}$/.test(businessLoginConfigId)) {
      throw new ServiceUnavailableException("Configuração de Login Meta inválida");
    }
    return { appId, appSecret, redirectUri, businessLoginConfigId };
  }

  createAuthorizationUrl(state: string): string {
    const { appId, redirectUri, businessLoginConfigId } = this.oauthConfig();
    const url = new URL(`https://www.facebook.com/${this.graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    if (businessLoginConfigId) {
      // Use a Pages/Instagram configuration here; a WhatsApp-only config cannot list seller Pages.
      // Facebook Login for Business owns the permission set. Meta rejects scopes on this flow.
      url.searchParams.set("config_id", businessLoginConfigId);
      url.searchParams.set("override_default_response_type", "true");
    } else {
      url.searchParams.set("scope", [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "pages_messaging",
        "leads_retrieval",
        "instagram_basic",
      ].join(","));
    }
    return url.toString();
  }

  embeddedSignupConfig() {
    const { appId } = this.oauthConfig();
    const configId = process.env.META_WHATSAPP_LOGIN_CONFIG_ID?.trim();
    if (!configId || !/^\d{8,32}$/.test(configId)) {
      throw new ServiceUnavailableException("A ligação WhatsApp por QR ainda não está configurada");
    }
    return { appId, configId, graphVersion: this.graphVersion() };
  }

  async exchangeEmbeddedSignupCode(code: string): Promise<string> {
    const { appId, appSecret } = this.oauthConfig();
    const result = await this.graphGet<{ access_token?: string }>("oauth/access_token", {
      client_id: appId, client_secret: appSecret, code,
    });
    if (!result.access_token) throw new BadGatewayException("A Meta não devolveu o acesso WhatsApp");
    return result.access_token;
  }

  async getWhatsAppPhoneNumbers(wabaId: string, accessToken: string) {
    return this.graphGetWithToken<{ data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string }> }>(
      `${wabaId}/phone_numbers`,
      { fields: "id,display_phone_number,verified_name", limit: "100" }, accessToken,
    );
  }

  async inspectCoexistencePhone(phoneNumberId: string, accessToken: string) {
    return this.graphGetWithToken<{ id?: string; is_on_biz_app?: boolean; platform_type?: string }>(
      phoneNumberId, { fields: "id,is_on_biz_app,platform_type" }, accessToken,
    );
  }

  async subscribeWhatsAppWaba(wabaId: string, accessToken: string): Promise<void> {
    await this.graphPost(`${wabaId}/subscribed_apps`, accessToken, {});
  }

  async requestWhatsAppBusinessAppSync(phoneNumberId: string, accessToken: string, syncType: "smb_app_state_sync" | "history"): Promise<void> {
    await this.graphPost(`${phoneNumberId}/smb_app_data`, accessToken, { messaging_product: "whatsapp", sync_type: syncType });
  }

  async exchangeCodeForPages(code: string): Promise<MetaPageCandidate[]> {
    const { appId, appSecret, redirectUri } = this.oauthConfig();
    const codeToken = await this.graphGet<{ access_token?: string }>("oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    if (!codeToken.access_token) throw new BadGatewayException("A Meta não devolveu um token de autorização");

    let userToken = codeToken.access_token;
    try {
      const longLived = await this.graphGet<{ access_token?: string }>("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userToken,
      });
      userToken = longLived.access_token || userToken;
    } catch {
      this.logger.warn("Meta did not exchange the user token for a long-lived token");
    }

    const accounts = await this.graphGet<{ data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; name?: string; username?: string };
    }> }>("me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,name,username}",
      limit: "100",
      access_token: userToken,
    });

    return (accounts.data ?? []).flatMap((page) => {
      if (!page.id || !page.name || !page.access_token) return [];
      const instagram = page.instagram_business_account?.id
        ? { id: page.instagram_business_account.id, name: page.instagram_business_account.name || page.instagram_business_account.username || "Instagram profissional", username: page.instagram_business_account.username }
        : undefined;
      return [{ id: page.id, name: page.name, pageAccessToken: page.access_token, instagram }];
    });
  }

  async sendText(channel: MetaChannelType, accountId: string, recipientId: string, accessToken: string, text: string): Promise<string | undefined> {
    if (!recipientId) throw new BadRequestException("A conversa externa não tem destinatário válido");
    const limit = channel === "instagram_direct" ? 1000 : channel === "whatsapp_cloud" ? 4096 : 2000;
    if (text.length > limit) throw new BadRequestException(`Esta mensagem excede o limite de ${limit} caracteres do canal`);
    if (channel === "whatsapp_cloud") {
      const response = await this.graphPost<{ messages?: Array<{ id?: string }> }>(`${accountId}/messages`, accessToken, {
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: text },
      });
      return response.messages?.[0]?.id;
    }
    const response = await this.graphPost<{ message_id?: string }>(`${accountId}/messages`, accessToken, {
      recipient: { id: recipientId },
      message: { text },
    });
    return response.message_id;
  }

  async downloadWhatsAppImage(mediaId: string, phoneNumberId: string, accessToken: string): Promise<{ bytes: Buffer; mimeType: string }> {
    if (!/^\d{5,32}$/.test(mediaId) || !/^\d{5,32}$/.test(phoneNumberId)) throw new BadRequestException("Imagem WhatsApp inválida");
    const media = await this.graphGet<{ url?: string; mime_type?: string; file_size?: number }>(mediaId, {
      phone_number_id: phoneNumberId, access_token: accessToken,
    });
    if (!media.url || !/^image\/(jpeg|png|webp)$/.test(media.mime_type ?? "") || (media.file_size ?? 0) > 8_000_000) {
      throw new BadGatewayException("A imagem WhatsApp não está disponível ou excede o limite de 8 MB");
    }
    const url = new URL(media.url);
    if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "fbsbx.com" || url.hostname.endsWith(".fbsbx.com"))) {
      throw new BadGatewayException("Endereço de imagem WhatsApp inválido");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error", signal: controller.signal });
      if (!response.ok || !response.body) throw new BadGatewayException("Não foi possível obter a imagem WhatsApp");
      const parts: Uint8Array[] = [];
      let size = 0;
      for await (const part of response.body) {
        size += part.length;
        if (size > 8_000_000) throw new BadGatewayException("A imagem WhatsApp excede o limite de 8 MB");
        parts.push(part);
      }
      return { bytes: Buffer.concat(parts), mimeType: media.mime_type! };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException("Não foi possível obter a imagem WhatsApp");
    } finally {
      clearTimeout(timer);
    }
  }

  async listConversationHistory(channel: "facebook_page" | "instagram_direct", accountId: string, accessToken: string, after?: string) {
    const pageId = channel === "instagram_direct"
      ? (await this.graphGet<{ id?: string }>("me", { fields: "id", access_token: accessToken })).id
      : accountId;
    if (!pageId || !/^\d+$/.test(pageId)) throw new BadGatewayException("A Meta não devolveu a Página associada ao canal");
    const result = await this.graphGet<{ data?: MetaHistoryConversation[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${pageId}/conversations`, {
      fields: "id,participants", limit: "1", access_token: accessToken,
      ...(channel === "instagram_direct" ? { platform: "instagram" } : {}),
      ...(after ? { after } : {}),
    });
    return { pageId, conversations: result.data ?? [], next: result.paging?.next ? result.paging.cursors?.after : undefined };
  }

  async listConversationMessages(conversationId: string, accessToken: string, after?: string) {
    if (!/^[A-Za-z0-9_]{2,128}$/.test(conversationId)) throw new BadRequestException("Conversa Meta inválida");
    const result = await this.graphGet<{ data?: MetaHistoryMessage[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${conversationId}/messages`, {
      fields: "id,message,created_time,from,attachments{image_data}", limit: "25", access_token: accessToken, ...(after ? { after } : {}),
    });
    return { messages: result.data ?? [], next: result.paging?.next ? result.paging.cursors?.after : undefined };
  }

  async subscribeAccount(channel: MetaChannelType, accountId: string, accessToken: string): Promise<void> {
    const subscribedFields = channel === "facebook_page" ? ["messages", "messaging_postbacks", "leadgen"] : ["messages"];
    await this.graphPost(`${accountId}/subscribed_apps`, accessToken, { subscribed_fields: subscribedFields });
  }

  async getLeadFields(leadgenId: string, accessToken: string): Promise<Record<string, string>> {
    const result = await this.graphGet<{ field_data?: Array<{ name?: string; values?: string[] }> }>(leadgenId, {
      fields: "field_data",
      access_token: accessToken,
    });
    return Object.fromEntries((result.field_data ?? []).flatMap((field) =>
      field.name && field.values?.[0] ? [[field.name, field.values[0]]] : [],
    ));
  }

  async inspectAccessToken(accessToken: string): Promise<MetaTokenDiagnostics> {
    const { appId, appSecret } = this.oauthConfig();
    const result = await this.graphGet<{ data?: {
      app_id?: string;
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
    } }>("debug_token", {
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    });
    const data = result.data;
    return {
      valid: data?.is_valid === true,
      appMatches: data?.app_id === appId,
      expiresAt: data?.expires_at && data.expires_at > 0 ? data.expires_at : null,
      grantedScopes: Array.isArray(data?.scopes) ? data.scopes : [],
    };
  }

  async inspectPageSubscription(pageId: string, accessToken: string): Promise<MetaPageSubscriptionDiagnostics> {
    const { appId } = this.oauthConfig();
    const result = await this.graphGet<{ data?: Array<{ id?: string; subscribed_fields?: string[] }> }>(`${pageId}/subscribed_apps`, {
      fields: "id,subscribed_fields",
      limit: "100",
      access_token: accessToken,
    });
    const subscription = result.data?.find((entry) => entry.id === appId);
    return {
      subscribed: Boolean(subscription),
      fields: Array.isArray(subscription?.subscribed_fields) ? subscription.subscribed_fields : [],
    };
  }

  async listSocialMedia(channel: "facebook_page" | "instagram_direct", accountId: string, accessToken: string, after?: string): Promise<MetaSocialPage> {
    const path = channel === "facebook_page" ? `${accountId}/posts` : `${accountId}/media`;
    const fields = channel === "facebook_page"
      ? "id,message,created_time,permalink_url,full_picture"
      : "id,caption,timestamp,permalink,media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url},comments_count";
    return this.graphGet<MetaSocialPage>(path, {
      fields, limit: "20", access_token: accessToken, ...(after ? { after } : {}),
    });
  }

  async getSocialProfile(channel: "facebook_page" | "instagram_direct", accountId: string, accessToken: string) {
    const fields = channel === "facebook_page"
      ? "id,name,about,fan_count,followers_count,website"
      : "id,name,username,biography,followers_count,media_count,website";
    return this.graphGet<{ name?: string; username?: string; about?: string; biography?: string; fan_count?: number; followers_count?: number; media_count?: number; website?: string }>(accountId, { fields, access_token: accessToken });
  }

  async listSocialComments(channel: "facebook_page" | "instagram_direct", mediaId: string, accessToken: string, after?: string): Promise<MetaSocialPage> {
    const fields = channel === "facebook_page" ? "id,message,created_time,from" : "id,text,timestamp,username";
    return this.graphGet<MetaSocialPage>(`${mediaId}/comments`, {
      fields, limit: "25", access_token: accessToken, ...(after ? { after } : {}),
    });
  }

  async replyToSocialComment(channel: "facebook_page" | "instagram_direct", commentId: string, accessToken: string, message: string): Promise<{ id?: string }> {
    return this.graphPost<{ id?: string }>(`${commentId}/${channel === "facebook_page" ? "comments" : "replies"}`, accessToken, { message });
  }

  private async graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return this.request<T>(url, { method: "GET" });
  }

  private async graphGetWithToken<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return this.request<T>(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  private async graphPost<T>(path: string, accessToken: string, payload: unknown): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/${path}`);
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as T & GraphErrorPayload;
      if (!response.ok) {
        const detail = payload.error?.message || "Erro desconhecido da Meta";
        this.logger.warn(`Meta Graph request failed: ${response.status} ${payload.error?.code ?? "unknown"}`);
        throw new BadGatewayException(`A Meta recusou o pedido: ${detail}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error("Meta Graph request failed", error instanceof Error ? error.stack : undefined);
      throw new BadGatewayException("Não foi possível contactar a Meta. Tenta novamente.");
    } finally {
      clearTimeout(timer);
    }
  }
}
