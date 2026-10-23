import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
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
      .getRequest<AuthenticatedRequest & { ip?: string }>();
    const subject = request.user?.id ?? request.ip ?? "anonymous";
    const result = await this.limiter.consume(
      `${rule.scope}:${subject}`,
      rule.limit,
      rule.windowSeconds,
    );
    if (!result.allowed) {
      const response = context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>();
      response.setHeader("Retry-After", String(result.retryAfter));
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Muitos pedidos. Aguarda antes de tentar novamente.",
          retryAfter: result.retryAfter,
        },
        429,
      );
    }
    return true;
  }
}
