import { describe, expect, it, vi } from "vitest";
import { MediaQuotaService } from "./media-quota.service";

describe("MediaQuotaService", () => {
  it("rejects an upload that exceeds the byte quota", async () => {
    const db = {
      transaction: vi.fn(async (work: (client: unknown) => Promise<void>) =>
        work({
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ bytes: String(49 * 1024 * 1024), count: "1" }] })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const service = new MediaQuotaService(db as never);
    await expect(
      service.reserve("user-1", {
        id: "asset-1",
        storageKey: "asset-1.webp",
        mimeType: "image/webp",
        sizeBytes: 2 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("accepts an upload within the quota", async () => {
    const db = {
      transaction: vi.fn(async (work: (client: unknown) => Promise<void>) =>
        work({
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ bytes: "0", count: "0" }] })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const service = new MediaQuotaService(db as never);
    await expect(
      service.reserve("user-1", {
        id: "asset-1",
        storageKey: "asset-1.webp",
        mimeType: "image/webp",
        sizeBytes: 1024,
      }),
    ).resolves.toBeUndefined();
  });
});
