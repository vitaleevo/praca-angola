import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { MetricsService } from "./metrics.service";

type RequestLike = { method?: string; route?: { path?: string } };
type ResponseLike = { statusCode?: number };

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();
    const method = request.method ?? "UNKNOWN";
    const route = request.route?.path ?? "unmatched";
    const record = (status: number) =>
      this.metrics.record(method, route, status, (Date.now() - started) / 1000);

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode ?? 200),
        error: (error: unknown) =>
          record(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
