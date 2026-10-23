import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { hashPassword, hashSessionToken, verifyPassword } from "./auth.crypto";
import { AuthenticatedUser } from "./auth.types";
import { EmailService } from "./email.service";

interface AccountRow {
  id: string;
  display_name: string;
  email: string;
  password_hash: string;
  email_verified_at?: Date | null;
}

type AuthActionPurpose = "verify_email" | "reset_password";

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService, private readonly email: EmailService) {
    this.cleanupTimer = setInterval(() => {
      void this.database.query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'").catch((error: unknown) => {
        this.logger.warn(`Login attempt cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`);
      });
      void this.database.query("DELETE FROM auth_action_tokens WHERE expires_at < now() - interval '30 days'").catch((error: unknown) => {
        this.logger.warn(`Expired auth token cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`);
      });
    }, 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  async register(input: { displayName: string; email: string; password: string }): Promise<void> {
    this.email.assertConfigured();
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    try {
      const account = await this.database.transaction(async (client) => {
        const inserted = await client.query<AccountRow>(
          `INSERT INTO users (display_name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, email`,
          [displayName, email, passwordHash],
        );
        const row = inserted.rows[0];
        await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'buyer')", [row.id]);
        return { id: row.id, email: row.email };
      });
      const action = await this.createActionToken(account.id, "verify_email", 24 * 60 * 60);
      if (!action) return;
      void this.email.sendVerification(account.email, action.token).catch(() => {
        this.logger.warn("New account verification email could not be delivered.");
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        return;
      }
      throw error;
    }
  }

  async login(emailInput: string, password: string): Promise<{ user: AuthenticatedUser; token: string }> {
    const email = emailInput.trim().toLowerCase();
    const bucket = createHash("sha256").update(email).digest("hex");
    const attempts = await this.database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM login_attempts WHERE bucket_hash = $1 AND created_at > now() - interval '15 minutes'",
      [bucket],
    );
    if (Number(attempts.rows[0]?.count ?? 0) >= 10) {
      throw new HttpException({ code: "LOGIN_RATE_LIMIT", message: "Muitas tentativas. Aguarda alguns minutos e tenta novamente." }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const result = await this.database.query<AccountRow & { roles: string[] }>(
      `SELECT u.id, u.display_name, u.email, u.password_hash, u.email_verified_at, array_agg(ur.role ORDER BY ur.role) AS roles
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.email = $1 AND u.status = 'active'
       GROUP BY u.id`,
      [email],
    );
    const account = result.rows[0];
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      await this.database.query("INSERT INTO login_attempts (bucket_hash) VALUES ($1)", [bucket]);
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "E-mail ou palavra-passe inválidos." });
    }

    await this.database.query("DELETE FROM login_attempts WHERE bucket_hash = $1", [bucket]);
    if (!account.email_verified_at) {
      throw new ForbiddenException({
        code: "EMAIL_NOT_VERIFIED",
        message: "Confirma o teu e-mail antes de entrares na conta.",
      });
    }
    const user: AuthenticatedUser = { id: account.id, displayName: account.display_name, email: account.email, roles: account.roles };
    return { user, token: await this.createSession(user.id) };
  }

  async requestEmailVerification(emailInput: string): Promise<void> {
    this.email.assertConfigured();
    const email = emailInput.trim().toLowerCase();
    const account = await this.database.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email = $1 AND status = 'active' AND email_verified_at IS NULL",
      [email],
    );
    const user = account.rows[0];
    if (!user) return;
    const action = await this.createActionToken(user.id, "verify_email", 24 * 60 * 60);
    if (!action) return;
    try {
      await this.email.sendVerification(user.email, action.token);
    } catch {
      this.logger.warn("Account verification email could not be delivered.");
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashActionToken(token);
    await this.database.transaction(async (client) => {
      const action = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM auth_action_tokens
         WHERE token_hash = $1 AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      );
      const row = action.rows[0];
      if (!row) throw this.invalidActionToken();
      await client.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1", [row.user_id]);
      await client.query(
        "UPDATE auth_action_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL",
        [row.user_id],
      );
    });
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    this.email.assertConfigured();
    const email = emailInput.trim().toLowerCase();
    const account = await this.database.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email = $1 AND status = 'active'",
      [email],
    );
    const user = account.rows[0];
    if (!user) return;
    const action = await this.createActionToken(user.id, "reset_password", 30 * 60);
    if (!action) return;
    try {
      await this.email.sendPasswordReset(user.email, action.token);
    } catch {
      this.logger.warn("Password reset email could not be delivered.");
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashActionToken(token);
    const valid = await this.database.query<{ id: string }>(
      `SELECT id FROM auth_action_tokens
       WHERE token_hash = $1 AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > now()` ,
      [tokenHash],
    );
    if (!valid.rowCount) throw this.invalidActionToken();

    const passwordHash = await hashPassword(password);
    await this.database.transaction(async (client) => {
      const action = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM auth_action_tokens
         WHERE token_hash = $1 AND purpose = 'reset_password' AND consumed_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      );
      const row = action.rows[0];
      if (!row) throw this.invalidActionToken();
      await client.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, row.user_id]);
      await client.query(
        "UPDATE auth_action_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = 'reset_password' AND consumed_at IS NULL",
        [row.user_id],
      );
      await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [row.user_id]);
    });
  }

  private async createActionToken(userId: string, purpose: AuthActionPurpose, lifetimeSeconds: number): Promise<{ token: string } | null> {
    const token = randomBytes(32).toString("base64url");
    const result = await this.database.transaction(async (client) => {
      const account = await client.query<{ id: string; email_verified_at: Date | null }>(
        "SELECT id, email_verified_at FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
        [userId],
      );
      const row = account.rows[0];
      if (!row || (purpose === "verify_email" && row.email_verified_at)) return false;

      const recent = await client.query(
        `SELECT id FROM auth_action_tokens
         WHERE user_id = $1 AND purpose = $2 AND created_at > now() - interval '1 minute'
         LIMIT 1`,
        [userId, purpose],
      );
      if (recent.rowCount) return false;

      await client.query(
        "UPDATE auth_action_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL",
        [userId, purpose],
      );
      await client.query(
        `INSERT INTO auth_action_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + ($4 * interval '1 second'))`,
        [userId, purpose, this.hashActionToken(token), lifetimeSeconds],
      );
      return true;
    });
    return result ? { token } : null;
  }

  private hashActionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private invalidActionToken(): BadRequestException {
    return new BadRequestException({
      code: "INVALID_OR_EXPIRED_ACTION_TOKEN",
      message: "Este link é inválido ou expirou. Pede um novo link e tenta novamente.",
    });
  }

  async getSessionUser(token?: string): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const result = await this.database.query<{ id: string; display_name: string; email: string; roles: string[] }>(
      `SELECT u.id, u.display_name, u.email, array_agg(ur.role ORDER BY ur.role) AS roles
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN user_roles ur ON ur.user_id = u.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'
       GROUP BY u.id`,
      [hashSessionToken(token)],
    );
    const row = result.rows[0];
    return row ? { id: row.id, displayName: row.display_name, email: row.email, roles: row.roles } : null;
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    await this.database.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashSessionToken(token)]);
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.database.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '14 days')",
      [userId, hashSessionToken(token)],
    );
    return token;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
