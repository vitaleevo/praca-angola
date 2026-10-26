import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptPrivateValue } from "../auth/auth.crypto";
import { CrmService } from "./crm.service";
import { MetaGraphService } from "./meta-graph.service";

const previousKey = process.env.APP_ENCRYPTION_KEY;
const previousAppId = process.env.META_APP_ID;
const previousAppSecret = process.env.META_APP_SECRET;
const previousRedirect = process.env.META_OAUTH_REDIRECT_URI;

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = previousKey;
  if (previousAppId === undefined) delete process.env.META_APP_ID;
  else process.env.META_APP_ID = previousAppId;
  if (previousAppSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = previousAppSecret;
  if (previousRedirect === undefined) delete process.env.META_OAUTH_REDIRECT_URI;
  else process.env.META_OAUTH_REDIRECT_URI = previousRedirect;
});

describe("CRM channel diagnostics", () => {
  it("does not inspect a channel outside the user's workspace", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const graph = { inspectAccessToken: vi.fn() };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);

    await expect(service.getChannelDiagnostics("workspace-a", "channel-b")).rejects.toMatchObject({ status: 404 });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining("workspace_id = $2"), ["channel-b", "workspace-a"]);
    expect(graph.inspectAccessToken).not.toHaveBeenCalled();
  });

  it("returns missing message and comment scopes without exposing the token", async () => {
    process.env.APP_ENCRYPTION_KEY = "diagnostics-test-encryption-key-long-enough";
    const credentials_ciphertext = encryptPrivateValue(JSON.stringify({ accessToken: "page-token-private" }));
    const database = { query: vi.fn().mockResolvedValue({ rows: [{ channel_type: "facebook_page", status: "connected", external_account_id: "page-a", credentials_ciphertext }] }) };
    const graph = {
      inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, expiresAt: null, grantedScopes: ["pages_messaging"] }),
      inspectPageSubscription: vi.fn().mockResolvedValue({ subscribed: true, fields: ["messages", "leadgen"] }),
    };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);

    const result = await service.getChannelDiagnostics("workspace-a", "channel-a");
    expect(result.messagingMissing).toEqual(["pages_manage_metadata"]);
    expect(result.commentsMissing).toEqual(["pages_read_engagement", "pages_read_user_content", "pages_manage_engagement"]);
    expect(result.pageWebhookSubscribed).toBe(true);
    expect(result.pageWebhookFields).toEqual(["messages", "leadgen"]);
    expect(JSON.stringify(result)).not.toContain("page-token-private");
    expect(graph.inspectAccessToken).toHaveBeenCalledWith("page-token-private");
    expect(graph.inspectPageSubscription).toHaveBeenCalledWith("page-a", "page-token-private");
  });

  it("checks token validity with the app token and returns no credential", async () => {
    process.env.META_APP_ID = "123456789";
    process.env.META_APP_SECRET = "test-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://example.com/callback";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { app_id: "123456789", is_valid: true, scopes: ["pages_messaging"], expires_at: 1800000000 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const graph = new MetaGraphService();

    const result = await graph.inspectAccessToken("page-token-private");
    expect(result).toEqual({ valid: true, appMatches: true, expiresAt: 1800000000, grantedScopes: ["pages_messaging"] });
    expect(JSON.stringify(result)).not.toContain("page-token-private");
    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(requested.pathname).toContain("/debug_token");
    expect(requested.searchParams.get("input_token")).toBe("page-token-private");
  });

  it("checks the Page webhook subscription without returning its token", async () => {
    process.env.META_APP_ID = "123456789";
    process.env.META_APP_SECRET = "test-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://example.com/callback";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { id: "other-app", subscribed_fields: ["messages"] },
      { id: "123456789", subscribed_fields: ["messages", "leadgen"] },
    ] }) });
    vi.stubGlobal("fetch", fetchMock);
    const graph = new MetaGraphService();

    const result = await graph.inspectPageSubscription("page-a", "page-token-private");
    expect(result).toEqual({ subscribed: true, fields: ["messages", "leadgen"] });
    expect(JSON.stringify(result)).not.toContain("page-token-private");
    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(requested.pathname).toContain("/page-a/subscribed_apps");
    expect(requested.searchParams.get("access_token")).toBe("page-token-private");
  });
});
