import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "./auth/session.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { AuthenticatedUser } from "./auth/auth.types";
import { DatabaseService } from "./database/database.service";
import { AiClientService } from "./ai/ai-client.service";
import { IsOptional, IsString, IsNumber, Min, Max, IsIn } from "class-validator";

class RecommendationQueryDto {
  @IsOptional() @IsString() currentListingId?: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(30) limit?: number;
  @IsOptional() @IsIn(["auto", "trending", "collaborative", "content_based", "ai_personalized"])
  algorithm?: string;
}

class TrackEventDto {
  @IsString() listingId!: string;
  @IsIn(["view", "add_to_cart", "purchase", "wishlist", "search"])
  eventType!: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsString() searchQuery?: string;
}

@Controller("recommendations")
export class RecommendationsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly aiClient: AiClientService,
  ) {}

  /**
   * Get personalized product recommendations for logged-in users.
   */
  @Get()
  @UseGuards(SessionGuard)
  async getRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecommendationQueryDto,
  ) {
    // 1. Get user browsing history
    const historyRes = await this.database.query<{
      listing_id: string;
      event_type: string;
      category_slug: string | null;
    }>(
      `SELECT listing_id, event_type, category_slug
       FROM user_browsing_events
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    );

    // 2. Get purchased listing IDs
    const purchasedRes = await this.database.query<{ listing_id: string }>(
      `SELECT DISTINCT oi.listing_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.buyer_user_id = $1 AND o.status NOT IN ('cancelled')`,
      [user.id],
    );

    // 3. Call Python AI worker
    const result = await this.aiClient.request<{
      recommendations: Array<{
        listing_id: string;
        score: number;
        algorithm: string;
        reason: string;
      }>;
      algorithm_used: string;
      computation_time_ms: number;
    }>("/v1/recommendations/generate", {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        current_listing_id: query.currentListingId,
        category_slug: query.categorySlug,
        province: query.province || "Luanda",
        browsing_history: historyRes.rows.map((h) => ({
          listing_id: h.listing_id,
          event_type: h.event_type,
          category_slug: h.category_slug,
        })),
        purchased_listing_ids: purchasedRes.rows.map((r) => r.listing_id),
        limit: query.limit || 12,
        algorithm: query.algorithm || "auto",
      }),
    });

    if (!result) {
      // Fallback: return recently listed products
      const fallbackRes = await this.database.query<{
        id: string;
        title: string;
        price: string;
        slug: string;
      }>(
        `SELECT id, title, price::text, slug FROM listings
         WHERE status = 'active'
         ORDER BY created_at DESC LIMIT $1`,
        [query.limit || 12],
      );

      return {
        recommendations: fallbackRes.rows.map((l) => ({
          listing: l,
          score: 0.5,
          algorithm: "fallback_recent",
          reason: "Publicado recentemente",
        })),
        algorithmUsed: "fallback_recent",
      };
    }

    // 4. Enrich recommendations with real listing data
    const enrichedRes = await this.database.query<{
      id: string;
      title: string;
      price: string;
      slug: string;
    }>(
      `SELECT id, title, price::text, slug FROM listings
       WHERE status = 'active'
       ORDER BY created_at DESC LIMIT $1`,
      [query.limit || 12],
    );

    return {
      recommendations: enrichedRes.rows.map((l, i) => ({
        listing: l,
        score: result.recommendations[i]?.score ?? 0.5,
        algorithm: result.algorithm_used,
        reason: result.recommendations[i]?.reason ?? "Recomendado para ti",
      })),
      algorithmUsed: result.algorithm_used,
      computationTimeMs: result.computation_time_ms,
    };
  }

  /**
   * Get public recommendations (trending, no auth required).
   */
  @Get("trending")
  async getTrending(@Query("limit") limit?: string, @Query("province") province?: string) {
    const lim = Math.min(Number(limit) || 12, 30);

    const result = await this.database.query<{
      id: string;
      title: string;
      price: string;
      slug: string;
    }>(
      `SELECT id, title, price::text, slug FROM listings
       WHERE status = 'active'
       ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );

    return {
      recommendations: result.rows.map((l, i) => ({
        listing: l,
        score: 1 - i * 0.05,
        algorithm: "trending",
        reason: `Popular em ${province || "Angola"}`,
      })),
      algorithmUsed: "trending",
    };
  }

  /**
   * Track a user browsing event.
   */
  @Post("track")
  @UseGuards(SessionGuard)
  async trackEvent(@Body() body: TrackEventDto, @CurrentUser() user: AuthenticatedUser) {
    await this.database.query(
      `INSERT INTO user_browsing_events (user_id, listing_id, event_type, category_slug, search_query)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, body.listingId, body.eventType, body.categorySlug || null, body.searchQuery || null],
    );

    return { tracked: true };
  }
}
