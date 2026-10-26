import { Body, Controller, Param, Post, Query, Sse, UseGuards } from "@nestjs/common";
import { StorefrontChatService } from "./storefront-chat.service";
import { CrmRealtimeService } from "./crm-realtime.service";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";
import { RateLimit } from "../rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../rate-limit/rate-limit.guard";

/* ─── DTOs ─── */
class StartSessionDto {
  @IsUUID("4") sellerProfileId!: string;
  @IsUUID("4") visitorSessionId!: string;
  @IsOptional() @IsString() @Length(1, 100) visitorName?: string;
}

class SendChatMessageDto {
  @IsString() @Length(1, 2000) message!: string;
  @IsUUID("4") sellerProfileId!: string;
  @IsString() accessToken!: string;
}

/**
 * Public-facing storefront chatbot controller.
 * No SessionGuard required — visitors are anonymous or optionally authenticated.
 */
@Controller("storefront/chat")
export class StorefrontChatController {
  constructor(
    private readonly chatService: StorefrontChatService,
    private readonly realtimeService: CrmRealtimeService,
  ) {}

  /**
   * Real-time SSE stream for a visitor's chat session
   */
  @Sse("session/:sessionId/stream")
  @RateLimit({ scope: "storefront-chat-stream", limit: 15, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  streamSession(@Param("sessionId") sessionId: string, @Query("accessToken") accessToken: string) {
    this.chatService.verifyAccessToken(sessionId, accessToken || "");
    return this.realtimeService.subscribeSession(sessionId);
  }

  /**
   * Start or resume a chat session with a store's AI assistant.
   */
  @Post("session")
  @RateLimit({ scope: "storefront-chat-start", limit: 10, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async startSession(@Body() body: StartSessionDto) {
    const { session, messages } = await this.chatService.getOrCreateSession(
      body.sellerProfileId,
      body.visitorSessionId,
      body.visitorName,
    );
    return { session, messages, accessToken: this.chatService.issueAccessToken(session.id, body.visitorSessionId) };
  }

  /**
   * Send a message from a visitor and get an AI reply.
   */
  @Post("session/:sessionId/message")
  @RateLimit({ scope: "storefront-chat-message", limit: 12, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async sendMessage(
    @Param("sessionId") sessionId: string,
    @Body() body: SendChatMessageDto,
  ) {
    this.chatService.verifyAccessToken(sessionId, body.accessToken);
    const result = await this.chatService.sendVisitorMessage(
      sessionId,
      body.sellerProfileId,
      body.message,
    );

    // Emit live events to session listeners
    this.realtimeService.emitSessionEvent(sessionId, "visitor_message", result.visitorMsg);
    this.realtimeService.emitSessionEvent(sessionId, "ai_message", result.aiReply);
    if (result.shouldConvertToLead) {
      this.realtimeService.emitSessionEvent(sessionId, "lead_converted", {
        reason: result.conversionReason,
      });
    }

    return {
      visitorMessage: result.visitorMsg,
      aiReply: result.aiReply,
      suggestedProducts: result.suggestedProducts,
      shouldConvertToLead: result.shouldConvertToLead,
      conversionReason: result.conversionReason,
      guardrailTripped: result.guardrailTripped,
      guardrailAction: result.guardrailAction,
    };
  }

}
