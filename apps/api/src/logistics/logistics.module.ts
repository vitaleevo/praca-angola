import { Module } from "@nestjs/common";
import { LogisticsService } from "./logistics.service";
import { LogisticsController } from "./logistics.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LogisticsController],
  providers: [LogisticsService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
