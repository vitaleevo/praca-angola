import { Injectable } from "@nestjs/common";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { DatabaseService } from "./database/database.service";

export type HealthReport = {
  status: "ok" | "degraded";
  checks: { db: "ok" | "down"; outboxLagSeconds: number; media: "ok" | "down" };
};

@Injectable()
export class HealthService {
  constructor(private readonly db: DatabaseService) {}

  private async defaultMediaCheck(): Promise<void> {
    const directory = process.env.MEDIA_DIR ?? join(process.cwd(), "apps", "api", "uploads");
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK);
  }

  async check(mediaCheck: () => Promise<void> = () => this.defaultMediaCheck()): Promise<HealthReport> {
    let db: "ok" | "down" = "ok";
    let outboxLagSeconds = 0;
    let media: "ok" | "down" = "ok";

    try {
      const result = await this.db.query<{ lag: number }>(
        `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(next_attempt_at))), 0)::int AS lag
         FROM service_notification_outbox
         WHERE status IN ('pending', 'processing', 'failed')`,
      );
      outboxLagSeconds = Math.max(0, result.rows[0]?.lag ?? 0);
    } catch {
      db = "down";
    }

    try {
      await mediaCheck();
    } catch {
      media = "down";
    }

    return {
      status: db === "ok" && media === "ok" && outboxLagSeconds <= 300 ? "ok" : "degraded",
      checks: { db, outboxLagSeconds, media },
    };
  }
}
