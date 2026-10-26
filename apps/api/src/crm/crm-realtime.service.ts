import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";

export interface RealtimeWorkspaceEvent {
  workspaceId: string;
  eventType: "new_message" | "deal_stage_changed" | "new_contact" | "automation_executed";
  payload: any;
  timestamp: string;
}

export interface RealtimeChatSessionEvent {
  sessionId: string;
  eventType: "visitor_message" | "ai_message" | "seller_message" | "lead_converted";
  payload: any;
  timestamp: string;
}

@Injectable()
export class CrmRealtimeService {
  private readonly logger = new Logger(CrmRealtimeService.name);
  private readonly workspaceEvent$ = new Subject<RealtimeWorkspaceEvent>();
  private readonly sessionEvent$ = new Subject<RealtimeChatSessionEvent>();

  /**
   * Broadcast an event to all connected dashboard users in a seller workspace
   */
  emitWorkspaceEvent(
    workspaceId: string,
    eventType: RealtimeWorkspaceEvent["eventType"],
    payload: any,
  ): void {
    this.logger.debug(`Realtime event for workspace ${workspaceId}: ${eventType}`);
    this.workspaceEvent$.next({
      workspaceId,
      eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast an event to a visitor's active storefront chat session
   */
  emitSessionEvent(
    sessionId: string,
    eventType: RealtimeChatSessionEvent["eventType"],
    payload: any,
  ): void {
    this.logger.debug(`Realtime event for session ${sessionId}: ${eventType}`);
    this.sessionEvent$.next({
      sessionId,
      eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Subscribe to real-time events for a specific seller workspace (SSE format)
   */
  subscribeWorkspace(workspaceId: string): Observable<{ data: RealtimeWorkspaceEvent }> {
    return this.workspaceEvent$.pipe(
      filter((evt) => evt.workspaceId === workspaceId),
      map((evt) => ({ data: evt })),
    );
  }

  /**
   * Subscribe to real-time events for a specific chat session (SSE format)
   */
  subscribeSession(sessionId: string): Observable<{ data: RealtimeChatSessionEvent }> {
    return this.sessionEvent$.pipe(
      filter((evt) => evt.sessionId === sessionId),
      map((evt) => ({ data: evt })),
    );
  }
}
