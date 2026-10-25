import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Sse, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CrmService } from "./crm.service";
import { CrmRealtimeService } from "./crm-realtime.service";
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";

class MoveDealStageDto {
  @IsString() newStageId!: string;
}

class CreateContactBodyDto {
  @IsString() @Length(2, 100) fullName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsIn(["facebook_lead", "instagram", "whatsapp", "puvo_storefront", "service_request", "manual"])
  originChannel!: "facebook_lead" | "instagram" | "whatsapp" | "puvo_storefront" | "service_request" | "manual";
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() municipality?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() initialDealTitle?: string;
  @IsOptional() @IsNumber() @Min(0) initialDealValueAoa?: number;
}

class SendMessageBodyDto {
  @IsString() @Length(1, 4000) content!: string;
  @IsOptional() @IsIn(["text", "image", "audio", "document", "catalog_product", "payment_request"])
  messageType?: "text" | "image" | "audio" | "document" | "catalog_product" | "payment_request";
  @IsOptional() @IsString() mediaUrl?: string;
}

class SendProductBodyDto {
  @IsString() listingId!: string;
}

class ConnectChannelBodyDto {
  @IsIn(["facebook_page", "instagram_direct", "whatsapp_cloud", "whatsapp_instance"])
  channelType!: "facebook_page" | "instagram_direct" | "whatsapp_cloud" | "whatsapp_instance";
  @IsString() accountName!: string;
  @IsString() externalAccountId!: string;
  @IsString() credentials!: string;
}

class CompleteMetaConnectionDto {
  @IsUUID() attemptId!: string;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) pageIds!: string[];
}

class ConnectWhatsAppCloudDto {
  @IsString() @Length(2, 120) accountName!: string;
  @IsString() @Length(3, 128) phoneNumberId!: string;
  @IsString() @Length(20, 4096) accessToken!: string;
}

class SaveStoreAiConfigBodyDto {
  @IsIn(["gemini", "openai", "claude", "openrouter", "custom"])
  provider!: "gemini" | "openai" | "claude" | "openrouter" | "custom";
  @IsString() modelName!: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() customEndpointUrl?: string;
  @IsOptional() @IsString() @MaxLength(5000) systemInstructions?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() autoReplyEnabled?: boolean;
}

class CreateKnowledgeBodyDto {
  @IsString() @Length(2, 200) title!: string;
  @IsIn(["about_store", "delivery_policy", "payment_policy", "faq", "custom_doc"])
  category!: "about_store" | "delivery_policy" | "payment_policy" | "faq" | "custom_doc";
  @IsString() @Length(10, 20000) content!: string;
  @IsOptional() isActive?: boolean;
}

class SuggestReplyBodyDto {
  @IsString() conversationId!: string;
}

class TestAiBodyDto {
  @IsString() prompt!: string;
}

