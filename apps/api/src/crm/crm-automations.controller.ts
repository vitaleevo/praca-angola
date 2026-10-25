import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CrmService } from "./crm.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";

/* ─── DTOs ─── */
class CreateAutomationRuleDto {
  @IsString() @Length(2, 200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(["new_lead", "new_message_inbound", "deal_stage_changed", "contact_idle_days", "new_deal"])
  triggerEvent!: string;
  @IsOptional() triggerConfig?: Record<string, any>;
  @IsOptional() @IsArray() conditions?: any[];
  @IsArray() actions!: any[];
  @IsOptional() @IsNumber() @Min(1) @Max(999) priority?: number;
}

class UpdateAutomationRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() triggerEvent?: string;
  @IsOptional() triggerConfig?: Record<string, any>;
  @IsOptional() @IsArray() conditions?: any[];
  @IsOptional() @IsArray() actions?: any[];
  @IsOptional() isActive?: boolean;
  @IsOptional() @IsNumber() priority?: number;
}

@Controller("crm/automations")
@UseGuards(SessionGuard)
export class CrmAutomationsController {
  constructor(
    private readonly crmService: CrmService,
    private readonly automationsService: CrmAutomationsService,
  ) {}

  @Get("rules")
  async getRules(@CurrentUser() user: AuthenticatedUser) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    const rules = await this.automationsService.getRules(ws.id);
    return { rules };
  }

  @Post("rules")
  async createRule(@Body() body: CreateAutomationRuleDto, @CurrentUser() user: AuthenticatedUser) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    const rule = await this.automationsService.createRule(ws.id, body);
    return { rule };
  }

  @Patch("rules/:id")
  async updateRule(
    @Param("id") id: string,
    @Body() body: UpdateAutomationRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    const rule = await this.automationsService.updateRule(ws.id, id, body);
    return { rule };
  }

  @Delete("rules/:id")
  async deleteRule(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    return this.automationsService.deleteRule(ws.id, id);
  }

  @Get("logs")
  async getLogs(@CurrentUser() user: AuthenticatedUser) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    const logs = await this.automationsService.getLogs(ws.id);
    return { logs };
  }

  @Post("seed-defaults")
  async seedDefaults(@CurrentUser() user: AuthenticatedUser) {
    const ws = await this.crmService.resolveWorkspaceForUser(user.id);
    const rules = await this.automationsService.seedDefaultRules(ws.id);
    return { seededRules: rules, count: rules.length };
  }
}
