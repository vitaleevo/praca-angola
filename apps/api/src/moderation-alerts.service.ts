import { Injectable, Logger } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { map } from "rxjs/operators";

export interface ModerationAlert {
  id: string;
  type: "high_risk_listing" | "fraud_receipt" | "high_risk_report";
  entityId: string;
  title: string;
  riskScore?: number;
  verdict?: string;
  reasons: string[];
  suggestedAction?: string;
  timestamp: string;
}

@Injectable()
export class ModerationAlertsService {
  private readonly logger = new Logger(ModerationAlertsService.name);
  private readonly alerts$ = new Subject<ModerationAlert>();

  emitAlert(alert: Omit<ModerationAlert, "id" | "timestamp">): void {
    const fullAlert: ModerationAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.logger.warn(`🚨 Real-time moderation alert emitted [${fullAlert.type}]: ${fullAlert.title}`);
    this.alerts$.next(fullAlert);
  }

  subscribeAlerts(): Observable<{ data: ModerationAlert }> {
    return this.alerts$.pipe(
      map((alert) => ({ data: alert })),
    );
  }
}
