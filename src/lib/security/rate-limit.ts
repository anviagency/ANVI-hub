// Fixed-window rate limiter (Mission 3.5 P1).
//
// NOTE: in-process / per-instance. Correct for a single Next.js node; for a
// multi-instance deployment this must move to Redis (documented in the security
// audit as a remaining risk). Kept dependency-free and deterministic for tests.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * @param key      identity to limit on (e.g. `login:1.2.3.4`)
 * @param limit    max requests per window
 * @param windowMs window length in ms
 * @param now      injectable clock for tests
 */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }
  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt, limit };
}

/** Test/maintenance helper. */
export function resetRateLimiter(): void {
  buckets.clear();
}

// Periodically drop expired buckets so the map doesn't grow unbounded.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  // Don't keep the process alive just for cleanup.
  (timer as unknown as { unref?: () => void }).unref?.();
}
