import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export type MetaChannelType = "facebook_page" | "instagram_direct" | "whatsapp_cloud";

export interface MetaPageCandidate {
  id: string;
  name: string;
  pageAccessToken: string;
  instagram?: { id: string; name: string; username?: string };
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

  private async graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return this.request<T>(url, { method: "GET" });
  }

  private async graphPost<T>(path: string, accessToken: string, payload: unknown): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/${path}`);
    url.searchParams.set("access_token", accessToken);
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
