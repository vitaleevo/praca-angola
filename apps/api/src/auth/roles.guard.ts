import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_ROLES } from "./roles.decorator";
import { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    const hasRequiredRole = user && required.some((role) => user.roles.includes(role));
    const ownerCanModerate = user?.roles.includes("platform_owner")
      && required.some((role) => role === "moderator" || role === "administrator");
    if (!user || (!hasRequiredRole && !ownerCanModerate)) {
      throw new ForbiddenException({ code: "ROLE_REQUIRED", message: "Não tens permissão para esta operação." });
    }
    return true;
  }
}
