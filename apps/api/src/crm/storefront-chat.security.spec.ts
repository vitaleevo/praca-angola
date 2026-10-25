import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { StorefrontChatService } from "./storefront-chat.service";

describe("Storefront chat access", () => {
  const key = "chat-test-encryption-key-with-enough-entropy";

  it("binds an expiring access token to one session", () => {
    process.env.APP_ENCRYPTION_KEY = key;
    const service = new StorefrontChatService({} as any, {} as any);
    const token = service.issueAccessToken("session-a", "visitor-a");
    expect(() => service.verifyAccessToken("session-a", token)).not.toThrow();
    expect(() => service.verifyAccessToken("session-b", token)).toThrow(ForbiddenException);
    expect(() => service.verifyAccessToken("session-a", "visitor-a.0.invalid")).toThrow(ForbiddenException);
    expect(() => service.verifyAccessToken("session-a", undefined)).toThrow(ForbiddenException);
  });

  it("rejects a message when session and store do not match before writing", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const service = new StorefrontChatService({ query } as any, {} as any);
    await expect(service.sendVisitorMessage("session-a", "store-b", "Olá")).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
