import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { encryptPrivateValue } from "../auth/auth.crypto";
import { CrmService } from "./crm.service";

describe("CRM WhatsApp image access", () => {
  const workspaceId = "4b6ba98c-0000-4000-8000-000000000001";
  const conversationId = "4b6ba98c-0000-4000-8000-000000000002";
  const messageId = "4b6ba98c-0000-4000-8000-000000000003";

  it("does not fetch images outside the current workspace", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const graph = { downloadWhatsAppImage: vi.fn() };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    await expect(service.getWhatsAppMessageImage(workspaceId, conversationId, messageId)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query.mock.calls[0][1]).toEqual([messageId, conversationId, workspaceId]);
    expect(graph.downloadWhatsAppImage).not.toHaveBeenCalled();
  });

  it("uses the connected channel token only after checking message ownership", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-of-at-least-32-characters";
    const database = { query: vi.fn().mockResolvedValue({ rows: [{
      media_id: "123456789012", phone_number_id: "1234567890",
      credentials_ciphertext: encryptPrivateValue(JSON.stringify({ accessToken: "secret-test-token" })),
    }] }) };
    const image = { bytes: Buffer.from("picture"), mimeType: "image/jpeg" };
    const graph = { downloadWhatsAppImage: vi.fn().mockResolvedValue(image) };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    expect(await service.getWhatsAppMessageImage(workspaceId, conversationId, messageId)).toEqual(image);
    expect(graph.downloadWhatsAppImage).toHaveBeenCalledWith("123456789012", "1234567890", "secret-test-token");
  });
});
