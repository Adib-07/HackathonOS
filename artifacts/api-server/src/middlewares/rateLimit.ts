/**
 * API Rate Limiting Middleware
 *
 * Provides configurable rate limiting for API endpoints.
 * Uses in-memory store (suitable for single-instance deployments).
 * For multi-instance deployments, a shared store (Redis) would be needed.
 */

import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Extracts client IP from request, respecting proxy headers.
 * In Replit/production, the first proxy sets x-forwarded-for.
 */
function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "unknown";
  return ip;
}

/**
 * Creates a standard rate limiter with consistent behavior.
 */
function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyPrefix: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message, code: "RATE_LIMITED" },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req: Request) => {
      // Use userId if authenticated, otherwise IP
      const userId = (req as any).userId ?? getClientIp(req);
      return `${options.keyPrefix}:${userId}`;
    },
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    skipFailedRequests: options.skipFailedRequests ?? false,
    handler: (_req: Request, res: Response) => {
      logger.warn(
        { ip: getClientIp(_req), path: _req.path },
        "Rate limit exceeded",
      );
      res.status(429).json({
        error: options.message,
        code: "RATE_LIMITED",
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
}

/**
 * General API rate limiter - applied to all authenticated routes
 * 100 requests per minute per user/IP
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 100,
  message: "Too many requests. Please slow down.",
  keyPrefix: "api",
});

/**
 * Strict rate limiter for authentication-sensitive endpoints
 * 10 requests per minute per user/IP
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 10,
  message: "Too many authentication-sensitive requests. Please wait.",
  keyPrefix: "auth",
});

/**
 * Strict rate limiter for AI provider endpoints
 * 12 requests per minute (matches existing AI limiter)
 * This is per-process, not distributed
 */
export const aiRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 12,
  message: "Too many AI requests. Please wait a minute.",
  keyPrefix: "ai",
});

/**
 * Strict rate limiter for research endpoints
 * 8 requests per minute (matches existing research limiter)
 */
export const researchRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 8,
  message: "Too many research requests. Please wait a minute.",
  keyPrefix: "research",
});

/**
 * Rate limiter for plan generation (resource-intensive)
 * 5 requests per minute
 */
export const planGenerationRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 5,
  message: "Too many plan generation requests. Please wait.",
  keyPrefix: "plan",
});

/**
 * Rate limiter for write operations (create/update/delete)
 * 30 requests per minute
 */
export const writeRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  max: 30,
  message: "Too many write requests. Please slow down.",
  keyPrefix: "write",
});

/**
 * Middleware to apply rate limiter conditionally based on path
 */
export function conditionalRateLimiter(
  limiters: Array<{ paths: string | RegExp; limiter: RateLimitRequestHandler }>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const { paths, limiter } of limiters) {
      const match =
        typeof paths === "string"
          ? req.path.startsWith(paths)
          : paths.test(req.path);
      if (match) {
        return limiter(req, res, next) as void;
      }
    }
    next();
    return;
  };
}

/**
 * Default conditional rate limiter applying appropriate limits per endpoint type
 */
export const defaultConditionalRateLimiter = conditionalRateLimiter([
  { paths: "/competitions", limiter: writeRateLimiter }, // POST /competitions
  { paths: "/competitions", limiter: apiRateLimiter }, // GET /competitions, etc.
  { paths: "/plans", limiter: planGenerationRateLimiter }, // POST /plans
  { paths: "/evidence", limiter: writeRateLimiter }, // POST /evidence
  { paths: "/analysis", limiter: aiRateLimiter }, // POST /analysis (AI)
  { paths: "/ideas", limiter: aiRateLimiter }, // POST /ideas (AI)
  { paths: "/brief", limiter: aiRateLimiter }, // POST /brief (AI)
  { paths: "/research", limiter: researchRateLimiter }, // POST /research
  { paths: "/gaps", limiter: aiRateLimiter }, // POST /gaps (AI)
  { paths: "/evaluate", limiter: aiRateLimiter }, // POST /evaluate (AI)
  { paths: "/decision", limiter: writeRateLimiter }, // POST /decision
  { paths: "/rubric", limiter: writeRateLimiter }, // PUT /rubric
  { paths: "/tasks", limiter: writeRateLimiter }, // PATCH /tasks
]);

/**
 * Wrapper that disables rate limiting in test environment
 */
export function rateLimiterWrapper(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV === "test") {
    return next();
  }
  return defaultConditionalRateLimiter(req, res, next);
}
