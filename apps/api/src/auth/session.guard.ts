import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { hashSessionToken, readSessionToken } from "./auth.crypto";
import { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException({ code: "AUTH_REQUIRED", message: "Inicia sessão para continuar." });

    const result = await this.database.query<{
      id: string;
      display_name: string;
      email: string;
      roles: string[];
      session_id: string;
      active_store_id: string | null;
    }>(
      `SELECT u.id, u.display_name, u.email, s.id AS session_id, s.active_store_id, array_agg(ur.role ORDER BY ur.role) AS roles
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'
       GROUP BY u.id, s.id`,
      [hashSessionToken(token)],
    );
    const account = result.rows[0];
    if (!account) throw new UnauthorizedException({ code: "SESSION_EXPIRED", message: "A sessão expirou. Inicia sessão novamente." });

    request.user = {
      id: account.id,
      displayName: account.display_name,
      email: account.email,
      roles: account.roles,
      sessionId: account.session_id,
      activeStoreId: account.active_store_id,
    };
    return true;
  }
}
