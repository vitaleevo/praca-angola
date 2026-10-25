import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { CrmWebhooksController } from "./crm-webhooks.controller";

const originalSecret = process.env.META_APP_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = originalSecret;
});

describe("Meta webhook authentication", () => {
  const controller = new CrmWebhooksController({} as never, {} as never);
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
        if (sql.includes("INSERT INTO crm_messages")) insertedMessages.push(String(params[2]));
        return { rows: [] };
      }),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("channel_type = 'whatsapp_cloud'");
        return { rows: [{ workspace_id: "workspace-1" }] };
      }),
      transaction: vi.fn(async (work: (connection: typeof client) => Promise<unknown>) => work(client)),
    };
    const automations = { fireTrigger: vi.fn().mockResolvedValue(undefined) };
    const controller = new CrmWebhooksController(database as never, automations as never);

    expect(await controller.handleMetaWebhook(payload, signedRequest(payload))).toEqual({ status: "received" });
    expect(await controller.handleMetaWebhook(payload, signedRequest(payload))).toEqual({ status: "ignored" });
    expect(insertedMessages).toEqual(["Olá", "Preciso de ajuda"]);
    expect(automations.fireTrigger).toHaveBeenCalledTimes(2);
    expect(seen.size).toBe(2);
  });

  it("returns an error when persistence fails so Meta can retry", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const database = { query: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    const controller = new CrmWebhooksController(database as never, {} as never);
    await expect(controller.handleMetaWebhook(payload, signedRequest(payload)))
      .rejects.toThrow("database unavailable");
  });
});
