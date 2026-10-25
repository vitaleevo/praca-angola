import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly requests: Counter<"method" | "route" | "status">;
  private readonly duration: Histogram<"method" | "route" | "status">;
  private readonly outbox: Gauge;

  constructor(private readonly db: DatabaseService) {
    this.requests = new Counter({
      name: "praca_http_requests_total",
      help: "Total de pedidos HTTP",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });
    this.duration = new Histogram({
      name: "praca_http_request_duration_seconds",
      help: "Duração dos pedidos HTTP",
      labelNames: ["method", "route", "status"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.outbox = new Gauge({
      name: "praca_outbox_oldest_age_seconds",
      help: "Idade do evento mais antigo no outbox",
      registers: [this.registry],
      collect: async () => {
        const result = await this.db.query<{ lag: number }>(
          `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(n.created_at))), 0)::int AS lag
           FROM service_notification_outbox o
           JOIN service_notifications n ON n.id = o.notification_id
           WHERE o.status IN ('pending', 'processing', 'failed')`,
        );
        this.outbox.set(Math.max(0, result.rows[0]?.lag ?? 0));
      },
    });
    collectDefaultMetrics({ register: this.registry });
  }

  record(method: string, route: string, status: number, seconds: number): void {
    this.requests.inc({ method, route, status: String(status) });
    this.duration.observe({ method, route, status: String(status) }, seconds);
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
