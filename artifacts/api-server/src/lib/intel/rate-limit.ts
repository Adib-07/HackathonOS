/**
 * A small fixed-window rate limiter.
 *
 * It is deliberately per process and in memory: it protects a single
 * instance from an accidental or hostile burst, not a fleet. A multi-instance
 * deployment needs a shared limiter.
 */

export interface RateLimiter {
  /** True when the call is allowed. The call is recorded when it is. */
  allow(): boolean;
  /** Calls currently inside the window. */
  size(): number;
  /** Milliseconds until the oldest recorded call leaves the window. */
  retryAfterMs(): number;
}

/**
 * Build a limiter that allows `limit` calls per `windowMs`.
 *
 * `now` is injectable so the behaviour can be tested without waiting.
 */
export function createWindowLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const calls: number[] = [];

  return {
    allow() {
      const current = now();
      while (calls.length > 0 && current - calls[0]! >= windowMs) {
        calls.shift();
      }
      if (calls.length >= limit) return false;
      calls.push(current);
      return true;
    },
    size() {
      const current = now();
      while (calls.length > 0 && current - calls[0]! >= windowMs) {
        calls.shift();
      }
      return calls.length;
    },
    retryAfterMs() {
      if (calls.length === 0) return 0;
      const oldest = calls[0]!;
      const remaining = windowMs - (now() - oldest);
      return remaining > 0 ? remaining : 0;
    },
  };
}
