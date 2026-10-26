import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { MockDriver } from "./drivers/mock.driver";
import { TwilioDriver } from "./drivers/twilio.driver";
import { WhatsAppCloudApiDriver } from "./drivers/whatsapp-cloud.driver";
import { AngolaSmsGatewayDriver } from "./drivers/angola-sms.driver";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MockDriver,
    TwilioDriver,
    WhatsAppCloudApiDriver,
    AngolaSmsGatewayDriver,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
