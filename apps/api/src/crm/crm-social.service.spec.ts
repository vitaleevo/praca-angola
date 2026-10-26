import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptPrivateValue } from "../auth/auth.crypto";
import { CrmSocialService } from "./crm-social.service";

describe("CrmSocialService", () => {
  const workspaceId = "4b6ba98c-0000-4000-8000-000000000001";
  const channelId = "4b6ba98c-0000-4000-8000-000000000002";
  const database = { query: vi.fn() };
  const meta = { listSocialMedia: vi.fn(), listSocialComments: vi.fn(), replyToSocialComment: vi.fn() };
  let service: CrmSocialService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_APP_SECRET = "test-secret-only";
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-of-at-least-32-characters";
    database.query.mockResolvedValue({ rows: [{ id: channelId, channel_type: "facebook_page", account_name: "Bajaj Angola", external_account_id: "1393752373814265", credentials_ciphertext: encryptPrivateValue(JSON.stringify({ accessToken: "private-test-token" })) }] });
    service = new CrmSocialService(database as never, meta as never);
  });

  it("returns signed media references without exposing the Page token", async () => {
    meta.listSocialMedia.mockResolvedValue({ data: [{ id: "1393752373814265_123", message: "Publicação", created_time: "2026-10-26T15:00:00Z" }], paging: { cursors: { after: "NEXT123" } } });
    const result = await service.listMedia(workspaceId, channelId);
    expect(meta.listSocialMedia).toHaveBeenCalledWith("facebook_page", "1393752373814265", "private-test-token", undefined);
    expect(result.items[0].text).toBe("Publicação");
    expect(JSON.stringify(result)).not.toContain("private-test-token");
    expect(result.next).toBe("NEXT123");
  });

  it("rejects a reference used by another workspace before calling Meta", async () => {
    meta.listSocialMedia.mockResolvedValue({ data: [{ id: "1393752373814265_123" }] });
    const media = await service.listMedia(workspaceId, channelId);
    await expect(service.listComments("4b6ba98c-0000-4000-8000-000000000099", channelId, media.items[0].ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(meta.listSocialComments).not.toHaveBeenCalled();
  });

  it("requires the connected channel to belong to the workspace", async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.listMedia(workspaceId, channelId)).rejects.toBeInstanceOf(NotFoundException);
    expect(meta.listSocialMedia).not.toHaveBeenCalled();
  });

  it("allows replies only to comments obtained from the selected channel", async () => {
    meta.listSocialMedia.mockResolvedValue({ data: [{ id: "1393752373814265_123" }] });
    meta.listSocialComments.mockResolvedValue({ data: [{ id: "98765", message: "Olá" }] });
    meta.replyToSocialComment.mockResolvedValue({ id: "98765_1" });
    const media = await service.listMedia(workspaceId, channelId);
    const comments = await service.listComments(workspaceId, channelId, media.items[0].ref);
    const result = await service.reply(workspaceId, channelId, comments.items[0].ref, "Obrigado");
    expect(result.sent).toBe(true);
    expect(meta.replyToSocialComment).toHaveBeenCalledWith("facebook_page", "98765", "private-test-token", "Obrigado");
    await expect(service.reply(workspaceId, channelId, `${comments.items[0].ref}x`, "Obrigado")).rejects.toBeInstanceOf(BadRequestException);
  });
});
