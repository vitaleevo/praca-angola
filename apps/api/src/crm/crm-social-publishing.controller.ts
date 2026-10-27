import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayUnique, IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { RateLimit } from "../rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../rate-limit/rate-limit.guard";
import { CrmService } from "./crm.service";
import { CrmSocialPublishingService } from "./crm-social-publishing.service";

class SaveSocialPostDto {
  @IsArray() @ArrayMaxSize(2) @ArrayUnique() @IsUUID("4", { each: true }) channelIds!: string[];
  @IsString() @MaxLength(2200) content!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) mediaUrls!: string[];
  @IsOptional() @IsUUID("4") listingId?: string;
}

class ScheduleSocialPostDto {
  @IsISO8601() scheduledFor!: string;
}

@Controller("crm/social/studio")
@UseGuards(SessionGuard)
export class CrmSocialPublishingController {
  constructor(private readonly crm: CrmService, private readonly publishing: CrmSocialPublishingService) {}

  @Get("posts")
  async list(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.list(workspace.id);
  }

  @Post("posts")
  async create(@Body() body: SaveSocialPostDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.saveDraft(workspace.id, body);
  }

  @Patch("posts/:id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: SaveSocialPostDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.saveDraft(workspace.id, body, id);
  }

  @Post("posts/:id/schedule")
  async schedule(@Param("id", ParseUUIDPipe) id: string, @Body() body: ScheduleSocialPostDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.schedule(workspace.id, id, body.scheduledFor);
  }

  @Post("posts/:id/publish")
  @RateLimit({ scope: "crm-social-publish", limit: 5, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async publish(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.publishNow(workspace.id, id);
  }

  @Delete("posts/:id")
  async cancel(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.publishing.cancel(workspace.id, id);
  }
}
