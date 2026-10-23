import { Controller, Get, Headers, NotFoundException, Res } from "@nestjs/common";
import type { Response } from "express";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async get(
    @Headers("x-metrics-token") token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected || token !== expected) throw new NotFoundException();
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    return this.metrics.metrics();
  }
}
