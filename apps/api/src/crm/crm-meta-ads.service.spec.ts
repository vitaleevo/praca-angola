import { describe, expect, it, vi } from "vitest";
import { CrmMetaAdsService } from "./crm-meta-ads.service";

describe("CrmMetaAdsService attribution", () => {
  it("does not expose ad accounts without an authorized connection", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const meta = { listAdAccounts: vi.fn() };
    const result = await new CrmMetaAdsService(database as never, meta as never).accounts("workspace-1");
    expect(result).toEqual({ status: "permission_required", accounts: [], selected: null });
    expect(meta.listAdAccounts).not.toHaveBeenCalled();
  });

  it("rejects selecting an ad account outside the authorized set", async () => {
    const service = new CrmMetaAdsService({ query: vi.fn() } as never, {} as never);
    vi.spyOn(service, "accounts").mockResolvedValue({ status: "connected", accounts: [
      { id: "act_123456789", name: "Minha conta", currency: "AOA", accountStatus: 1 },
    ], selected: null });
    await expect(service.selectAccount("workspace-1", "act_987654321")).rejects.toThrow("não foi autorizada");
  });

  it("uses the selected account currency when returning read-only Meta insights", async () => {
    const { encryptPrivateValue } = await import("../auth/auth.crypto");
    const previous = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = "a".repeat(64);
    try {
      const database = { query: vi.fn().mockResolvedValue({ rows: [{
        access_token_ciphertext: encryptPrivateValue("test-token"), token_expires_at: null,
        selected_ad_account_id: "act_123456789", selected_ad_account_name: "Conta USD", selected_currency: "USD",
      }] }) };
      const meta = { inspectAccessToken: vi.fn().mockResolvedValue({ valid: true, appMatches: true, grantedScopes: ["ads_read"] }),
        listAdAccounts: vi.fn().mockResolvedValue([{ id: "act_123456789", name: "Conta USD", currency: "USD", accountStatus: 1 }]),
        getAdAccountInsights: vi.fn().mockResolvedValue({ spend: "10.50", impressions: "100", reach: "80", clicks: "4" }) };
      const result = await new CrmMetaAdsService(database as never, meta as never).metaInsights("workspace-1");
      expect(result).toMatchObject({ status: "connected", account: { currency: "USD" }, insights: { spend: "10.50" } });
      expect(meta.getAdAccountInsights).toHaveBeenCalledWith("act_123456789", "test-token");
    } finally {
      if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY;
      else process.env.APP_ENCRYPTION_KEY = previous;
    }
  });

  it("builds a safe product destination from a listing owned by the workspace", async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ slug: "produto-teste" }] })
      .mockResolvedValueOnce({ rows: [{ id: "draft-1", status: "draft" }] }) };
    const service = new CrmMetaAdsService(database as never, {} as never);
    await service.saveDraft("workspace-1", {
      name: "Campanha", objective: "store_traffic", budgetType: "daily", budgetAmount: 5000,
      budgetCurrency: "AOA", startsAt: "2026-10-27T12:00:00.000Z", targetLocations: ["Luanda"],
      targetAgeMin: 18, targetAgeMax: 65, targetGender: "all", headline: "Produto", primaryText: "Conhece o produto",
      listingId: "listing-1",
    });
    expect(database.query).toHaveBeenNthCalledWith(1, expect.stringContaining("l.seller_profile_id"), ["workspace-1", "listing-1"]);
    expect(database.query.mock.calls[1][1][14]).toMatch(/\/produtos\/produto-teste$/);
  });

  it("ignores non-ad referrals without touching the database", async () => {
    const database = { transaction: vi.fn() };
    const service = new CrmMetaAdsService(database as never, {} as never);
    await service.attributeReferral("workspace", "contact", { source_type: "post", source_id: "123456789" });
    await service.attributeReferral("workspace", "contact", { source_type: "ad", source_id: "invalid" });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("attributes a known ad inside one transaction", async () => {
    const client = { query: vi.fn(async (sql: string) => sql.includes("SELECT id FROM crm_meta_ad_campaigns")
      ? { rows: [{ id: "campaign-1" }] } : sql.includes("UPDATE crm_contacts")
        ? { rows: [{ meta_campaign_id: "campaign-1" }] } : { rows: [] }) };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<void>) => work(client)) };
    const service = new CrmMetaAdsService(database as never, {} as never);
    await service.attributeReferral("workspace-1", "contact-1", { source_type: "ad", source_id: "123456789" });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("meta_ad_id=$2"), ["workspace-1", "123456789"]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE crm_contacts"), ["workspace-1", "contact-1", "campaign-1", "123456789"]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO crm_deals"), ["workspace-1", "contact-1", "campaign-1"]);
  });

  it("keeps first-touch attribution when the contact belongs to another campaign", async () => {
    const client = { query: vi.fn(async (sql: string) => sql.includes("SELECT id FROM crm_meta_ad_campaigns")
      ? { rows: [{ id: "campaign-2" }] } : { rows: [] }) };
    const database = { transaction: vi.fn(async (work: (tx: typeof client) => Promise<void>) => work(client)) };
    await new CrmMetaAdsService(database as never, {} as never).attributeReferral("workspace-1", "contact-1", { source_type: "ad", source_id: "987654321" });
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO crm_deals"), expect.anything());
  });
});
