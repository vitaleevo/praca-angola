import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailService } from "./email.service";
import { SessionGuard } from "./session.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailService, SessionGuard, RolesGuard],
  exports: [AuthService, EmailService, SessionGuard, RolesGuard],
})
export class AuthModule {}
