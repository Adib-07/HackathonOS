/**
 * CI Test Guard
 *
 * This module ensures tests only run in CI with the test database.
 * It must be imported at the top of every test file.
 *
 * Usage:
 *   import "./test-guard.mjs";
 *
 * The guard checks:
 * 1. CI=true environment variable is set
 * 2. DATABASE_URL contains "test" (to prevent accidental production DB access)
 * 3. NODE_ENV is "test"
 *
 * No bypasses allowed. Tests must run in test mode.
 */

if (process.env.CI !== "true") {
  throw new Error(
    "Tests can only run in CI (CI=true required). " +
    "This prevents accidental execution against production databases."
  );
}

if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "Tests must use a test database (DATABASE_URL must contain 'test'). " +
    `Current DATABASE_URL: ${process.env.DATABASE_URL || "not set"}`
  );
}

if (process.env.NODE_ENV !== "test") {
  throw new Error(
    "Tests must run with NODE_ENV=test. " +
    `Current NODE_ENV: ${process.env.NODE_ENV || "not set"}`
  );
}

console.log("[test-guard] CI environment validated: CI=true, test database, NODE_ENV=" + process.env.NODE_ENV);