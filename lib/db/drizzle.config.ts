import { defineConfig } from "drizzle-kit";
import path from "path";

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

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  // Migration files live in ./drizzle. `drizzle-kit generate` writes them and
  // `drizzle-kit migrate` applies them in order.
  out: "drizzle",
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  dbCredentials: {
    url: fallbackUrl,
  },
});
