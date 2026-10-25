import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { Roles } from "./auth/roles.decorator";
import { RolesGuard } from "./auth/roles.guard";
import { SessionGuard } from "./auth/session.guard";
import { ModerationAlertsService } from "./moderation-alerts.service";

class ReviewListingDto {
  @IsIn(["approved", "rejected", "paused", "removed"]) action!: "approved" | "rejected" | "paused" | "removed";
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class BulkReviewListingsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @IsIn(["approved", "rejected"])
  action!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

class ResolveReportDto {
  @IsIn(["investigating", "resolved", "dismissed"]) status!: "investigating" | "resolved" | "dismissed";
}

@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@Roles("moderator", "administrator")
export class AdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly moderationAlerts: ModerationAlertsService,
  ) {}

  @Sse("moderation/stream")
  streamModerationAlerts() {
    return this.moderationAlerts.subscribeAlerts();
  }

  @Get("listings")
  async listings() {
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.description, l.price::text, l.condition, l.province, l.municipality, l.created_at,
              COALESCE(l.ai_risk_score, 0) AS ai_risk_score,
              COALESCE(l.ai_flagged_reasons, '{}') AS ai_flagged_reasons,
              l.ai_suggested_action,
              c.name AS category, s.id AS store_id, s.display_name AS store_name, s.slug AS store_slug,
              COALESCE((SELECT json_agg(json_build_object('url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order) FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images
       FROM listings l JOIN categories c ON c.id = l.category_id JOIN seller_profiles s ON s.id = l.seller_profile_id
       WHERE l.status = 'pending_review' ORDER BY l.ai_risk_score DESC, l.created_at ASC LIMIT 100`,
    );
    return { items: result.rows };
  }

  @Patch("listings/bulk")
  async bulkReviewListings(
    @Body() body: BulkReviewListingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (body.action === "rejected" && !body.reason?.trim()) {
      throw new BadRequestException({
        code: "REJECTION_REASON_REQUIRED",
        message: "Indica o motivo da rejeição em lote para orientar os vendedores.",
      });
    }
    const status = body.action === "approved" ? "published" : "rejected";
    const reason = body.reason?.trim() ?? "";

    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE listings
         SET status = $2,
             published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
             rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
             updated_at = now()
         WHERE id = ANY($1::uuid[]) AND status = 'pending_review'
         RETURNING id`,
        [body.ids, status, reason],
      );

      for (const row of updated.rows) {
        await client.query(
          "INSERT INTO moderation_actions (listing_id, actor_id, action, reason) VALUES ($1, $2, $3, $4)",
          [row.id, user.id, body.action, reason],
        );
        await client.query(
          "INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'listing', $3)",
          [user.id, `listing.bulk_${body.action}`, row.id],
        );
      }

      return {
        updatedCount: updated.rowCount ?? 0,
        updatedIds: updated.rows.map((r) => r.id),
        action: body.action,
        status,
      };
    });
  }

  @Patch("listings/:id")
  async reviewListing(@Param("id") id: string, @Body() body: ReviewListingDto, @CurrentUser() user: AuthenticatedUser) {
    if (body.action === "rejected" && !body.reason?.trim()) throw new BadRequestException({ code: "REJECTION_REASON_REQUIRED", message: "Indica o motivo da rejeição para orientar o vendedor." });
    const status = body.action === "approved" ? "published" : body.action === "rejected" ? "rejected" : body.action === "removed" ? "archived" : body.action;
    return this.database.transaction(async (client) => {
      const listing = await client.query<{ id: string }>("UPDATE listings SET status = $2, published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END, rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END, updated_at = now() WHERE id = $1 AND status IN ('pending_review', 'published', 'paused') RETURNING id", [id, status, body.reason?.trim() ?? ""]);
      if (!listing.rowCount) throw new NotFoundException({ code: "PENDING_LISTING_NOT_FOUND", message: "Anúncio não encontrado ou já removido." });
      await client.query("INSERT INTO moderation_actions (listing_id, actor_id, action, reason) VALUES ($1, $2, $3, $4)", [id, user.id, body.action, body.reason?.trim() ?? ""]);
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'listing', $3)", [user.id, `listing.${body.action}`, id]);
      return { id, status };
    });
  }

  @Get("reports")
  async reports() {
    const result = await this.database.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at, u.display_name AS reporter,
              l.id AS listing_id, l.slug AS listing_slug, l.title AS listing_title, s.display_name AS store_name
       FROM reports r JOIN users u ON u.id = r.reporter_id JOIN listings l ON l.id = r.listing_id JOIN seller_profiles s ON s.id = l.seller_profile_id
       WHERE r.status IN ('open', 'investigating') ORDER BY r.created_at LIMIT 100`,
    );
    return { items: result.rows };
  }

  @Patch("reports/:id")
  async resolveReport(@Param("id") id: string, @Body() body: ResolveReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const report = await client.query<{ id: string; listing_id: string }>(
        `UPDATE reports SET status = $2, resolved_at = CASE WHEN $2 IN ('resolved', 'dismissed') THEN now() ELSE NULL END,
         resolved_by = CASE WHEN $2 IN ('resolved', 'dismissed') THEN $3 ELSE NULL END WHERE id = $1 AND status IN ('open', 'investigating') RETURNING id, listing_id`, [id, body.status, user.id],
      );
      if (!report.rowCount) throw new NotFoundException({ code: "REPORT_NOT_FOUND", message: "Denúncia não encontrada ou já tratada." });
      await client.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'report', $3)", [user.id, `report.${body.status}`, id]);
      return { id, status: body.status };
    });
  }

  @Get("moderation/analytics")
  async moderationAnalytics() {
    const [listingsResult, reasonsResult, fraudResult, banksResult, performanceResult] = await Promise.all([
      this.database.query(`
        SELECT
          COUNT(*)::int AS "totalListings",
          COUNT(*) FILTER (WHERE status = 'pending_review')::int AS "pendingReview",
          COUNT(*) FILTER (WHERE status = 'published')::int AS "published",
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS "rejected",
          COUNT(*) FILTER (WHERE status = 'pending_review' AND COALESCE(ai_risk_score, 0) >= 70)::int AS "highRiskPending",
          COUNT(*) FILTER (WHERE status = 'pending_review' AND COALESCE(ai_risk_score, 0) >= 40 AND COALESCE(ai_risk_score, 0) < 70)::int AS "mediumRiskPending",
          COUNT(*) FILTER (WHERE status = 'pending_review' AND COALESCE(ai_risk_score, 0) < 40)::int AS "lowRiskPending",
          COALESCE(ROUND(AVG(COALESCE(ai_risk_score, 0)) FILTER (WHERE status = 'pending_review')), 0)::int AS "avgRiskScore"
        FROM listings
      `),
      this.database.query(`
        SELECT reason, count(*)::int AS count
        FROM listings, unnest(COALESCE(ai_flagged_reasons, '{}')) AS reason
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 8
      `),
      this.database.query(`
        SELECT
          COUNT(*)::int AS "totalInspections",
          COUNT(*) FILTER (WHERE verdict = 'HIGH_RISK')::int AS "highRisk",
          COUNT(*) FILTER (WHERE verdict = 'SUSPICIOUS')::int AS "suspicious",
          COUNT(*) FILTER (WHERE verdict = 'LOW_RISK')::int AS "lowRisk",
          COUNT(*) FILTER (WHERE tampering_signs = true)::int AS "tamperingDetected",
          COALESCE(SUM(extracted_amount_aoa) FILTER (WHERE verdict IN ('HIGH_RISK', 'SUSPICIOUS')), 0)::text AS "amountProtectedAoa"
        FROM order_fraud_inspections
      `),
      this.database.query(`
        SELECT bank_detected AS bank, count(*)::int AS count
        FROM order_fraud_inspections
        WHERE bank_detected IS NOT NULL AND bank_detected != ''
        GROUP BY bank_detected
        ORDER BY count DESC
        LIMIT 6
      `),
      this.database.query(`
        SELECT
          COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ma.created_at - l.created_at)) / 60)), 0)::int AS "avgReviewTimeMinutes",
          COALESCE(ROUND(
            (COUNT(*) FILTER (WHERE (l.ai_suggested_action = 'auto_reject' AND ma.action = 'rejected') OR (l.ai_suggested_action = 'approve' AND ma.action = 'approved'))::numeric /
             NULLIF(COUNT(*) FILTER (WHERE l.ai_suggested_action IN ('auto_reject', 'approve')), 0)) * 100
          ), 100)::int AS "aiAlignmentRate",
          COUNT(ma.id)::int AS "totalActionsRecorded"
        FROM moderation_actions ma
        JOIN listings l ON l.id = ma.listing_id
      `),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      listings: listingsResult.rows[0],
      topReasons: reasonsResult.rows,
      fraud: fraudResult.rows[0],
      topBanks: banksResult.rows,
      performance: performanceResult.rows[0],
    };
  }
}
