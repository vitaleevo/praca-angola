import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AiClientService } from "./ai-client.service";
import { SessionGuard } from "../auth/session.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";

class SuggestListingDto {
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsString() rawPrompt?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() municipality?: string;
}

class ModerateContentDto {
  @IsString() title!: string;
  @IsString() description!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsNumber() price?: number;
}

class InspectReceiptDto {
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() expectedAmountAoa?: number;
  @IsOptional() @IsString() expectedRecipientName?: string;
}

@Controller("ai")
export class AiController {
  constructor(private readonly aiClient: AiClientService) {}

  @Get("status")
  async getStatus() {
    return this.aiClient.checkHealth();
  }

  @Post("catalog/suggest")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async suggestListing(@Body() body: SuggestListingDto) {
    return this.aiClient.suggestListing(body);
  }

  @Post("moderation/check")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("moderator", "administrator")
  @HttpCode(200)
  async checkModeration(@Body() body: ModerateContentDto) {
    return this.aiClient.moderateContent(body);
  }

  @Post("fraud/inspect-receipt")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async inspectReceipt(@Body() body: InspectReceiptDto) {
    return this.aiClient.inspectReceipt(body);
  }
}
