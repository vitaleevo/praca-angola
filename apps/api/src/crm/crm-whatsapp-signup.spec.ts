import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmService } from "./crm.service";
import { encryptPrivateValue } from "../auth/auth.crypto";

const priorKey = process.env.APP_ENCRYPTION_KEY;
afterEach(() => {
  if (priorKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = priorKey;
});

describe("WhatsApp Embedded Signup", () => {
  const request = {
    attemptId: "00000000-0000-4000-8000-000000000001",
    code: "temporary-code", wabaId: "123456789012", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  };

  it("accepts only a one-time attempt belonging to the signed-in workspace", async () => {
    const graph = { exchangeEmbeddedSignupCode: vi.fn() };
    const database = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    await expect(service.finishWhatsAppEmbeddedSignup("user-a", "workspace-a", request)).rejects.toMatchObject({ status: 400 });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining("user_id = $2 AND workspace_id = $3"),
      [request.attemptId, "user-a", "workspace-a"]);
    expect(graph.exchangeEmbeddedSignupCode).not.toHaveBeenCalled();
  });

  it("checks WABA ownership and coexistence before storing an encrypted token", async () => {
    process.env.APP_ENCRYPTION_KEY = "whatsapp-signup-test-key-long-enough";
    const graph = {
      exchangeEmbeddedSignupCode: vi.fn().mockResolvedValue("private-business-token"),
      inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, expiresAt: 1800000000 }),
      getWhatsAppPhoneNumbers: vi.fn().mockResolvedValue({ data: [{ id: "5555512345", display_phone_number: "+244 900 000 001", verified_name: "Loja" }] }),
      inspectCoexistencePhone: vi.fn().mockResolvedValue({ id: "5555512345", is_on_biz_app: true, platform_type: "CLOUD_API" }),
      subscribeWhatsAppWaba: vi.fn().mockResolvedValue(undefined),
      requestWhatsAppBusinessAppSync: vi.fn().mockResolvedValue(undefined),
    };
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT workspace_id")) return { rows: [] };
      if (sql.includes("INSERT INTO crm_channel_connections")) return { rows: [{ id: "channel-a", account_name: "Loja" }] };
      return { rows: [] };
    }) };
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("UPDATE crm_whatsapp_signup_attempts")) return { rows: [{ id: request.attemptId }], rowCount: 1 };
        if (sql.includes("SELECT workspace_id FROM crm_channel_connections")) return { rows: [] };
        if (sql.includes("FROM crm_whatsapp_sync_requests sr")) return { rows: [{ external_account_id: "5555512345", credentials_ciphertext: encryptPrivateValue(JSON.stringify({ accessToken: "private-business-token" })), started_at: new Date(), contacts_requested_at: null, history_requested_at: null }] };
        return { rows: [] };
      }),
      transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)),
    };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);

    const result = await service.finishWhatsAppEmbeddedSignup("user-a", "workspace-a", request);
    expect(result).toMatchObject({ channel: { id: "channel-a" }, syncRequested: true });
    expect(graph.subscribeWhatsAppWaba).toHaveBeenCalledWith(request.wabaId, "private-business-token");
    expect(graph.requestWhatsAppBusinessAppSync).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("private-business-token");
    const insert = client.query.mock.calls.find((call) => call[0].includes("INSERT INTO crm_channel_connections"));
    expect(insert).toBeDefined();
  });

  it("rejects a phone already linked to another tenant", async () => {
    process.env.APP_ENCRYPTION_KEY = "whatsapp-signup-test-key-long-enough";
    const graph = {
      exchangeEmbeddedSignupCode: vi.fn().mockResolvedValue("private-business-token"),
      inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, expiresAt: 1800000000 }),
      getWhatsAppPhoneNumbers: vi.fn().mockResolvedValue({ data: [{ id: "5555512345" }] }),
      inspectCoexistencePhone: vi.fn().mockResolvedValue({ id: "5555512345", is_on_biz_app: true, platform_type: "CLOUD_API" }),
      subscribeWhatsAppWaba: vi.fn().mockResolvedValue(undefined),
    };
    const client = { query: vi.fn(async (sql: string) => sql.includes("SELECT workspace_id")
      ? { rows: [{ workspace_id: "workspace-b" }] } : { rows: [] }) };
    const database = {
      query: vi.fn(async (sql: string) => sql.includes("UPDATE crm_whatsapp_signup_attempts")
        ? { rows: [{ id: request.attemptId }], rowCount: 1 }
        : { rows: [{ workspace_id: "workspace-b" }] }),
      transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)),
    };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    await expect(service.finishWhatsAppEmbeddedSignup("user-a", "workspace-a", request)).rejects.toMatchObject({ status: 400 });
    expect(client.query.mock.calls.some((call) => call[0].includes("INSERT INTO crm_channel_connections"))).toBe(false);
  });

  it("does not allow the generic channel endpoint to claim a WhatsApp number", async () => {
    const service = new CrmService({} as never, {} as never, {} as never, {} as never);
    await expect(service.connectChannel("workspace-a", "whatsapp_cloud", "Loja", "5555512345", "arbitrary-token"))
      .rejects.toMatchObject({ status: 400 });
  });

  it("validates the app token and phone before a manual WhatsApp connection", async () => {
    const graph = {
      inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, expiresAt: null, grantedScopes: ["whatsapp_business_messaging"] }),
      inspectWhatsAppPhone: vi.fn().mockResolvedValue({ id: "different-phone" }),
    };
    const database = { transaction: vi.fn() };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    await expect(service.connectWhatsAppCloud("workspace-a", "Loja", "5555512345", "a-token-long-enough-for-validation"))
      .rejects.toMatchObject({ status: 400 });
    expect(graph.inspectWhatsAppPhone).toHaveBeenCalledWith("5555512345", "a-token-long-enough-for-validation");
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
