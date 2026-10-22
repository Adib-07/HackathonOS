import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildActualSchema,
  compareSchemas,
  formatComparison,
  parseMigrationStructure,
} from "../scripts/schema-comparison.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const baselineSql = readFileSync(
  path.join(dbRoot, "drizzle", "0000_baseline_existing_schema.sql"),
  "utf8",
);

test("the baseline migration parses into the structure it creates", () => {
  const expected = parseMigrationStructure(baselineSql);

  assert.deepEqual(
    [...expected.tables.keys()].sort(),
    ["competitions", "workflow_plans", "workflow_tasks"],
  );
  assert.ok(expected.tables.get("competitions")?.has("owner_id"));
  assert.ok(expected.tables.get("competitions")?.has("deadline"));
  assert.ok(expected.tables.get("workflow_tasks")?.has("verification_method"));
  assert.ok(expected.tables.get("workflow_plans")?.has("version"));

  const planIndexes = expected.indexes.get("workflow_plans") ?? new Set();
  assert.ok(planIndexes.has("workflow_plans_competition_version_unique"));

  const taskFks = expected.foreignKeys.get("workflow_tasks") ?? new Set();
  assert.ok(
    taskFks.has("workflow_tasks_plan_id_workflow_plans_id_fk"),
  );
});

/** Build a live schema that matches the baseline exactly. */
function matchingLiveSchema(expected) {
  const columns = [];
  for (const [table, names] of expected.tables) {
    for (const column of names) columns.push({ table, column });
  }
  const indexes = [];
  for (const [table, names] of expected.indexes) {
    for (const index of names) indexes.push({ table, index });
  }
  const foreignKeys = [];
  for (const [table, names] of expected.foreignKeys) {
    for (const constraint of names) foreignKeys.push({ table, constraint });
  }
  return {
    tables: [...expected.tables.keys()],
    columns,
    indexes,
    foreignKeys,
  };
}

test("a live database that matches the baseline is recognised", () => {
  const expected = parseMigrationStructure(baselineSql);
  const actual = buildActualSchema(matchingLiveSchema(expected));

  const comparison = compareSchemas(expected, actual);
  assert.equal(comparison.baselineApplied, true);
  assert.equal(comparison.empty, false);
  assert.deepEqual(comparison.missing, []);
  assert.deepEqual(comparison.extra, []);
});

test("a live database missing a column is not treated as baselined", () => {
  const expected = parseMigrationStructure(baselineSql);
  const actual = buildActualSchema({
    tables: ["competitions", "workflow_plans", "workflow_tasks"],
    columns: [
      { table: "competitions", column: "id" },
      { table: "competitions", column: "owner_id" },
      // "deadline" is deliberately absent.
      { table: "workflow_plans", column: "id" },
      { table: "workflow_tasks", column: "id" },
    ],
    indexes: [],
    foreignKeys: [],
  });

  const comparison = compareSchemas(expected, actual);
  assert.equal(comparison.baselineApplied, false);
  assert.ok(
    comparison.missing.some((item) => item.detail.includes("deadline")),
    "the missing column must be reported",
  );
});

test("a live database missing a table is not treated as baselined", () => {
  const expected = parseMigrationStructure(baselineSql);
  const actual = buildActualSchema({
    tables: ["competitions"],
    columns: [{ table: "competitions", column: "id" }],
    indexes: [],
    foreignKeys: [],
  });

  const comparison = compareSchemas(expected, actual);
  assert.equal(comparison.baselineApplied, false);
  assert.ok(
    comparison.missing.some((item) => item.kind === "missing_table"),
  );
});

test("a live database with extra objects is still baselined, with drift reported", () => {
  const expected = parseMigrationStructure(baselineSql);
  const matching = matchingLiveSchema(expected);
  const actual = buildActualSchema({
    ...matching,
    // A column the baseline does not create.
    columns: [
      ...matching.columns,
      { table: "competitions", column: "legacy_note" },
    ],
  });

  const comparison = compareSchemas(expected, actual);
  // The baseline's own effect is present, so baselining is safe: migrations
  // never drop, so the extra column simply stays.
  assert.equal(comparison.baselineApplied, true);
  assert.ok(
    comparison.extra.some((item) => item.detail.includes("legacy_note")),
    "the drift must be reported",
  );
});

test("an empty database is not treated as baselined", () => {
  const expected = parseMigrationStructure(baselineSql);
  const actual = buildActualSchema({
    tables: [],
    columns: [],
    indexes: [],
    foreignKeys: [],
  });

  const comparison = compareSchemas(expected, actual);
  assert.equal(comparison.empty, true);
  assert.equal(comparison.baselineApplied, false);
  assert.match(formatComparison(comparison), /no application tables/i);
});

test("the report names what is missing", () => {
  const expected = parseMigrationStructure(baselineSql);
  const actual = buildActualSchema({
    tables: [],
    columns: [],
    indexes: [],
    foreignKeys: [],
  });
  const report = formatComparison(compareSchemas(expected, actual));
  assert.match(report, /no application tables/i);
  assert.match(report, /migrate/i);
});

test("a destructive statement in a later migration cannot affect the baseline parse", () => {
  // The parser only recognises the statement shapes drizzle-kit emits for
  // table creation. A DROP in the same file must not be read as a table.
  const sql = `
CREATE TABLE "safe_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
DROP TABLE "dangerous_table";
ALTER TABLE "safe_table" DROP COLUMN "id";
`;
  const expected = parseMigrationStructure(sql);
  assert.deepEqual([...expected.tables.keys()], ["safe_table"]);
});

test("the parser ignores a migration that creates nothing", () => {
  const expected = parseMigrationStructure("-- nothing to see here\n");
  assert.equal(expected.tables.size, 0);
});
