/**
 * Structural comparison between a Drizzle baseline migration and a live
 * PostgreSQL database.
 *
 * The purpose is to answer one question safely: **has the effect of the
 * baseline migration already been applied to this database?**
 *
 * The test is a superset test, not an identity test. The baseline is
 * considered applied when every table, column, index, and foreign key the
 * baseline creates is already present. Extra objects in the live database do
 * not block baselining — migrations never drop anything, so an extra column
 * simply stays. They are reported as drift so an operator can see them.
 *
 * This module is deliberately free of I/O so it can be unit tested. The
 * database queries live in the scripts that use it.
 */

/** What the baseline migration is expected to create. */
export interface ExpectedSchema {
  tables: Map<string, Set<string>>;
  indexes: Map<string, Set<string>>;
  foreignKeys: Map<string, Set<string>>;
}

/** What a live database actually contains. */
export interface ActualSchema {
  tables: Map<string, Set<string>>;
  indexes: Map<string, Set<string>>;
  foreignKeys: Map<string, Set<string>>;
}

export interface SchemaDifference {
  kind: "missing_table" | "missing_column" | "missing_index" | "missing_foreign_key";
  detail: string;
}

export interface SchemaComparison {
  /** True when the baseline's effect is already present in the live schema. */
  baselineApplied: boolean;
  /** True when the live database has no application tables at all. */
  empty: boolean;
  /** Things the baseline creates that the live database does not have. */
  missing: SchemaDifference[];
  /** Things in the live database that the baseline does not create. */
  extra: SchemaDifference[];
}

/**
 * Parse a Drizzle-generated migration into the structure it creates.
 *
 * Only the statement shapes `drizzle-kit generate` emits are recognised:
 *   CREATE TABLE "name" ("col" type, ...);
 *   CREATE [UNIQUE] INDEX "name" ON "table" USING btree (...);
 *   ALTER TABLE "name" ADD CONSTRAINT "name" FOREIGN KEY ...;
 *
 * Anything else in the file is ignored, so a later migration with a
 * destructive statement cannot influence the baseline check.
 */
export function parseMigrationStructure(sql: string): ExpectedSchema {
  const tables = new Map<string, Set<string>>();
  const indexes = new Map<string, Set<string>>();
  const foreignKeys = new Map<string, Set<string>>();

  const createTable = /CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g;
  for (const match of sql.matchAll(createTable)) {
    const table = match[1]!;
    const body = match[2]!;
    const columns = new Set<string>();
    for (const line of body.split("\n")) {
      const column = line.trim().match(/^"([^"]+)"\s/);
      if (column) columns.add(column[1]!);
    }
    tables.set(table, columns);
  }

  const createIndex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"/g;
  for (const match of sql.matchAll(createIndex)) {
    const index = match[1]!;
    const table = match[2]!;
    if (!indexes.has(table)) indexes.set(table, new Set());
    indexes.get(table)!.add(index);
  }

  const addConstraint =
    /ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"/g;
  for (const match of sql.matchAll(addConstraint)) {
    const table = match[1]!;
    const constraint = match[2]!;
    if (!foreignKeys.has(table)) foreignKeys.set(table, new Set());
    foreignKeys.get(table)!.add(constraint);
  }

  return { tables, indexes, foreignKeys };
}

/** Build a live schema description from catalog rows. */
export function buildActualSchema(rows: {
  tables: string[];
  columns: Array<{ table: string; column: string }>;
  indexes: Array<{ table: string; index: string }>;
  foreignKeys: Array<{ table: string; constraint: string }>;
}): ActualSchema {
  const tables = new Map<string, Set<string>>();
  for (const table of rows.tables) {
    tables.set(table, new Set());
  }
  for (const row of rows.columns) {
    if (!tables.has(row.table)) tables.set(row.table, new Set());
    tables.get(row.table)!.add(row.column);
  }

  const indexes = new Map<string, Set<string>>();
  for (const row of rows.indexes) {
    if (!indexes.has(row.table)) indexes.set(row.table, new Set());
    indexes.get(row.table)!.add(row.index);
  }

  const foreignKeys = new Map<string, Set<string>>();
  for (const row of rows.foreignKeys) {
    if (!foreignKeys.has(row.table)) foreignKeys.set(row.table, new Set());
    foreignKeys.get(row.table)!.add(row.constraint);
  }

  return { tables, indexes, foreignKeys };
}

