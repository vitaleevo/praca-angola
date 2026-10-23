import { Body, Controller, HttpCode, Logger, Post, UseGuards } from "@nestjs/common";
import { RateLimit } from "./rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";

@Controller("csp-report")
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);

  @Post()
  @HttpCode(204)
  @RateLimit({ scope: "csp-report", limit: 240, windowSeconds: 60 })
  @UseGuards(RateLimitGuard)
  report(@Body() body: unknown): void {
    const report = body && typeof body === "object" && "csp-report" in body
      ? body["csp-report"] : undefined;
    const directive = report && typeof report === "object" && "violated-directive" in report
      ? report["violated-directive"] : undefined;
    this.logger.warn({ directive: typeof directive === "string" ? directive.slice(0, 80) : "unknown" }, "CSP violation");
  }
}
