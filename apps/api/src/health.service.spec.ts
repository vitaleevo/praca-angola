import { describe, expect, it, vi } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports ready when database, outbox and media are healthy", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1, lag: 0 }] }) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "ok",
      checks: { db: "ok", outboxLagSeconds: 0, media: "ok" },
    });
  });

  it("reports degraded when the database is down", async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error("down")) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "degraded",
      checks: { db: "down" },
    });
  });

  it("reports degraded when outbox lag exceeds five minutes", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1, lag: 600 }] }) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "degraded",
      checks: { outboxLagSeconds: 600 },
    });
  });
});
