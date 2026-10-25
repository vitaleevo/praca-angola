import { Global, Module } from "@nestjs/common";
import { AiClientService } from "./ai-client.service";
import { AiController } from "./ai.controller";
import { AuthModule } from "../auth/auth.module";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiModule {}
