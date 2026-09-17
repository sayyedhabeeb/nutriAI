export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  'food-recognize': { windowMs: 60_000, maxRequests: 10 },
  'recommendations': { windowMs: 60_000, maxRequests: 20 },
  'chat': { windowMs: 60_000, maxRequests: 25 },
  'meal-plan': { windowMs: 60_000, maxRequests: 10 },
  'voice-log': { windowMs: 60_000, maxRequests: 15 },
  'default': { windowMs: 60_000, maxRequests: 20 },
};

// In-memory sliding window timestamps map
const timestampStore = new Map<string, number[]>();

// Periodically clean up stale rate-limiter keys every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of timestampStore.entries()) {
    const fresh = timestamps.filter((t) => now - t < 120_000);
    if (fresh.length === 0) {
      timestampStore.delete(key);
    } else {
      timestampStore.set(key, fresh);
    }
  }
}, 300_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Evaluates rate limit for a user/IP on a given AI route.
 */
export function checkAiRateLimit(
  identifier: string,
  routeKey: string = 'default'
): RateLimitResult {
  const config = ROUTE_LIMITS[routeKey] ?? ROUTE_LIMITS.default;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const key = `${routeKey}:${identifier}`;
  const timestamps = (timestampStore.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= config.maxRequests) {
    const oldest = timestamps[0] ?? now;
    const resetMs = Math.max(0, oldest + config.windowMs - now);
    timestampStore.set(key, timestamps);
    return { allowed: false, remaining: 0, resetMs };
  }

  timestamps.push(now);
  timestampStore.set(key, timestamps);

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    resetMs: config.windowMs,
  };
}
