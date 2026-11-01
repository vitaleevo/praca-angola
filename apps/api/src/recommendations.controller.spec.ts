import { describe, expect, it, vi } from "vitest";
import { RecommendationsController } from "./recommendations.controller";

const user = { id: "user-1", displayName: "Buyer", email: "buyer@puvo.invalid", roles: ["user"] };
const listingA = "11111111-1111-4111-8111-111111111111";
const listingB = "22222222-2222-4222-8222-222222222222";

describe("RecommendationsController", () => {
  it("uses the real buyer column and preserves the AI recommendation ranking", async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: listingB, title: "Produto B", price: "200.00", slug: "produto-b" },
        { id: listingA, title: "Produto A", price: "100.00", slug: "produto-a" },
      ] }) };
    const aiClient = { request: vi.fn().mockResolvedValue({
      recommendations: [
        { listing_id: listingA, score: 0.95, algorithm: "content_based", reason: "A primeiro" },
        { listing_id: listingB, score: 0.80, algorithm: "content_based", reason: "B segundo" },
      ],
      algorithm_used: "content_based",
      computation_time_ms: 7,
    }) };
    const controller = new RecommendationsController(database as never, aiClient as never);

    const result = await controller.getRecommendations(user, { limit: 2 });

    expect(database.query.mock.calls[1][0]).toContain("o.buyer_id = $1");
    expect(database.query.mock.calls[1][0]).not.toContain("buyer_user_id");
    expect(database.query.mock.calls[2][0]).toContain("l.status = 'published'");
    expect(result.recommendations.map((item) => item.listing.id)).toEqual([listingA, listingB]);
    expect(result.recommendations.map((item) => item.score)).toEqual([0.95, 0.80]);
  });

  it("falls back only to published in-stock product listings", async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: listingA, title: "Produto A", price: "100.00", slug: "produto-a" }] }) };
    const aiClient = { request: vi.fn().mockResolvedValue(null) };
    const controller = new RecommendationsController(database as never, aiClient as never);

    const result = await controller.getRecommendations(user, { limit: 1, province: "Luanda" });

    const sql = database.query.mock.calls[2][0] as string;
    expect(sql).toContain("l.status = 'published'");
    expect(sql).toContain("l.available_quantity > 0");
    expect(sql).toContain("m.slug = 'produtos'");
    expect(sql).not.toContain("status = 'active'\n");
    expect(database.query.mock.calls[2][1]).toEqual([1, "Luanda"]);
    expect(result.recommendations[0].listing.id).toBe(listingA);
  });

  it("trending applies the public product availability boundary", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const controller = new RecommendationsController(database as never, {} as never);

    await controller.getTrending("6", "Benguela");

    const sql = database.query.mock.calls[0][0] as string;
    expect(sql).toContain("l.status = 'published'");
    expect(sql).toContain("m.slug = 'produtos'");
    expect(database.query.mock.calls[0][1]).toEqual([6, "Benguela"]);
  });
});
