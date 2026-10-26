import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptPrivateValue } from "../auth/auth.crypto";
import { CrmHistoryService } from "./crm-history.service";

describe("CrmHistoryService", () => {
  const workspaceId = "4b6ba98c-0000-4000-8000-000000000001";
  const channelId = "4b6ba98c-0000-4000-8000-000000000002";
  const database = { query: vi.fn(), transaction: vi.fn() };
  const graph = { listConversationHistory: vi.fn(), listConversationMessages: vi.fn() };
  const service = new CrmHistoryService(database as never, graph as never);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_APP_SECRET = "test-secret";
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-of-at-least-32-characters";
    database.query.mockResolvedValue({ rows: [{ channel_type: "facebook_page", external_account_id: "1234567890", credentials_ciphertext: encryptPrivateValue(JSON.stringify({ accessToken: "test-page-token" })) }] });
  });

  it("checks workspace ownership before requesting Meta history", async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.importPage(workspaceId, channelId)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query.mock.calls[0][1]).toEqual([channelId, workspaceId]);
    expect(graph.listConversationHistory).not.toHaveBeenCalled();
  });

  it("imports both directions at original timestamps without unread or automation side effects", async () => {
    graph.listConversationHistory.mockResolvedValue({ pageId: "1234567890", conversations: [{ id: "t_123", participants: { data: [{ id: "1234567890" }, { id: "customer-1", name: "Cliente" }] } }], next: "next-conversation" });
    graph.listConversationMessages.mockResolvedValue({ messages: [
      { id: "mid-2", from: { id: "1234567890" }, message: "Resposta", created_time: "2026-10-20T10:05:00Z" },
      { id: "mid-1", from: { id: "customer-1" }, message: "Olá", created_time: "2026-10-20T10:00:00Z" },
    ], next: "next-message" });
    const inserted: Array<{ sql: string; params: unknown[] }> = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT contact_id")) return { rows: [{ contact_id: "contact-1" }] };
      if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("SELECT 1 FROM crm_messages")) return { rows: [] };
      if (sql.includes("INSERT INTO crm_meta_webhook_events")) return { rows: [{ event_key: params[0] }] };
      if (sql.includes("INSERT INTO crm_messages")) inserted.push({ sql, params });
      return { rows: [] };
    }) };
    database.transaction.mockImplementation((work) => work(client));
    const result = await service.importPage(workspaceId, channelId);
    expect(result).toMatchObject({ conversations: 1, messages: 2 });
    expect(result.next).toBeTruthy();
    expect(inserted.map((item) => item.params[2])).toEqual(["inbound", "outbound"]);
    expect(inserted.map((item) => item.params[7])).toEqual(["2026-10-20T10:00:00.000Z", "2026-10-20T10:05:00.000Z"]);
    expect(inserted[0].sql).toContain("'delivered'");
    expect(client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO crm_conversations"))?.[0]).toContain("unread_count");
    await expect(service.importPage("other-workspace", channelId, result.next!)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("skips messages already stored from CRM sends or webhooks", async () => {
    graph.listConversationHistory.mockResolvedValue({ pageId: "1234567890", conversations: [{ id: "t_123", participants: { data: [{ id: "1234567890" }, { id: "customer-1" }] } }] });
    graph.listConversationMessages.mockResolvedValue({ messages: [{ id: "mid-1", from: { id: "1234567890" }, message: "Já enviada", created_time: "2026-10-20T10:00:00Z" }] });
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT contact_id")) return { rows: [{ contact_id: "contact-1" }] };
      if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("SELECT 1 FROM crm_messages")) return { rows: params[2] === "outbound" ? [{ "?column?": 1 }] : [] };
      return { rows: [] };
    }) };
    database.transaction.mockImplementation((work) => work(client));
    const result = await service.importPage(workspaceId, channelId);
    expect(result.messages).toBe(0);
    const duplicateCheck = client.query.mock.calls.find(([sql]) => String(sql).includes("SELECT 1 FROM crm_messages"));
    expect(duplicateCheck?.[0]).toContain("interval '3 seconds'");
    expect(duplicateCheck?.[1]).toEqual(["conversation-1", "mid-1", "outbound", "Já enviada", "2026-10-20T10:00:00.000Z"]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO crm_messages"))).toBe(false);
  });

  it("imports an image-only message from a trusted Meta attachment URL", async () => {
    graph.listConversationHistory.mockResolvedValue({ pageId: "1234567890", conversations: [{ id: "t_123", participants: { data: [{ id: "1234567890" }, { id: "customer-1" }] } }] });
    graph.listConversationMessages.mockResolvedValue({ messages: [{ id: "mid-image", from: { id: "customer-1" }, created_time: "2026-10-20T10:00:00Z",
      attachments: { data: [{ image_data: { url: "https://scontent.fbcdn.net/photo.jpg" } }, { image_data: { url: "https://not-meta.example/photo.jpg" } }] } }] });
    let messageParams: unknown[] = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT contact_id")) return { rows: [{ contact_id: "contact-1" }] };
      if (sql.includes("INSERT INTO crm_conversations")) return { rows: [{ id: "conversation-1" }] };
      if (sql.includes("INSERT INTO crm_meta_webhook_events")) return { rows: [{ event_key: params[0] }] };
      if (sql.includes("INSERT INTO crm_messages")) messageParams = params;
      return { rows: [] };
    }) };
    database.transaction.mockImplementation((work) => work(client));
    const result = await service.importPage(workspaceId, channelId);
    expect(result.messages).toBe(1);
    expect(messageParams[3]).toBe("image");
    expect(messageParams[5]).toBe("https://scontent.fbcdn.net/photo.jpg");
    expect(JSON.parse(String(messageParams[6])).image_urls).toEqual(["https://scontent.fbcdn.net/photo.jpg"]);
  });
});
