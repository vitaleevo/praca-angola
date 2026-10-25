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
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CrmController, CrmWebhooksController, CrmAutomationsController, StorefrontChatController],
  providers: [CrmService, CrmAutomationsService, StorefrontChatService, CrmRealtimeService, MetaGraphService],
  exports: [CrmService, CrmAutomationsService, StorefrontChatService, CrmRealtimeService],
})
export class CrmModule {}
