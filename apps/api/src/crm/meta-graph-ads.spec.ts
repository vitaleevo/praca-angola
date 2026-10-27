import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaGraphService } from "./meta-graph.service";

afterEach(() => vi.unstubAllGlobals());

describe("Meta Graph Ads read access", () => {
  it("paginates authorized ad accounts and keeps the bearer token out of URLs", async () => {
    const responses = [
      { data: [{ id: "act_123456789", name: "Conta A", currency: "AOA", account_status: 1 }], paging: { next: "https://graph.facebook.com/next", cursors: { after: "cursor-1" } } },
      { data: [{ id: "act_987654321", name: "Conta B", currency: "USD", account_status: 2 }] },
    ];
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => responses.shift() }));
    vi.stubGlobal("fetch", fetchMock);
    const accounts = await new MetaGraphService().listAdAccounts("private-token");
    expect(accounts.map((account) => account.id)).toEqual(["act_123456789", "act_987654321"]);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("private-token");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer private-token");
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("after")).toBe("cursor-1");
  });

  it("reads account-level insights for the last 30 days without modifying campaigns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ spend: "19.25", impressions: "100", reach: "80", clicks: "3", date_start: "2026-09-28", date_stop: "2026-10-27" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new MetaGraphService().getAdAccountInsights("act_123456789", "private-token");
    expect(result).toMatchObject({ spend: "19.25", impressions: "100", reach: "80", clicks: "3" });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("date_preset")).toBe("last_30d");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
});
