import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test database setup - applies all migrations before tests run.
 * This ensures the test database has the latest schema.
 */
export async function setupTestDatabase() {
  // Use the same fallback logic as @workspace/db
  const testDbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || "postgresql://localhost:5432/hackathon_os";
  
  console.log("[test-setup] Using database:", testDbUrl.replace(/:([^:@]+)@/, ':****@'));
  
  // Create a temporary pool for migrations
  const migrationPool = new pg.Pool({
    connectionString: testDbUrl,
    max: 1,
  });
  
  try {
    // Resolve migrations directory from workspace root
    const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
    const migrationsDir = path.join(workspaceRoot, "lib", "db", "drizzle");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql") && /^\d{4}_/.test(f))
      .sort();
    
    console.log("[test-setup] Found migrations:", migrationFiles);
    
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      
      // Split by statement using drizzle-kit's statement-breakpoint marker,
      // or fall back to semicolon splitting with comment handling
      let statements;
      if (sql.includes("--> statement-breakpoint")) {
        statements = sql
          .split("--> statement-breakpoint")
          .map(s => s.trim())
          .filter(s => s.length > 0);
      } else {
        // Improved semicolon splitting that preserves statements with leading comments
        statements = sql
          .split(";")
          .map(s => s.trim())
          .filter(s => s.length > 0)
          // Remove standalone comment lines but keep comments attached to statements
          .map(s => s.split("\n").filter(line => !line.trim().startsWith("--") || line.trim().startsWith("-->")).join("\n").trim())
          .filter(s => s.length > 0);
      }
      
      for (const stmt of statements) {
        if (stmt.length > 0) {
          try {
            await migrationPool.query(stmt);
          } catch (err) {
            // Ignore "already exists" errors for idempotency
            if (err.code === "42P07" || // duplicate_table
                err.code === "42710" || // duplicate_object
                err.code === "42701" || // duplicate_column
                err.code === "23505") { // unique_violation (for backfill)
              console.log("[test-setup] Skipping (already exists):", stmt.substring(0, 80) + "...");
            } else {
              console.error("[test-setup] Error in", file, ":", err.message);
              console.error("[test-setup] Statement:", stmt.substring(0, 200));
              throw err;
            }
          }
        }
      }
      console.log("[test-setup] Applied:", file);
    }
    
    console.log("[test-setup] All migrations applied successfully");
  } finally {
    await migrationPool.end();
  }
}

// Run setup when this module is imported (not when run as a test)
await setupTestDatabase();