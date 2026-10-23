import { Pool } from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const confirmed = process.argv.includes("--confirm-once");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !confirmed) {
  console.error("Usage: pnpm --filter @puvo/api platform-owner:bootstrap <verified-account-email> --confirm-once");
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["puvo-platform-owner-bootstrap"]);

  const account = await client.query(
    `SELECT id FROM users
     WHERE email = $1 AND status = 'active' AND email_verified_at IS NOT NULL
     FOR UPDATE`,
    [email],
  );
  if (!account.rowCount) throw new Error("An active account with a verified email was not found.");

  const existingOwner = await client.query("SELECT 1 FROM user_roles WHERE role = 'platform_owner' LIMIT 1");
  if (existingOwner.rowCount) throw new Error("Platform owner bootstrap was already completed.");

  const userId = account.rows[0].id;
  await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'platform_owner')", [userId]);
  await client.query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
     VALUES (NULL, 'platform_owner.bootstrap_cli', 'user', $1, $2::jsonb)`,
    [userId, JSON.stringify({ source: "one_time_cli", verifiedAccount: true })],
  );
  await client.query("COMMIT");
  console.log("Platform owner access granted to the verified account.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Platform owner bootstrap failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
