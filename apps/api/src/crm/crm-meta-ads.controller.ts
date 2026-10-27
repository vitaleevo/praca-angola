import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min } from "class-validator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { RateLimit } from "../rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../rate-limit/rate-limit.guard";
import { CrmService } from "./crm.service";
import { CrmMetaAdsService, type MetaAdDraftInput } from "./crm-meta-ads.service";

class SaveMetaAdDraftDto implements MetaAdDraftInput {
  @IsString() @MaxLength(120) name!: string;
  @IsIn(["whatsapp_messages", "instagram_direct", "store_traffic", "lead_generation"]) objective!: MetaAdDraftInput["objective"];
  @IsIn(["daily", "lifetime"]) budgetType!: MetaAdDraftInput["budgetType"];
  @IsNumber() @Min(1) @Max(100000000) budgetAmount!: number;
  @IsIn(["AOA", "USD", "EUR"]) budgetCurrency!: MetaAdDraftInput["budgetCurrency"];
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) targetLocations!: string[];
  @IsInt() @Min(18) @Max(65) targetAgeMin!: number;
  @IsInt() @Min(18) @Max(65) targetAgeMax!: number;
  @IsIn(["all", "male", "female"]) targetGender!: MetaAdDraftInput["targetGender"];
  @IsString() @MaxLength(120) headline!: string;
  @IsString() @MaxLength(2200) primaryText!: string;
  @IsOptional() @IsUrl({ require_protocol: true }) destinationUrl?: string;
  @IsOptional() @IsUUID("4") listingId?: string;
}

class SelectMetaAdAccountDto {
  @IsString() @MaxLength(40) accountId!: string;
}

@Controller("crm/meta-ads")
@UseGuards(SessionGuard)
export class CrmMetaAdsController {
  constructor(private readonly crm: CrmService, private readonly ads: CrmMetaAdsService) {}

  @Get("accounts")
  @RateLimit({ scope: "crm-meta-ad-accounts", limit: 12, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async accounts(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.accounts(workspace.id);
  }

  @Post("accounts/select")
  @RateLimit({ scope: "crm-meta-ad-select", limit: 10, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async selectAccount(@Body() body: SelectMetaAdAccountDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.selectAccount(workspace.id, body.accountId);
  }

  @Get("insights")
  @RateLimit({ scope: "crm-meta-ad-insights", limit: 12, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  async insights(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.metaInsights(workspace.id);
  }

  @Get("campaigns")
  async list(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.list(workspace.id);
  }

  @Get("overview")
  async overview(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.overview(workspace.id);
  }

  @Post("campaigns")
  async create(@Body() body: SaveMetaAdDraftDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.saveDraft(workspace.id, body);
  }

  @Patch("campaigns/:id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: SaveMetaAdDraftDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crm.resolveWorkspaceForUser(user.id);
    return this.ads.saveDraft(workspace.id, body, id);
  }
}
