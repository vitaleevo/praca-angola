import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, MaxLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest } from "./auth.types";
import { readSessionToken, sessionCookieName } from "./auth.crypto";

class RegisterDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 100)
  @Matches(/\S/, { message: "Indica o teu nome." })
  displayName!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{12,128}$/, { message: "Usa pelo menos 12 caracteres, incluindo letras e números." })
  @MaxLength(128)
  password!: string;
}

class LoginDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

class EmailActionDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class EmailVerificationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: "O link de confirmação é inválido ou expirou." })
  token!: string;
}

class PasswordResetDto extends EmailVerificationDto {
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{12,128}$/, { message: "Usa pelo menos 12 caracteres, incluindo letras e números." })
  @MaxLength(128)
  password!: string;
}

interface CookieResponse { setHeader(name: string, value: string): void }

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(202)
  async register(@Body() body: RegisterDto) {
    await this.auth.register(body);
    return { accepted: true };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.login(body.email, body.password);
    this.setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post("email-verification-requests")
  @HttpCode(202)
  async requestEmailVerification(@Body() body: EmailActionDto): Promise<{ accepted: true }> {
    await this.auth.requestEmailVerification(body.email);
    return { accepted: true };
  }

  @Post("email-verifications")
  @HttpCode(200)
  async verifyEmail(@Body() body: EmailVerificationDto): Promise<{ verified: true }> {
    await this.auth.verifyEmail(body.token);
    return { verified: true };
  }

  @Post("password-reset-requests")
  @HttpCode(202)
  async requestPasswordReset(@Body() body: EmailActionDto): Promise<{ accepted: true }> {
    await this.auth.requestPasswordReset(body.email);
    return { accepted: true };
  }

  @Post("password-resets")
  @HttpCode(200)
  async resetPassword(@Body() body: PasswordResetDto): Promise<{ reset: true }> {
    await this.auth.resetPassword(body.token, body.password);
    return { reset: true };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse): Promise<void> {
    await this.auth.logout(readSessionToken(request.headers.cookie));
    response.setHeader("Set-Cookie", `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureFlag()}`);
  }

  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    return { user: await this.auth.getSessionUser(readSessionToken(request.headers.cookie)) };
  }

  private setSessionCookie(response: CookieResponse, token: string): void {
    response.setHeader("Set-Cookie", `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}${this.secureFlag()}`);
  }

  private secureFlag(): string {
    return process.env.NODE_ENV === "production" ? "; Secure" : "";
  }
}
