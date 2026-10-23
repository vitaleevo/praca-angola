import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "./auth/roles.decorator";
import { RolesGuard } from "./auth/roles.guard";
import { SessionGuard } from "./auth/session.guard";
import { PlatformOwnerService } from "./platform-owner.service";

@Controller("platform-owner")
@UseGuards(SessionGuard, RolesGuard)
@Roles("platform_owner")
export class PlatformOwnerController {
  constructor(private readonly platformOwner: PlatformOwnerService) {}

  @Get("overview")
  overview() {
    return this.platformOwner.overview();
  }
}
