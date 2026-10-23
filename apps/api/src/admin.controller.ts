import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { Roles } from "./auth/roles.decorator";
import { RolesGuard } from "./auth/roles.guard";
import { SessionGuard } from "./auth/session.guard";

class ReviewListingDto {
  @IsIn(["approved", "rejected", "paused", "removed"]) action!: "approved" | "rejected" | "paused" | "removed";
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class ResolveReportDto {
  @IsIn(["investigating", "resolved", "dismissed"]) status!: "investigating" | "resolved" | "dismissed";
}

@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@Roles("moderator", "administrator")
export class AdminController {
  constructor(private readonly database: DatabaseService) {}

  @Get("listings")
  async listings() {
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.description, l.price::text, l.condition, l.province, l.municipality, l.created_at,
              c.name AS category, s.id AS store_id, s.display_name AS store_name, s.slug AS store_slug,
              COALESCE((SELECT json_agg(json_build_object('url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order) FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images
       FROM listings l JOIN categories c ON c.id = l.category_id JOIN seller_profiles s ON s.id = l.seller_profile_id
       WHERE l.status = 'pending_review' ORDER BY l.created_at LIMIT 100`,
    );
    return { items: result.rows };
  }

  @Patch("listings/:id")
  async reviewListing(@Param("id") id: string, @Body() body: ReviewListingDto, @CurrentUser() user: AuthenticatedUser) {
    if (body.action === "rejected" && !body.reason?.trim()) throw new BadRequestException({ code: "REJECTION_REASON_REQUIRED", message: "Indica o motivo da rejeição para orientar o vendedor." });
    const status = body.action === "approved" ? "published" : body.action === "rejected" ? "rejected" : body.action === "removed" ? "archived" : body.action;
    return this.database.transaction(async (client) => {
      const listing = await client.query<{ id: string }>("UPDATE listings SET status = $2, published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END, rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END, updated_at = now() WHERE id = $1 AND status = 'pending_review' RETURNING id", [id, status, body.reason?.trim() ?? ""]);
      if (!listing.rowCount) throw new NotFoundException({ code: "PENDING_LISTING_NOT_FOUND", message: "Anúncio pendente não encontrado." });
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
}
