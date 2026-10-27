import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import * as Sentry from "@sentry/node";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env";
import { SentryExceptionFilter } from "./observability/sentry.filter";

validateEnv();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  // Coexistence history webhooks can contain several threads in one signed payload.
  app.useBodyParser("json", { limit: "2mb", type: ["application/json", "application/csp-report"] });
  app.useGlobalFilters(new SentryExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.setGlobalPrefix("api/v1");
  const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3100").split(",").map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Accept"] });
  app.use((request: { path?: string }, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (request.path?.startsWith("/api/v1/auth/")) response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
