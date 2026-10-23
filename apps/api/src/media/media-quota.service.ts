import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type MediaAssetInput = {
  id: string;
  storageKey: string;
  mimeType: "image/webp";
  sizeBytes: number;
};

export type MediaQuotaConfig = { maxBytes: number; maxAssets: number };

const config = (): MediaQuotaConfig => ({
  maxBytes: Number(process.env.MEDIA_QUOTA_BYTES_PER_USER ?? 50 * 1024 * 1024),
  maxAssets: Number(process.env.MEDIA_QUOTA_ASSETS_PER_USER ?? 100),
});

@Injectable()
export class MediaQuotaService {
  constructor(private readonly db: DatabaseService) {}

  private get quota(): MediaQuotaConfig {
    return config();
  }

  async reserve(userId: string, asset: MediaAssetInput): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
      const usage = await client.query<{ bytes: string; count: string }>(
        `SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes, count(*)::text AS count
         FROM media_assets
         WHERE owner_user_id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      const bytes = Number(usage.rows[0]?.bytes ?? 0);
      const count = Number(usage.rows[0]?.count ?? 0);
      if (bytes + asset.sizeBytes > this.quota.maxBytes) {
        throw new PayloadTooLargeException({
          code: "MEDIA_QUOTA_EXCEEDED",
          message: "Atingiste o limite de armazenamento de imagens.",
        });
      }
      if (count + 1 > this.quota.maxAssets) {
        throw new PayloadTooLargeException({
          code: "MEDIA_QUOTA_EXCEEDED",
          message: "Atingiste o limite de imagens.",
        });
      }
      await client.query(
        `INSERT INTO media_assets (id, owner_user_id, storage_key, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [asset.id, userId, asset.storageKey, asset.mimeType, asset.sizeBytes],
      );
    });
  }

  async release(assetId: string): Promise<void> {
    await this.db.query("DELETE FROM media_assets WHERE id = $1", [assetId]);
  }
}
