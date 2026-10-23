import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";

@Controller("marketplaces")
export class MarketplacesController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list() {
    const result = await this.database.query("SELECT slug, name, status, (status = 'active') AS enabled FROM marketplaces ORDER BY sort_order, name");
    return result.rows;
  }
}
