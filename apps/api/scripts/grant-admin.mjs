import { Pool } from "pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm --filter @puvo/api admin:grant <account-email>");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(
    `INSERT INTO user_roles (user_id, role)
     SELECT id, 'administrator' FROM users WHERE email = $1 AND status = 'active'
     ON CONFLICT DO NOTHING`,
    [email],
  );
  if (result.rowCount !== 1) {
    const account = await pool.query("SELECT id FROM users WHERE email = $1 AND status = 'active'", [email]);
    if (!account.rowCount) throw new Error("Active account not found");
    console.log("Account already has the administrator role.");
  } else {
    console.log(`Administrator access granted to ${email}.`);
  }
} catch (error) {
  console.error("Could not grant administrator access:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
