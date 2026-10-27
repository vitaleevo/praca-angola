import { Module } from "@nestjs/common";
import { CrmController } from "./crm.controller";
import { CrmWebhooksController } from "./crm-webhooks.controller";
import { CrmAutomationsController } from "./crm-automations.controller";
import { StorefrontChatController } from "./storefront-chat.controller";
import { CrmService } from "./crm.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { StorefrontChatService } from "./storefront-chat.service";
import { CrmRealtimeService } from "./crm-realtime.service";
import { MetaGraphService } from "./meta-graph.service";
import { CrmSocialService } from "./crm-social.service";
import { CrmHistoryService } from "./crm-history.service";
import { CrmSocialPublishingController } from "./crm-social-publishing.controller";
import { CrmSocialPublishingService } from "./crm-social-publishing.service";
import { CrmMetaAdsController } from "./crm-meta-ads.controller";
import { CrmMetaAdsService } from "./crm-meta-ads.service";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CrmController, CrmWebhooksController, CrmAutomationsController, StorefrontChatController, CrmSocialPublishingController, CrmMetaAdsController],
  providers: [CrmService, CrmAutomationsService, StorefrontChatService, CrmRealtimeService, MetaGraphService, CrmSocialService, CrmHistoryService, CrmSocialPublishingService, CrmMetaAdsService],
  exports: [CrmService, CrmAutomationsService, StorefrontChatService, CrmRealtimeService],
})
export class CrmModule {}
