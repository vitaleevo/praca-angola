import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const newKey = process.env.APP_ENCRYPTION_KEY;
const previousKey = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
const args = process.argv.slice(2);

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!newKey?.trim()) {
  console.error("APP_ENCRYPTION_KEY is required");
  process.exit(1);
}

let mode = "dry-run";
let batchSize = 100;
for (const arg of args) {
  if (arg === "--dry-run" || arg === "--apply" || arg === "--verify") {
    const requested = arg.slice(2);
    if (mode !== "dry-run" && mode !== requested) {
      console.error("Use only one of --dry-run, --apply or --verify");
      process.exit(1);
    }
    mode = requested;
  } else if (arg.startsWith("--batch=")) {
    batchSize = Number(arg.slice("--batch=".length));
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}
if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error("--batch must be a positive integer");
  process.exit(1);
}
if (mode === "apply" && !previousKey?.trim()) {
  console.error("APP_ENCRYPTION_KEY_PREVIOUS is required for --apply");
  process.exit(1);
}

if (mode === "apply") {
  process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousKey;
} else if (mode === "verify") {
  // Verification must prove that the new key alone can read every row.
  delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(process.cwd(), "apps/api/dist/src/auth/auth.crypto.js"),
  join(process.cwd(), "apps/api/dist/auth/auth.crypto.js"),
  join(process.cwd(), "dist/src/auth/auth.crypto.js"),
  join(process.cwd(), "dist/auth/auth.crypto.js"),
  join(scriptDirectory, "../dist/src/auth/auth.crypto.js"),
  join(scriptDirectory, "../dist/auth/auth.crypto.js"),
];

let cryptoModule;
for (const candidate of candidates) {
  try {
    await access(candidate);
    cryptoModule = await import(pathToFileURL(candidate).href);
    break;
  } catch {
    // Try the next known build layout.
  }
}
const encrypt = cryptoModule?.encryptPrivateValue ?? cryptoModule?.default?.encryptPrivateValue;
const decrypt = cryptoModule?.decryptPrivateValue ?? cryptoModule?.default?.decryptPrivateValue;
if (typeof encrypt !== "function" || typeof decrypt !== "function") {
  console.error("Compiled auth.crypto.js not found; run corepack pnpm --filter @praca/api build first");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
let scanned = 0;
let updated = 0;
let failed = 0;

try {
  let lastId = null;
  while (true) {
    const result = lastId
      ? await pool.query(
          `SELECT id, mcx_recipient_name_ciphertext, mcx_phone_ciphertext
           FROM seller_profiles
           WHERE mcx_phone_ciphertext IS NOT NULL AND id > $1::uuid
           ORDER BY id
           LIMIT $2`,
          [lastId, batchSize],
        )
      : await pool.query(
          `SELECT id, mcx_recipient_name_ciphertext, mcx_phone_ciphertext
           FROM seller_profiles
           WHERE mcx_phone_ciphertext IS NOT NULL
           ORDER BY id
           LIMIT $1`,
          [batchSize],
        );

    if (!result.rows.length) break;
    scanned += result.rows.length;
    lastId = result.rows[result.rows.length - 1].id;

    for (const row of result.rows) {
      if (mode === "dry-run") {
        console.log(row.id);
        continue;
      }

      try {
        const phone = decrypt(row.mcx_phone_ciphertext);
        const recipientName = row.mcx_recipient_name_ciphertext
          ? decrypt(row.mcx_recipient_name_ciphertext)
          : null;

        if (mode === "apply") {
          await pool.query(
            `UPDATE seller_profiles
             SET mcx_recipient_name_ciphertext = $1,
                 mcx_phone_ciphertext = $2,
                 updated_at = now()
             WHERE id = $3`,
            [
              recipientName === null ? null : encrypt(recipientName),
              encrypt(phone),
              row.id,
            ],
          );
          updated++;
        }
      } catch (error) {
        failed++;
        console.error(`failed ${row.id}: ${error instanceof Error ? error.message : "decrypt failed"}`);
      }
    }
  }

  console.log(`scanned=${scanned} updated=${updated} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