@Controller("crm")
@UseGuards(SessionGuard)
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    private readonly realtimeService: CrmRealtimeService,
  ) {}

  @Sse("realtime/stream")
  async streamWorkspaceEvents(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.realtimeService.subscribeWorkspace(workspace.id);
  }

  @Get("workspace")
  async getWorkspace(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return { workspace };
  }

  @Get("analytics/overview")
  async getAnalytics(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getCrmAnalytics(workspace.id);
  }

  @Get("pipeline")
  async getPipeline(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getPipeline(workspace.id);
  }

  @Patch("deals/:id/stage")
  async moveDealStage(
    @Param("id") id: string,
    @Body() body: MoveDealStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const result = await this.crmService.moveDealStage(workspace.id, id, body.newStageId);
    this.realtimeService.emitWorkspaceEvent(workspace.id, "deal_stage_changed", {
      dealId: id,
      newStageId: body.newStageId,
    });
    return result;
  }

  @Get("contacts")
  async getContacts(@CurrentUser() user: AuthenticatedUser, @Query("search") search?: string) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getContacts(workspace.id, search);
  }

  @Post("contacts")
  async createContact(@Body() body: CreateContactBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const contact = await this.crmService.createContact(workspace.id, body);
    this.realtimeService.emitWorkspaceEvent(workspace.id, "new_contact", contact);
    return { contact };
  }

  @Get("conversations")
  async getConversations(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getConversations(workspace.id);
  }

  @Get("conversations/:id/messages")
  async getMessages(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getMessages(workspace.id, id);
  }

  @Post("conversations/:id/messages")
  async sendMessage(
    @Param("id") id: string,
    @Body() body: SendMessageBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const message = await this.crmService.sendMessage(workspace.id, id, user.id, body);
    this.realtimeService.emitWorkspaceEvent(workspace.id, "new_message", message);
    return { message };
  }

  @Post("conversations/:id/send-product")
  async sendProduct(
    @Param("id") id: string,
    @Body() body: SendProductBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const message = await this.crmService.sendProductCard(workspace.id, id, user.id, body.listingId);
    this.realtimeService.emitWorkspaceEvent(workspace.id, "new_message", message);
    return { message };
  }

  @Post("conversations/:id/send-payment")
  async sendPayment(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const message = await this.crmService.sendPaymentDetails(workspace.id, id, user.id);
    this.realtimeService.emitWorkspaceEvent(workspace.id, "new_message", message);
    return { message };
  }

  @Get("channels")
  async getChannels(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getChannels(workspace.id);
  }

  @Get("meta/connect")
  async startMetaConnection(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.startMetaConnection(user.id, workspace.id);
  }

  @Get("meta/connect/preview")
  async getMetaConnectionPreview(@Query("attemptId") attemptId: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.getMetaConnectionPreview(user.id, workspace.id, attemptId);
  }

  @Post("meta/connect/complete")
  async completeMetaConnection(@Body() body: CompleteMetaConnectionDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.completeMetaConnections(user.id, workspace.id, body.attemptId, body.pageIds);
  }

  @Post("channels")
  async connectChannel(@Body() body: ConnectChannelBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const channel = await this.crmService.connectChannel(
      workspace.id,
      body.channelType,
      body.accountName,
      body.externalAccountId,
      body.credentials,
    );
    return { channel };
  }

  @Post("channels/whatsapp-cloud")
  async connectWhatsAppCloud(@Body() body: ConnectWhatsAppCloudDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const channel = await this.crmService.connectWhatsAppCloud(workspace.id, body.accountName, body.phoneNumberId, body.accessToken);
    return { channel };
  }

  @Delete("channels/:id")
  async disconnectChannel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.disconnectChannel(workspace.id, id);
  }

  @Get("ai/config")
  async getAiConfig(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const config = await this.crmService.getStoreAiConfig(workspace.id);
    return { config };
  }

  @Patch("ai/config")
  async saveAiConfig(@Body() body: SaveStoreAiConfigBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const config = await this.crmService.saveStoreAiConfig(workspace.id, body);
    return { config };
  }

  @Get("ai/knowledge")
  async getKnowledge(@CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const items = await this.crmService.getKnowledgeList(workspace.id);
    return { items };
  }

  @Post("ai/knowledge")
  async addKnowledge(@Body() body: CreateKnowledgeBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    const item = await this.crmService.addKnowledge(workspace.id, body);
    return { item };
  }

  @Delete("ai/knowledge/:id")
  async deleteKnowledge(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.deleteKnowledge(workspace.id, id);
  }

  @Post("ai/suggest-reply")
  async suggestReply(@Body() body: SuggestReplyBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.suggestReplyForConversation(workspace.id, body.conversationId);
  }

  @Post("ai/test")
  async testAi(@Body() body: TestAiBodyDto, @CurrentUser() user: AuthenticatedUser) {
    const workspace = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.crmService.testStoreAi(workspace.id, body.prompt);
  }
}
