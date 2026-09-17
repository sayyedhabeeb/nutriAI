import { createHash } from 'node:crypto';

interface InFlightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

// Global registry of in-flight AI requests by payload hash key
const inFlightMap = new Map<string, InFlightRequest<unknown>>();
const MAX_TTL_MS = 60_000; // 60-second absolute TTL fallback

/**
 * Computes a deterministic SHA256 payload hash from strings or Buffer data.
 */
export function computePayloadHash(payload: string | Buffer): string {
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Wraps an AI function call with deduplication.
 * If an identical request key is already in-flight, returns the existing promise
 * instead of spawning a parallel LLM inference.
 */
export async function executeIdempotent<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = inFlightMap.get(key);
  if (existing && Date.now() - existing.timestamp < MAX_TTL_MS) {
    return existing.promise as Promise<T>;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightMap.delete(key);
    }
  })();

  inFlightMap.set(key, { promise, timestamp: Date.now() });
  return promise;
}
