import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  live() {
    return { status: "ok", service: "praca-api" };
  }

  @Get("ready")
  async ready() {
    const report = await this.health.check();
    if (report.status !== "ok") throw new ServiceUnavailableException(report);
    return report;
  }

  @Get()
  readyAlias() {
    return this.ready();
  }
}
