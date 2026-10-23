import { Injectable } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";

type PlatformOverviewRow = {
  usersActive: string;
  storesActive: string;
  productsPublished: string;
  productsAwaitingReview: string;
  professionalsPublished: string;
  professionalsAwaitingReview: string;
  ordersOpen: string;
  reportsOpen: string;
  serviceReportsOpen: string;
  adsLive: string;
  notificationsFailed: string;
};

@Injectable()
export class PlatformOwnerService {
  constructor(private readonly database: DatabaseService) {}

  async overview(): Promise<{ generatedAt: string; metrics: PlatformOverviewRow }> {
    const result = await this.database.query<PlatformOverviewRow>(`
      SELECT
        (SELECT count(*)::text FROM users WHERE status = 'active') AS "usersActive",
        (SELECT count(*)::text FROM seller_profiles WHERE status = 'active') AS "storesActive",
        (SELECT count(*)::text FROM listings WHERE status = 'published') AS "productsPublished",
        (SELECT count(*)::text FROM listings WHERE status = 'pending_review') AS "productsAwaitingReview",
        (SELECT count(*)::text FROM professional_profiles WHERE status = 'published') AS "professionalsPublished",
        (SELECT count(*)::text FROM professional_profiles WHERE status = 'pending_review') AS "professionalsAwaitingReview",
        (SELECT count(*)::text FROM orders WHERE status NOT IN ('completed', 'cancelled', 'refunded')) AS "ordersOpen",
        (SELECT count(*)::text FROM reports WHERE status IN ('open', 'investigating')) AS "reportsOpen",
        (SELECT count(*)::text FROM service_reports WHERE status IN ('open', 'investigating')) AS "serviceReportsOpen",
        (SELECT count(*)::text FROM ad_campaigns WHERE status = 'approved' AND starts_at <= now() AND ends_at > now()) AS "adsLive",
        (SELECT count(*)::text FROM service_notification_outbox WHERE status = 'failed') AS "notificationsFailed"
    `);

    return { generatedAt: new Date().toISOString(), metrics: result.rows[0] };
  }
}
