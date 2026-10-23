const required = ["DATABASE_URL", "WEB_ORIGIN", "APP_ENCRYPTION_KEY"];

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

  const production = env.NODE_ENV === "production";
  if (!production) return;

  const prodRequired = ["PUBLIC_SITE_URL", "SMTP_HOST", "SMTP_FROM", "MEDIA_DIR", "REDIS_URL"];
  const prodMissing = prodRequired.filter((key) => !env[key]?.trim());
  if (prodMissing.length) {
    throw new Error(`Missing production environment variables: ${prodMissing.join(", ")}`);
  }

  if (env.APP_ENCRYPTION_KEY!.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must contain at least 32 characters");
  }

  for (const key of ["PUBLIC_SITE_URL", "WEB_ORIGIN"]) {
    let url: URL;
    try {
      url = new URL(env[key]!);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }
    if (url.protocol !== "https:") throw new Error(`${key} must use https in production`);
    if (["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error(`${key} cannot point to localhost in production`);
    }
  }

  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port");
  }
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE)) {
    throw new Error("SMTP_SECURE must be true or false");
  }
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be provided together");
  }
}
