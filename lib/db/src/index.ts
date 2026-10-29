import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function createPool(): pg.Pool {
  const databaseUrl = process.env.DATABASE_URL;
  const isTest = process.env.NODE_ENV === "test";
  const isCI = process.env.CI === "true";
  const hasTestDatabaseUrl = !!process.env.DATABASE_URL_TEST;

  // CI Guard: In test mode, require CI=true and DATABASE_URL_TEST to be set
  // This prevents tests from accidentally running against a non-CI database
  if (isTest) {
    if (!isCI) {
      throw new Error(
        "[db] TEST GUARD: Refusing to run tests outside CI environment. Set CI=true to run tests.",
      );
    }
    if (!hasTestDatabaseUrl) {
      throw new Error(
        "[db] TEST GUARD: DATABASE_URL_TEST not set. Tests require an isolated test database. Set DATABASE_URL_TEST in CI.",
      );
    }
  }

  if (!databaseUrl) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      throw new Error(
        "DATABASE_URL environment variable is required in production but was not provided.",
      );
    }
    // Development fallback only - never use in production
    console.warn(
      "[db] WARNING: DATABASE_URL not set, falling back to local PostgreSQL. This should only be used in development.",
    );
  }

  const fallbackUrl = databaseUrl || "postgresql://localhost:5432/hackathon_os";

  // Serverless-friendly pool: small max, short idle timeout
  return new Pool({
    connectionString: fallbackUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
}

function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = createPool();
  }
  return poolInstance;
}

function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

// Lazy getters - pool/db only created on first access
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return getPool()[prop as keyof pg.Pool];
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});

export * from "./schema/index";

// Export a function to explicitly close the pool (for tests/shutdown)
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}
