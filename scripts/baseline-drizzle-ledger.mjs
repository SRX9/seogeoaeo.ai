/**
 * One-off: baseline the Drizzle migration ledger.
 *
 * This database's schema was created with `db:push`, so `drizzle.__drizzle_migrations`
 * is empty and `drizzle-kit migrate` tries to replay the whole history (which errors
 * on already-existing constraints). This script records migrations 0000–0008 as
 * already-applied, leaving 0009_multi_brand for `db:migrate` to apply (with its backfill).
 *
 * Run:  node ./scripts/baseline-drizzle-ledger.mjs
 * Then: npm run db:migrate
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "drizzle", "migrations");

// The migration we still want `db:migrate` to apply (do NOT baseline this one).
const TARGET_TAG = "0009_multi_brand";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  let envText = "";
  try {
    envText = readFileSync(path.join(root, ".env"), "utf8");
  } catch {
    return undefined;
  }
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (match) {
      let value = match[1];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    }
  }
  return undefined;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL not found in environment or .env");
    process.exit(1);
  }

  const journal = JSON.parse(
    readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
  );
  const toBaseline = journal.entries
    .filter((entry) => entry.tag !== TARGET_TAG)
    .sort((a, b) => a.when - b.when);

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );

    const existing = await sql`select hash, created_at from drizzle.__drizzle_migrations`;
    const existingHashes = new Set(existing.map((row) => row.hash));
    if (existing.length > 0) {
      const maxCreatedAt = existing.reduce((max, row) => Math.max(max, Number(row.created_at)), 0);
      console.log(`Ledger already has ${existing.length} row(s) (max created_at=${maxCreatedAt}).`);
    }

    let inserted = 0;
    for (const entry of toBaseline) {
      const fileContent = readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
      const hash = createHash("sha256").update(fileContent).digest("hex");
      if (existingHashes.has(hash)) continue;
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${entry.when})`;
      inserted += 1;
      console.log(`  baselined ${entry.tag} (created_at=${entry.when})`);
    }

    console.log(
      `\nDone. Baselined ${inserted} migration(s). 'npm run db:migrate' will now apply only ${TARGET_TAG}.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
