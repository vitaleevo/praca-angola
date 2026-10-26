import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDirectory = join(root, "migrations");
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://praca:praca_local_dev@localhost:5432/praca_angola";
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const { rowCount } = await pool.query(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["praca-angola-migrations"]);
      const alreadyApplied = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (!alreadyApplied.rowCount) {
        await client.query(await readFile(join(migrationDirectory, name), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        console.log(`Applied ${name}`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error("Database migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
