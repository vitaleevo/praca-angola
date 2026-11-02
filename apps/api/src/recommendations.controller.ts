import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "./auth/session.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { AuthenticatedUser } from "./auth/auth.types";
import { DatabaseService } from "./database/database.service";
import { AiClientService } from "./ai/ai-client.service";
import { IsOptional, IsString, IsNumber, Min, Max, IsIn, IsUUID } from "class-validator";
import { Type } from "class-transformer";

class RecommendationQueryDto {
  @IsOptional() @IsUUID("4") currentListingId?: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(30) limit?: number;
  @IsOptional() @IsIn(["auto", "trending", "collaborative", "content_based", "ai_personalized"])
  algorithm?: string;
}

class TrackEventDto {
  @IsUUID("4") listingId!: string;
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
       WHERE o.buyer_id = $1 AND o.status NOT IN ('cancelled', 'refunded')`,
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
        `SELECT l.id, l.title, l.price::text, l.slug
         FROM listings l
         JOIN seller_profiles s ON s.id = l.seller_profile_id
         JOIN categories c ON c.id = l.category_id
         JOIN marketplaces m ON m.id = c.marketplace_id
         WHERE l.status = 'published' AND l.available_quantity > 0 AND s.status = 'active' AND m.slug = 'produtos'
           AND ($2::text IS NULL OR l.province = $2)
         ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC LIMIT $1`,
        [query.limit || 12, query.province ?? null],
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

    // 4. Enrich exactly the IDs returned by the recommender, preserving its ranking.
    const recommendedIds = result.recommendations.slice(0, query.limit || 12).map((item) => item.listing_id);
    const enrichedRes = recommendedIds.length ? await this.database.query<{
      id: string;
      title: string;
      price: string;
      slug: string;
    }>(
      `SELECT l.id, l.title, l.price::text, l.slug
       FROM listings l
       JOIN seller_profiles s ON s.id = l.seller_profile_id
       JOIN categories c ON c.id = l.category_id
       JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE l.id::text = ANY($1::text[]) AND l.status = 'published' AND l.available_quantity > 0
         AND s.status = 'active' AND m.slug = 'produtos'`,
      [recommendedIds],
    ) : { rows: [] as Array<{ id: string; title: string; price: string; slug: string }> };
    const listingById = new Map(enrichedRes.rows.map((listing) => [listing.id, listing]));

    return {
      recommendations: result.recommendations.slice(0, query.limit || 12).flatMap((recommendation) => {
        const listing = listingById.get(recommendation.listing_id);
        return listing ? [{
          listing,
          score: recommendation.score,
          algorithm: recommendation.algorithm || result.algorithm_used,
          reason: recommendation.reason || "Recomendado para ti",
        }] : [];
      }),
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
      `SELECT l.id, l.title, l.price::text, l.slug
       FROM listings l
       JOIN seller_profiles s ON s.id = l.seller_profile_id
       JOIN categories c ON c.id = l.category_id
       JOIN marketplaces m ON m.id = c.marketplace_id
       WHERE l.status = 'published' AND l.available_quantity > 0 AND s.status = 'active' AND m.slug = 'produtos'
         AND ($2::text IS NULL OR l.province = $2)
       ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC LIMIT $1`,
      [lim, province?.trim() || null],
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
