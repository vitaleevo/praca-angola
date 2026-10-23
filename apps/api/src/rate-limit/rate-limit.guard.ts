import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, RateLimitRule } from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";
import { AuthenticatedRequest } from "../auth/auth.types";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { ip?: string; body?: { email?: unknown } }>();
    const source = request.ip ?? "unknown";
    const email = typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
    const subject = rule.subject === "email" && email.length <= 254 && email.length > 0
      ? `email:${createHmac("sha256", process.env.APP_ENCRYPTION_KEY ?? "local-rate-limit")
        .update(email).digest("hex")}`
      : request.user?.id ?? `source:${source}`;
    const checks = [];
    if (rule.sourceLimit) {
      checks.push(await this.limiter.consume(
        `${rule.scope}:source:${source}`,
        rule.sourceLimit.limit,
        rule.sourceLimit.windowSeconds,
      ));
    }
    checks.push(await this.limiter.consume(
      `${rule.scope}:${subject}`,
      rule.limit,
      rule.windowSeconds,
    ));
    const blocked = checks.find((result) => !result.allowed);
    if (blocked) {
      const response = context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>();
      response.setHeader("Retry-After", String(blocked.retryAfter));
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Muitos pedidos. Aguarda antes de tentar novamente.",
          retryAfter: blocked.retryAfter,
        },
        429,
      );
    }
    return true;
  }
}
