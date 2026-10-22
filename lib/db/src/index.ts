import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

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

export const pool = new Pool({ connectionString: fallbackUrl });
export const db = drizzle(pool, { schema });

export * from "./schema/index";
