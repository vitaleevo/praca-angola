import { Body, Controller, HttpCode, Logger, Post } from "@nestjs/common";

@Controller("csp-report")
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);

  @Post()
  @HttpCode(204)
  report(@Body() body: unknown): void {
    this.logger.warn({ csp: body }, "CSP violation");
  }
}
