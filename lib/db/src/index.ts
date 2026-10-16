import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

const databaseUrl =
  process.env.DATABASE_URL || "postgresql://localhost:5432/hackathon_os";

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema/index";
