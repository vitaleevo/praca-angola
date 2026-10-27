import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { CrmWebhooksController } from "./crm-webhooks.controller";

const originalSecret = process.env.META_APP_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = originalSecret;
});

describe("Meta webhook authentication", () => {
  const controller = new CrmWebhooksController({} as never, {} as never, { emitWorkspaceEvent: vi.fn() } as never, {} as never);
  const rawBody = Buffer.from('{"entry":[]}');

  it("fails closed when the app secret is not configured", async () => {
    delete process.env.META_APP_SECRET;
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => undefined } as never))
      .rejects.toMatchObject({ status: 503 });
  });

  it("rejects missing and invalid signatures", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => undefined } as never))
      .rejects.toMatchObject({ status: 403 });
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => `sha256=${"0".repeat(64)}` } as never))
      .rejects.toMatchObject({ status: 403 });
  });

  it("accepts a signature over the exact request body", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const signature = createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex");
    const response = await controller.handleMetaWebhook({ entry: [] }, {
      rawBody,
      header: () => `sha256=${signature}`,
    } as never);
    expect(response).toEqual({ status: "ignored" });
  });
});

describe("Meta webhook delivery", () => {
  const payload = {
    entry: [
      { changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone-1" }, messages: [
        { id: "wamid-1", from: "244900000001", text: { body: "Olá" } },
        { id: "wamid-2", from: "244900000002", text: { body: "Preciso de ajuda" } },
      ] } }] },
    ],
  };

  function signedRequest(body: object) {
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac("sha256", process.env.META_APP_SECRET!).update(rawBody).digest("hex");
    return { rawBody, header: () => `sha256=${signature}` } as never;
  }

  it("processes every message once across webhook retries", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const seen = new Set<string>();
    const insertedMessages: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("INSERT INTO crm_meta_webhook_events")) {
          const key = String(params[0]);
          if (seen.has(key)) return { rows: [] };
          seen.add(key);
          return { rows: [{ event_key: key }] };
        }
        if (sql.includes("SELECT id FROM crm_contacts")) return { rows: [] };
        if (sql.includes("INSERT INTO crm_contacts")) return { rows: [{ id: "contact-1" }] };
        if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
        if (sql.includes("INSERT INTO crm_messages")) insertedMessages.push(String(params[3]));
        return { rows: [] };
      }),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("channel_type = 'whatsapp_cloud'");
        return { rows: [{ id: "connection-1", workspace_id: "workspace-1" }] };
      }),
      transaction: vi.fn(async (work: (connection: typeof client) => Promise<unknown>) => work(client)),
    };
    const automations = { fireTrigger: vi.fn().mockResolvedValue(undefined) };
    const controller = new CrmWebhooksController(database as never, automations as never, { emitWorkspaceEvent: vi.fn() } as never, {} as never);

    expect(await controller.handleMetaWebhook(payload, signedRequest(payload))).toEqual({ status: "received" });
    expect(await controller.handleMetaWebhook(payload, signedRequest(payload))).toEqual({ status: "ignored" });
    expect(insertedMessages).toEqual(["Olá", "Preciso de ajuda"]);
    expect(automations.fireTrigger).toHaveBeenCalledTimes(2);
    expect(seen.size).toBe(2);
  });

  it("returns an error when persistence fails so Meta can retry", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const database = { query: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    const controller = new CrmWebhooksController(database as never, {} as never, { emitWorkspaceEvent: vi.fn() } as never, {} as never);
    await expect(controller.handleMetaWebhook(payload, signedRequest(payload)))
      .rejects.toThrow("database unavailable");
  });

  it("routes Messenger and Instagram messages to the matching CRM channel and emits them live", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const realtime = { emitWorkspaceEvent: vi.fn() };
    const crmService = {
      ingestExternalMessage: vi.fn().mockResolvedValue({
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        message: { id: "message-1", content: "Olá" },
      }),
    };
    const controller = new CrmWebhooksController({} as never, {} as never, realtime as never, crmService as never);
    const messenger = {
      object: "page",
      entry: [{ id: "page-1", messaging: [{ sender: { id: "sender-1" }, message: { mid: "mid-1", text: "Olá" } }] }],
    };
    const instagram = {
      object: "instagram",
      entry: [{ id: "ig-1", messaging: [{ sender: { id: "sender-2" }, message: { mid: "mid-2", text: "Oi" } }] }],
    };

    expect(await controller.handleMetaWebhook(messenger, signedRequest(messenger))).toEqual({ status: "received" });
    expect(await controller.handleMetaWebhook(instagram, signedRequest(instagram))).toEqual({ status: "received" });
    expect(crmService.ingestExternalMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ channel: "facebook_messenger", accountId: "page-1" }));
    expect(crmService.ingestExternalMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ channel: "instagram_dm", accountId: "ig-1" }));
    expect(realtime.emitWorkspaceEvent).toHaveBeenCalledTimes(2);
  });

  it("passes only Meta-hosted image attachments into the CRM", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const crmService = { ingestExternalMessage: vi.fn().mockResolvedValue(null) };
    const controller = new CrmWebhooksController({} as never, {} as never, {} as never, crmService as never);
    const body = { object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "sender-1" }, message: {
      mid: "mid-image", attachments: [
        { type: "image", payload: { url: "https://scontent.xx.fbcdn.net/photo.jpg" } },
        { type: "image", payload: { url: "https://tracker.example/pixel.jpg" } },
      ],
    } }] }] };
    await controller.handleMetaWebhook(body, signedRequest(body));
    expect(crmService.ingestExternalMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrls: ["https://scontent.xx.fbcdn.net/photo.jpg"] }));
  });

  it("stores the WhatsApp image ID for authenticated retrieval", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const inserted: unknown[][] = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO crm_meta_webhook_events")) return { rows: [{ event_key: params[0] }] };
      if (sql.includes("SELECT id FROM crm_contacts")) return { rows: [{ id: "contact-1" }] };
      if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("INSERT INTO crm_messages")) { inserted.push(params); return { rows: [{ id: "message-1" }] }; }
      return { rows: [] };
    }) };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "connection-1", workspace_id: "workspace-1" }] }),
      transaction: vi.fn(async (work: (connection: typeof client) => Promise<unknown>) => work(client)),
    };
    const controller = new CrmWebhooksController(database as never, { fireTrigger: vi.fn().mockResolvedValue(null) } as never, { emitWorkspaceEvent: vi.fn() } as never, {} as never);
    const body = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "1234567890" }, messages: [{ id: "wamid-photo", from: "244900000001", image: { id: "123456789012", caption: "Produto" } }],
    } }] }] };
    expect(await controller.handleMetaWebhook(body, signedRequest(body))).toEqual({ status: "received" });
    expect(inserted[0][2]).toBe("image");
    expect(inserted[0][3]).toBe("Produto");
    expect(JSON.parse(String(inserted[0][4]))).toMatchObject({ media_id: "123456789012" });
  });

  it("imports coexistence history and app echoes once into the same WhatsApp conversation", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const seen = new Set<string>();
    const messages: unknown[][] = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO crm_meta_webhook_events")) {
        const key = String(params[0]);
        if (seen.has(key)) return { rows: [] };
        seen.add(key); return { rows: [{ event_key: key }] };
      }
      if (sql.includes("SELECT id FROM crm_contacts")) return { rows: [{ id: "contact-1" }] };
      if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("INSERT INTO crm_messages")) { messages.push(params); return { rows: [{ id: `message-${messages.length}`, workspace_id: "workspace-1", conversation_id: "conversation-1" }] }; }
      return { rows: [] };
    }) };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "channel-1", workspace_id: "workspace-1" }] }),
      transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)),
    };
    const controller = new CrmWebhooksController(database as never, {} as never, { emitWorkspaceEvent: vi.fn() } as never, {} as never);
    const body = { object: "whatsapp_business_account", entry: [{ changes: [
      { field: "history", value: { metadata: { phone_number_id: "1234567890", display_phone_number: "244900000000" }, history: [{ threads: [{ id: "244900000001", messages: [
        { id: "wamid-history-1", from: "244900000001", timestamp: "1739230955", type: "text", text: { body: "Olá" } },
        { id: "wamid-history-2", from: "244900000000", timestamp: "1739230970", type: "text", text: { body: "Resposta" } },
      ] }] }] } },
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: "1234567890" }, message_echoes: [
        { id: "wamid-echo-1", from: "244900000000", to: "244900000001", timestamp: "1739230980", type: "text", text: { body: "Pelo telemóvel" } },
      ] } },
    ] }] };
    expect(await controller.handleMetaWebhook(body, signedRequest(body))).toEqual({ status: "received" });
    expect(await controller.handleMetaWebhook(body, signedRequest(body))).toEqual({ status: "ignored" });
    expect(messages).toHaveLength(3);
    expect(messages.map((item) => item[2])).toEqual(["inbound", "outbound", "outbound"]);
    expect(messages.map((item) => item[4])).toEqual(["Olá", "Resposta", "Pelo telemóvel"]);
  });

  it("marks only the matching WABA channel expired when Meta disconnects it", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const database = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: "channel-1" }] }) };
    const controller = new CrmWebhooksController(database as never, {} as never, {} as never, {} as never);
    const body = { object: "whatsapp_business_account", entry: [{ id: "other-id", changes: [{ field: "account_update", value: {
      event: "PARTNER_REMOVED", waba_info: { waba_id: "123456789012" },
    } }] }] };
    expect(await controller.handleMetaWebhook(body, signedRequest(body))).toEqual({ status: "received" });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining("meta_waba_id = $1"), ["123456789012"]);
  });
});
