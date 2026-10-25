import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().optional(),
});

/**
 * Validates server environment variables.
 * Returns an array of missing/invalid variable names (empty if all valid).
 * Does NOT throw - callers decide how to handle missing config.
 */
export function validateServerEnv(): string[] {
  if (process.env.NODE_ENV === "test") {
    return [];
  }
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    return result.error.issues.map((i) => i.path.join("."));
  }
  return [];
}

/**
 * Middleware that validates env on each request (except healthz).
 * Returns 500 with structured error if misconfigured.
 */
import type { Request, Response, NextFunction } from "express";

export function requireServerEnv(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip env validation for healthz - it must always work
    if (req.path === "/api/healthz" || req.path === "/healthz") {
      return next();
    }
    const missing = validateServerEnv();
    if (missing.length > 0) {
      res.status(500).json({
        error: "misconfigured",
        missing,
      });
      return;
    }
    next();
  };
}