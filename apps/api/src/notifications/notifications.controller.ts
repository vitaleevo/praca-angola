import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationChannel, NotificationProvider } from "./notifications.types";
import { SessionGuard } from "../auth/session.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

class TestSendDto {
  @IsString()
  @IsNotEmpty()
  recipientPhone!: string;

  @IsIn(["sms", "whatsapp"])
  channel!: NotificationChannel;

  @IsString()
  @IsNotEmpty()
  templateSlug!: string;

  @IsOptional()
  variables?: Record<string, any>;
}

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Webhook endpoint for provider delivery receipts (DLR)
   */
  @Post("webhooks/:provider")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Param("provider") provider: NotificationProvider, @Body() body: any) {
    return this.notificationsService.handleWebhook(provider, body);
  }

  /**
   * Admin telemetry & recent outbox inspection
   */
  @Get("telemetry")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("admin")
  async getTelemetry(@Query("limit") limit?: string) {
    const lim = Math.min(Number(limit) || 50, 100);
    return this.notificationsService.getOutboxTelemetry(lim);
  }

  /**
   * Admin test dispatch
   */
  @Post("test-send")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("admin")
  async testSend(@Body() body: TestSendDto) {
    const queued = await this.notificationsService.queueNotification({
      recipientPhone: body.recipientPhone,
      channel: body.channel,
      templateSlug: body.templateSlug,
      variables: body.variables || {},
    });

    // Immediately dispatch batch so admin doesn't need to wait for 10s timer
    const result = await this.notificationsService.dispatchPendingBatch(1);

    return {
      queuedId: queued.id,
      dispatchResult: result,
    };
  }
}
