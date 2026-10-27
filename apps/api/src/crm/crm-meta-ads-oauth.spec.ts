import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmService } from "./crm.service";
import { decryptPrivateValue } from "../auth/auth.crypto";

const priorKey = process.env.APP_ENCRYPTION_KEY;
afterEach(() => {
  if (priorKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = priorKey;
});

describe("Meta Ads authorization", () => {
  it.each([
    { scopes: ["pages_show_list", "ads_read"], stored: true },
    { scopes: ["pages_show_list"], stored: false },
  ])("stores the encrypted user token only when ads_read is granted: $stored", async ({ scopes, stored }) => {
    process.env.APP_ENCRYPTION_KEY = "test-ads-encryption-key-long-enough";
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "attempt-1", user_id: "user-1" }] })
      .mockResolvedValueOnce({ rows: [] }) };
    const graph = {
      exchangeCodeForPages: vi.fn().mockResolvedValue({ pages: [{ id: "page-1", name: "Loja", pageAccessToken: "page-secret" }], userToken: "private-user-token" }),
      inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, expiresAt: 1800000000, grantedScopes: scopes }),
    };
    await new CrmService(database as never, {} as never, {} as never, graph as never).finishMetaAuthorization("state-1", "code-1");
    const args = database.query.mock.calls[1][1] as Array<string | null>;
    expect(args[1]).not.toContain("page-secret");
    if (stored) {
      expect(args[2]).not.toContain("private-user-token");
      expect(JSON.parse(decryptPrivateValue(args[2]!))).toMatchObject({ accessToken: "private-user-token" });
    } else expect(args[2]).toBeNull();
  });
});
