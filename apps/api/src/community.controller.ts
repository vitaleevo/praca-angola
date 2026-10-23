import { BadRequestException, Controller, Get, Param, Post, Body, UseGuards, NotFoundException } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { DatabaseService } from "./database/database.service";
import { AuthenticatedUser } from "./auth/auth.types";
import { CurrentUser } from "./auth/current-user.decorator";
import { SessionGuard } from "./auth/session.guard";
import { RateLimit } from "./rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";

class ListingActionDto {
  @IsUUID("4") listingId!: string;
}

class ConversationDto extends ListingActionDto {
  @IsString() @Length(1, 3000) body!: string;
}

class MessageDto {
  @IsString() @Length(1, 3000) body!: string;
}

class ReportDto extends ListingActionDto {
  @IsIn(["prohibited_item", "misleading", "duplicate", "suspected_fraud", "other"]) reason!: string;
  @IsOptional() @IsString() @MaxLength(2000) details?: string;
}

class ReviewDto {
  @IsUUID("4") orderId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(1500) body?: string;
}

@Controller("favorites")
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT l.id, l.slug, l.title, l.price::text, l.currency, l.condition, l.province, l.municipality, c.name AS category,
              s.slug AS store_slug, s.display_name AS store_name,
              COALESCE((SELECT json_agg(json_build_object('url', li.image_url, 'alt', li.alt_text) ORDER BY li.sort_order) FROM listing_images li WHERE li.listing_id = l.id), '[]'::json) AS images,
              f.created_at AS favorited_at
       FROM favorites f JOIN listings l ON l.id = f.listing_id JOIN categories c ON c.id = l.category_id JOIN seller_profiles s ON s.id = l.seller_profile_id
       WHERE f.user_id = $1 AND l.status = 'published' AND l.available_quantity > 0 AND s.status = 'active' ORDER BY f.created_at DESC`,
      [user.id],
    );
    return { items: result.rows };
  }

  @Post()
  @RateLimit({ scope: "favorite", limit: 60, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async add(@Body() body: ListingActionDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `INSERT INTO favorites (user_id, listing_id)
       SELECT $1, l.id FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id
       WHERE l.id = $2 AND l.status = 'published' AND l.available_quantity > 0 AND s.status = 'active'
       ON CONFLICT (user_id, listing_id) DO NOTHING RETURNING listing_id`,
      [user.id, body.listingId],
    );
    if (!result.rowCount) {
      const exists = await this.database.query("SELECT 1 FROM favorites WHERE user_id = $1 AND listing_id = $2", [user.id, body.listingId]);
      if (!exists.rowCount) throw new NotFoundException({ code: "LISTING_NOT_FOUND", message: "Produto indisponível." });
    }
    return { saved: true };
  }

  @Post("remove")
  @RateLimit({ scope: "favorite", limit: 60, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async remove(@Body() body: ListingActionDto, @CurrentUser() user: AuthenticatedUser) {
    await this.database.query("DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2", [user.id, body.listingId]);
    return { saved: false };
  }
}

@Controller("conversations")
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT c.id, c.status, c.updated_at, l.id AS listing_id, l.slug AS listing_slug, l.title AS listing_title,
              CASE WHEN c.buyer_id = $1 THEN s.display_name ELSE buyer.display_name END AS other_party,
              (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread_count
       FROM conversations c JOIN listings l ON l.id = c.listing_id JOIN seller_profiles s ON s.id = c.seller_profile_id JOIN users buyer ON buyer.id = c.buyer_id
       WHERE c.buyer_id = $1 OR EXISTS (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = c.seller_profile_id AND sm.user_id = $1)
       ORDER BY c.updated_at DESC LIMIT 100`,
      [user.id],
    );
    return { items: result.rows };
  }

  @Post()
  @RateLimit({ scope: "conversation-start", limit: 10, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async start(@Body() body: ConversationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const listing = await client.query<{ seller_profile_id: string; owner_user_id: string }>(
        `SELECT l.seller_profile_id, s.owner_user_id FROM listings l JOIN seller_profiles s ON s.id = l.seller_profile_id
         WHERE l.id = $1 AND l.status = 'published' AND s.status = 'active'`, [body.listingId],
      );
      if (!listing.rowCount) throw new NotFoundException({ code: "LISTING_NOT_FOUND", message: "Produto indisponível." });
      if (listing.rows[0].owner_user_id === user.id) throw new BadRequestException({ code: "OWN_LISTING", message: "Não podes iniciar uma conversa com a tua própria loja." });
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO conversations (listing_id, buyer_id, seller_profile_id) VALUES ($1, $2, $3)
         ON CONFLICT (listing_id, buyer_id) DO UPDATE SET status = 'open', updated_at = now() RETURNING id`,
        [body.listingId, user.id, listing.rows[0].seller_profile_id],
      );
      const message = await client.query<{ id: string }>(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id",
        [conversation.rows[0].id, user.id, body.body.trim()],
      );
      await client.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversation.rows[0].id]);
      return { conversationId: conversation.rows[0].id, messageId: message.rows[0].id };
    });
  }

  @Get(":id/messages")
  async messages(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const access = await this.database.query(
      `SELECT 1 FROM conversations c WHERE c.id = $1 AND (c.buyer_id = $2 OR EXISTS
       (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = c.seller_profile_id AND sm.user_id = $2))`, [id, user.id],
    );
    if (!access.rowCount) throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversa não encontrada." });
    await this.database.query("UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL", [id, user.id]);
    const result = await this.database.query(
      "SELECT id, sender_id, body, created_at, read_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 500", [id],
    );
    return { items: result.rows };
  }

  @Post(":id/messages")
  @RateLimit({ scope: "message", limit: 30, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async sendMessage(@Param("id") id: string, @Body() body: MessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const access = await client.query<{ id: string }>(
        `SELECT c.id FROM conversations c WHERE c.id = $1 AND c.status = 'open' AND (c.buyer_id = $2 OR EXISTS
         (SELECT 1 FROM store_memberships sm WHERE sm.seller_profile_id = c.seller_profile_id AND sm.user_id = $2)) FOR UPDATE`, [id, user.id],
      );
      if (!access.rowCount) throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversa não encontrada ou encerrada." });
      const message = await client.query<{ id: string; created_at: Date }>("INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at", [id, user.id, body.body.trim()]);
      await client.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [id]);
      return message.rows[0];
    });
  }
}

@Controller("reports")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly database: DatabaseService) {}

  @Post()
  @RateLimit({ scope: "report", limit: 5, windowSeconds: 3600 })
  @UseGuards(RateLimitGuard)
  async create(@Body() body: ReportDto, @CurrentUser() user: AuthenticatedUser) {
    try {
      const result = await this.database.query<{ id: string }>(
        `INSERT INTO reports (reporter_id, listing_id, reason, details)
         SELECT $1, l.id, $3, $4 FROM listings l WHERE l.id = $2 AND l.status IN ('published', 'pending_review', 'paused')
         RETURNING id`, [user.id, body.listingId, body.reason, body.details?.trim() ?? ""],
      );
      if (!result.rowCount) throw new NotFoundException({ code: "LISTING_NOT_FOUND", message: "Anúncio não encontrado." });
      return { id: result.rows[0].id, status: "open" };
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") throw new BadRequestException({ code: "REPORT_ALREADY_OPEN", message: "Já enviaste uma denúncia que está a ser analisada." });
      throw error;
    }
  }
}

@Controller("reviews")
@UseGuards(SessionGuard)
export class ReviewsController {
  constructor(private readonly database: DatabaseService) {}

  @Post()
  @RateLimit({ scope: "review", limit: 10, windowSeconds: 3600 })
  @UseGuards(RateLimitGuard)
  async create(@Body() body: ReviewDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.database.query(
      `INSERT INTO reviews (order_id, author_id, seller_profile_id, rating, body)
       SELECT o.id, o.buyer_id, o.seller_profile_id, $3, $4 FROM orders o
       WHERE o.id = $1 AND o.buyer_id = $2 AND o.status = 'completed'
       ON CONFLICT (order_id) DO NOTHING RETURNING id`, [body.orderId, user.id, body.rating, body.body?.trim() ?? ""],
    );
    if (!result.rowCount) throw new BadRequestException({ code: "REVIEW_NOT_ALLOWED", message: "Só podes avaliar uma encomenda concluída, uma vez." });
    return { id: result.rows[0].id };
  }
}
