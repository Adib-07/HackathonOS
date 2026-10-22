#!/usr/bin/env node
/**
 * Record the baseline migration as applied on a database that was created
 * with `drizzle-kit push` and therefore has no migration history.
 *
 * `drizzle-kit migrate` only runs migrations newer than the last recorded
 * one. A database created with `push` has no rows in
 * `drizzle.__drizzle_migrations`, so the migrator would try to run the
 * baseline `CREATE TABLE` statements and fail with "already exists".
 *
 * This script records the baseline in the migration table WITHOUT executing
 * its SQL. It writes exactly one row to `drizzle.__drizzle_migrations`. It
 * never reads, writes, or alters an application table.
 *
 * Safety, in order:
 *   1. The live schema is compared, structurally, against the baseline
 *      migration. The baseline is only recorded when every table, column,
 *      index, and foreign key the baseline creates is already present. The
 *      live schema is never assumed to match the development schema.
 *   2. A database with no application tables is reported as "nothing to
 *      baseline" and exits 0, because `migrate` will create the schema.
 *   3. A database that has diverged is refused, with the difference listed.
 *   4. The script is idempotent: running it twice changes nothing.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/mark-baseline-applied.mjs
 *   DATABASE_URL=postgresql://... node scripts/mark-baseline-applied.mjs --check
 *
 * `--check` verifies and reports without writing anything.
 *
 * The connection string is never printed.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  buildActualSchema,
  compareSchemas,
  formatComparison,
  parseMigrationStructure,
} from "./schema-comparison.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "drizzle");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

const checkOnly = process.argv.includes("--check");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Refusing to guess which database to modify.",
  );
  process.exit(1);
}

if (!existsSync(journalPath)) {
  console.error(
    `No migration journal found at ${journalPath}. Run "pnpm --filter @workspace/db generate" first.`,
  );
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const baselineEntry = journal.entries[0];
if (!baselineEntry) {
  console.error("The migration journal is empty. There is no baseline to mark.");
  process.exit(1);
}

const baselineFile = path.join(migrationsDir, `${baselineEntry.tag}.sql`);
if (!existsSync(baselineFile)) {
  console.error(`Baseline migration file missing: ${baselineFile}`);
  process.exit(1);
}

const baselineSql = readFileSync(baselineFile, "utf8");
// The migrator hashes the raw file contents with sha256.
const hash = createHash("sha256").update(baselineSql).digest("hex");

const expected = parseMigrationStructure(baselineSql);

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const tableResult = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const columnResult = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
  );
  const indexResult = await client.query(
    // Constraint-backed indexes (the implicit primary key index, and indexes
    // behind a unique constraint) are not created by the migration SQL, so
    // they are excluded here. A standalone `CREATE UNIQUE INDEX` in the
    // migration has no constraint row and is still compared.
    `SELECT i.tablename AS table_name, i.indexname AS index_name
       FROM pg_indexes i
       JOIN pg_class c ON c.relname = i.indexname
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_constraint con ON con.conindid = c.oid
      WHERE i.schemaname = 'public' AND n.nspname = 'public' AND con.oid IS NULL
      ORDER BY i.tablename, i.indexname`,
  );
  const constraintResult = await client.query(
    `SELECT tc.table_name, tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.schemata s ON s.schema_name = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND s.schema_name = 'public'
      ORDER BY tc.table_name, tc.constraint_name`,
  );

  const actual = buildActualSchema({
    tables: tableResult.rows.map((row) => row.table_name),
    columns: columnResult.rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
    })),
    indexes: indexResult.rows.map((row) => ({
      table: row.table_name,
      index: row.index_name,
    })),
    foreignKeys: constraintResult.rows.map((row) => ({
      table: row.table_name,
      constraint: row.constraint_name,
    })),
  });

  const comparison = compareSchemas(expected, actual);

  console.log(formatComparison(comparison));

  if (comparison.empty) {
    console.log(
      "Nothing to record. Run \"pnpm --filter @workspace/db run migrate\" and the schema will be created from the migrations.",
    );
    process.exit(0);
  }

  if (!comparison.baselineApplied) {
    console.error(
      "Refusing to record the baseline: the live schema does not contain it. " +
        "Marking it applied would skip a change the database still needs. " +
        "No changes were made.",
    );
    process.exit(1);
  }

  if (checkOnly) {
    console.log(
      "Check only: the baseline is already applied to this database. Nothing was written.",
    );
    process.exit(0);
  }

  // Create the bookkeeping table exactly as the migrator does.
  await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const { rows: applied } = await client.query(
    `SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`,
    [hash],
  );

  if (applied.length > 0) {
    console.log(
      `Baseline "${baselineEntry.tag}" was already recorded. Nothing to do.`,
    );
    process.exit(0);
  }

  // One row, and nothing else is written.
  await client.query(
    `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
    [hash, baselineEntry.when],
  );

  console.log(
    `Recorded baseline "${baselineEntry.tag}" as applied. The next "pnpm --filter @workspace/db run migrate" will only run migrations after the baseline.`,
  );
} catch (error) {
  console.error(
    `Failed to record the baseline as applied: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