/**
 * Compare an expected baseline against a live schema.
 *
 * `baselineApplied` is true when every table, column, index, and foreign key
 * the baseline creates is already present. Extra live objects are reported as
 * drift but do not block baselining.
 */
export function compareSchemas(
  expected: ExpectedSchema,
  actual: ActualSchema,
): SchemaComparison {
  const missing: SchemaDifference[] = [];
  const extra: SchemaDifference[] = [];

  for (const [table, columns] of expected.tables) {
    const liveColumns = actual.tables.get(table);
    if (!liveColumns) {
      missing.push({ kind: "missing_table", detail: `table "${table}"` });
      continue;
    }
    for (const column of columns) {
      if (!liveColumns.has(column)) {
        missing.push({
          kind: "missing_column",
          detail: `column "${table}"."${column}"`,
        });
      }
    }
  }

  for (const [table, names] of expected.indexes) {
    const live = actual.indexes.get(table) ?? new Set<string>();
    for (const name of names) {
      if (!live.has(name)) {
        missing.push({
          kind: "missing_index",
          detail: `index "${name}" on "${table}"`,
        });
      }
    }
  }

  for (const [table, names] of expected.foreignKeys) {
    const live = actual.foreignKeys.get(table) ?? new Set<string>();
    for (const name of names) {
      if (!live.has(name)) {
        missing.push({
          kind: "missing_foreign_key",
          detail: `constraint "${name}" on "${table}"`,
        });
      }
    }
  }

  // Drift: live objects the baseline does not create.
  for (const [table, columns] of actual.tables) {
    const expectedColumns = expected.tables.get(table);
    if (!expectedColumns) {
      extra.push({ kind: "missing_table", detail: `table "${table}"` });
      continue;
    }
    for (const column of columns) {
      if (!expectedColumns.has(column)) {
        extra.push({
          kind: "missing_column",
          detail: `column "${table}"."${column}"`,
        });
      }
    }
  }

  for (const [table, names] of actual.indexes) {
    const expectedNames = expected.indexes.get(table) ?? new Set<string>();
    for (const name of names) {
      if (!expectedNames.has(name)) {
        extra.push({ kind: "missing_index", detail: `index "${name}" on "${table}"` });
      }
    }
  }

  for (const [table, names] of actual.foreignKeys) {
    const expectedNames = expected.foreignKeys.get(table) ?? new Set<string>();
    for (const name of names) {
      if (!expectedNames.has(name)) {
        extra.push({
          kind: "missing_foreign_key",
          detail: `constraint "${name}" on "${table}"`,
        });
      }
    }
  }

  const liveTableCount = actual.tables.size;
  const empty = liveTableCount === 0;

  return {
    baselineApplied: missing.length === 0 && !empty,
    empty,
    missing,
    extra,
  };
}

/** Render a comparison as a short, operator-readable report. */
export function formatComparison(comparison: SchemaComparison): string {
  if (comparison.empty) {
    return "The database has no application tables. The baseline does not need to be recorded; `migrate` will create the schema.";
  }
  if (comparison.baselineApplied) {
    return comparison.extra.length === 0
      ? "The live schema matches the baseline exactly."
      : `The baseline is already applied. The live schema has ${comparison.extra.length} object(s) the baseline does not create; they are left untouched by migrations.`;
  }
  return [
    `The live schema does not match the baseline. ${comparison.missing.length} object(s) are missing:`,
    ...comparison.missing.map((item) => `  - ${item.detail}`),
  ].join("\n");
}
