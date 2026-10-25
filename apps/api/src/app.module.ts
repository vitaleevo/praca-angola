import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { MarketplacesController } from "./marketplaces.controller";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogController } from "./catalog.controller";
import { SellerController } from "./seller.controller";
import { MediaController } from "./media.controller";
import { MediaQuotaService } from "./media/media-quota.service";
import { AdminController } from "./admin.controller";
import { ConversationsController, FavoritesController, ReportsController, ReviewsController } from "./community.controller";
import { OrderMaintenanceService, OrdersController } from "./orders.controller";
import { StoreContextService } from './store-context.service';
import { StoreInvitationsService } from './store-invitations.service';
import { StoreInvitationsController } from './store-invitations.controller';
import { ServicesModule } from './services/services.module';
import { AdsController } from './ads.controller';
import { SecurityController } from "./security.controller";
import { loggerConfig } from "./observability/logging";
import { MetricsController } from "./observability/metrics.controller";
import { MetricsInterceptor } from "./observability/metrics.interceptor";
import { MetricsService } from "./observability/metrics.service";
import { RateLimitModule } from "./rate-limit/rate-limit.module";
import { PlatformOwnerController } from "./platform-owner.controller";
import { PlatformOwnerService } from "./platform-owner.service";
import { AiModule } from "./ai/ai.module";
import { CrmModule } from "./crm/crm.module";
import { RecommendationsController } from "./recommendations.controller";

import { ModerationAlertsService } from "./moderation-alerts.service";
import { NotificationsModule } from "./notifications/notifications.module";
import { LogisticsModule } from "./logistics/logistics.module";

@Module({
  imports: [LoggerModule.forRoot(loggerConfig), DatabaseModule, AuthModule, ServicesModule, RateLimitModule, AiModule, CrmModule, NotificationsModule, LogisticsModule],
  controllers: [
    HealthController,
    MetricsController,
    SecurityController,
    MarketplacesController,
    CatalogController,
    SellerController,
    MediaController,
    AdminController,
    FavoritesController,
    ConversationsController,
    ReportsController,
    ReviewsController,
    OrdersController,
    StoreInvitationsController,
    AdsController,
    PlatformOwnerController,
    RecommendationsController,
  ],
  providers: [
    OrderMaintenanceService,
    StoreContextService,
    StoreInvitationsService,
    MediaQuotaService,
    PlatformOwnerService,
    HealthService,
    MetricsService,
    ModerationAlertsService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [ModerationAlertsService],
})
export class AppModule {}
