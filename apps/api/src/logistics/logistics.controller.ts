import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { LogisticsService } from "./logistics.service";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import {
  CourierStatus,
  VehicleType,
} from "./logistics.types";
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from "class-validator";

/* ─── DTOs ─── */
class CalculateFreightDto {
  @IsUUID("4") sellerProfileId!: string;
  @IsString() @IsNotEmpty() province!: string;
  @IsString() @IsNotEmpty() municipality!: string;
  @IsOptional() @IsNumber() @Min(0) totalCartAmount?: number;
}

class RegisterCourierDto {
  @IsUUID("4") userId!: string;
  @IsString() @Length(2, 100) fullName!: string;
  @IsString() @Length(9, 32) phone!: string;
  @IsIn(["motorcycle", "car", "van", "on_foot"]) vehicleType!: VehicleType;
  @IsOptional() @IsString() @MaxLength(32) licensePlate?: string;
}

class SelfRegisterCourierDto {
  @IsString() @Length(2, 100) fullName!: string;
  @IsString() @Length(9, 32) phone!: string;
  @IsIn(["motorcycle", "car", "van", "on_foot"]) vehicleType!: VehicleType;
  @IsOptional() @IsString() @MaxLength(32) licensePlate?: string;
}

class UpdateCourierStatusDto {
  @IsIn(["active", "offline"]) status!: CourierStatus;
}

class AssignCourierBodyDto {
  @IsOptional() @IsUUID("4") courierId?: string;
}

class VerifyDeliveryPinDto {
  @IsString() @Length(4, 4) pin!: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@Controller("logistics")
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  /**
   * Public: List all Angolan delivery zones and municipalities
   */
  @Get("zones")
  async getZones() {
    return this.logisticsService.getDeliveryZones();
  }

  /**
   * Public: Dynamic freight calculation for cart / checkout
   */
  @Post("calculate-freight")
  async calculateFreight(@Body() body: CalculateFreightDto) {
    return this.logisticsService.calculateFreight(body);
  }

  /**
   * Admin: Register new courier
   */
  @Post("couriers")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("administrator")
  async registerCourier(@Body() body: RegisterCourierDto) {
    return this.logisticsService.registerCourier(body);
  }

  @Patch("couriers/:courierId/approve")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("administrator")
  async approveCourier(@Param("courierId") courierId: string) {
    return this.logisticsService.approveCourier(courierId);
  }

  /**
   * Authenticated: List available couriers
   */
  @Get("couriers")
  @UseGuards(SessionGuard)
  async listCouriers(@Query("status") status: CourierStatus | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.listCouriers(status, user.id, user.roles.includes("administrator") || user.roles.includes("platform_owner"));
  }

  /**
   * Authenticated: Get my courier profile
   */
  @Get("courier/me")
  @UseGuards(SessionGuard)
  async getMyCourierProfile(@CurrentUser() user: AuthenticatedUser) {
    const courier = await this.logisticsService.getCourierByUserId(user.id);
    return { isCourier: Boolean(courier), courier };
  }

  /**
   * Authenticated: Self-register as courier
   */
  @Post("courier/register")
  @UseGuards(SessionGuard)
  async selfRegisterCourier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SelfRegisterCourierDto,
  ) {
    return this.logisticsService.selfRegisterCourier(user.id, body);
  }

  /**
   * Authenticated Courier: Update availability status
   */
  @Patch("courier/status")
  @UseGuards(SessionGuard)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateCourierStatusDto,
  ) {
    return this.logisticsService.updateCourierStatus(user.id, body.status);
  }

  /**
   * Authenticated Courier: List my assigned deliveries
   */
  @Get("courier/deliveries")
  @UseGuards(SessionGuard)
  async getMyDeliveries(@CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.getCourierDeliveries(user.id);
  }

  /**
   * Seller: Dispatch order and assign courier (generates buyer PIN)
   */
  @Post("orders/:orderId/assign-courier")
  @UseGuards(SessionGuard)
  async assignCourier(
    @Param("orderId") orderId: string,
    @Body() body: AssignCourierBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.logisticsService.assignCourierToOrder({
      ...body,
      orderId,
      actorUserId: user.id,
    });
  }

  /**
   * Courier: Mark store pickup
   */
  @Post("deliveries/:deliveryId/pickup")
  @UseGuards(SessionGuard)
  async courierPickup(@Param("deliveryId") deliveryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.courierPickup(deliveryId, user.id);
  }

  /**
   * Courier: Verify buyer PIN on physical delivery
   */
  @Post("deliveries/:deliveryId/verify-pin")
  @UseGuards(SessionGuard)
  async verifyPin(
    @Param("deliveryId") deliveryId: string,
    @Body() body: VerifyDeliveryPinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.logisticsService.verifyDeliveryPin({
      deliveryId,
      pin: body.pin,
      courierUserId: user.id,
      latitude: body.latitude,
      longitude: body.longitude,
      notes: body.notes,
    });
  }

  /**
   * Buyer / Seller: Real-time tracking and timeline (buyer gets PIN)
   */
  @Get("orders/:orderId/tracking")
  @UseGuards(SessionGuard)
  async getTracking(@Param("orderId") orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.logisticsService.getOrderTracking(orderId, user.id);
  }
}
