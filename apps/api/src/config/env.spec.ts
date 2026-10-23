import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://praca:secret@postgres:5432/praca_angola",
  WEB_ORIGIN: "https://marketplace.example",
  PUBLIC_SITE_URL: "https://marketplace.example",
  APP_ENCRYPTION_KEY: "a".repeat(32),
  SMTP_HOST: "smtp.example",
  SMTP_PORT: "587",
  SMTP_FROM: "Praça Angola <no-reply@marketplace.example>",
  SMTP_SECURE: "false",
  MEDIA_DIR: "/app/apps/api/uploads",
  REDIS_URL: "redis://redis:6379",
};

describe("validateEnv", () => {
  it("accepts a complete production environment", () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it("rejects a missing SMTP host", () => {
    expect(() => validateEnv({ ...production, SMTP_HOST: "" })).toThrow(/SMTP_HOST/);
  });

  it("rejects a localhost public URL in production", () => {
    expect(() => validateEnv({ ...production, PUBLIC_SITE_URL: "http://localhost:3200" }))
      .toThrow(/PUBLIC_SITE_URL/);
  });

  it("rejects a short encryption key in production", () => {
    expect(() => validateEnv({ ...production, APP_ENCRYPTION_KEY: "short" }))
      .toThrow(/32/);
  });

  it("rejects SMTP user without password", () => {
    expect(() => validateEnv({ ...production, SMTP_USER: "user" }))
      .toThrow(/SMTP_PASSWORD/);
  });

  it("rejects an invalid SMTP_SECURE flag", () => {
    expect(() => validateEnv({ ...production, SMTP_SECURE: "yes" }))
      .toThrow(/SMTP_SECURE/);
  });
});
