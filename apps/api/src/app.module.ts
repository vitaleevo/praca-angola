import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health.controller";
import { MarketplacesController } from "./marketplaces.controller";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogController } from "./catalog.controller";
import { SellerController } from "./seller.controller";
import { MediaController } from "./media.controller";
import { AdminController } from "./admin.controller";
import { ConversationsController, FavoritesController, ReportsController, ReviewsController } from "./community.controller";
import { OrderMaintenanceService, OrdersController } from "./orders.controller";
import { StoreContextService } from './store-context.service';
import { StoreInvitationsService } from './store-invitations.service';
import { StoreInvitationsController } from './store-invitations.controller';
import { ServicesModule } from './services/services.module';
import { AdsController } from './ads.controller';
import { loggerConfig } from "./observability/logging";

@Module({
  imports: [LoggerModule.forRoot(loggerConfig), DatabaseModule, AuthModule, ServicesModule],
  controllers: [
    HealthController,
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
  ],
  providers: [OrderMaintenanceService, StoreContextService, StoreInvitationsService],
})
export class AppModule {}
