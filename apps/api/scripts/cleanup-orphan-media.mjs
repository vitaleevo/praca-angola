import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "../../..");
const mediaDirectory = process.env.MEDIA_DIR ?? join(root, ".data", "uploads");
const args = process.argv.slice(2);
const apply = args.includes("--apply") && !args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 100;

if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 });

try {
  const result = await pool.query(
    `SELECT a.id, a.storage_key
     FROM media_assets a
     WHERE a.created_at < now() - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM listing_images li WHERE li.media_asset_id = a.id)
       AND NOT EXISTS (
         SELECT 1 FROM seller_profiles s
         WHERE s.logo_media_asset_id = a.id OR s.cover_media_asset_id = a.id
       )
       AND NOT EXISTS (SELECT 1 FROM professional_profiles p WHERE p.photo_asset_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM professional_portfolio pp WHERE pp.asset_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM ad_campaigns ac WHERE ac.image_asset_id = a.id)
     ORDER BY a.created_at, a.id
     LIMIT $1`,
    [limit],
  );

  let deleted = 0;
  for (const row of result.rows) {
    if (!apply) {
      console.log(`${row.id} ${row.storage_key}`);
      continue;
    }

    const safeKey = basename(row.storage_key);
    if (safeKey !== row.storage_key) {
      console.warn(`skip unsafe storage key: ${row.id}`);
      continue;
    }

    try {
      await unlink(join(mediaDirectory, safeKey));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await pool.query("DELETE FROM media_assets WHERE id = $1", [row.id]);
    deleted++;
  }

  console.log(`scanned=${result.rows.length} deleted=${deleted}`);
} finally {
  await pool.end();
}
