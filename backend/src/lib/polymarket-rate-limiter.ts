// backend/src/lib/polymarket-rate-limiter.ts
import redis from './redis.js';

const POLYMARKET_RATE_LIMIT_KEY = 'polymarket:rate-limit';
const WINDOW_SIZE_MS = 10000; // 10 seconds (Polymarket's rate limit window)
const MAX_REQUESTS = 100; // Conservative: 100 req/10s (CLOB allows 1500, we stay well below)

// Lua script for atomic rate limit check-and-increment
// This prevents race conditions by making check + add atomic
const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window_start = tonumber(ARGV[2])
  local max_requests = tonumber(ARGV[3])
  local request_id = ARGV[4]

  -- Remove old entries outside the window
  redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

  -- Check current count
  local count = redis.call('ZCARD', key)
  if count >= max_requests then
    return 0
  end

  -- Add new request
  redis.call('ZADD', key, now, request_id)
  redis.call('EXPIRE', key, 20)
  return 1
`;

/**
 * Try to acquire a slot for a Polymarket API call
 * Returns true if request is allowed, false if rate limited
 */
export async function acquirePolymarketSlot(): Promise<boolean> {
  try {
    const now = Date.now();
    const windowStart = now - WINDOW_SIZE_MS;
    const requestId = `${now}-${Math.random()}`;

    const result = (await redis.eval(RATE_LIMIT_SCRIPT, {
      keys: [POLYMARKET_RATE_LIMIT_KEY],
      arguments: [
        now.toString(),
        windowStart.toString(),
        MAX_REQUESTS.toString(),
        requestId,
      ],
    })) as number;

    return result === 1;
  } catch (error) {
    console.error('[PolymarketRateLimiter] Error checking rate limit:', error);
    // Fail open: allow the request on error
    return true;
  }
}

/**
 * Wait for an available slot (with timeout)
 * Returns true if slot acquired, false if timeout reached
 */
export async function waitForPolymarketSlot(maxWaitMs = 5000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    if (await acquirePolymarketSlot()) {
      return true;
    }

    // Wait 100ms before retrying
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false; // Timeout reached
}

/**
 * Get current rate limit status (for monitoring)
 */
export async function getPolymarketRateLimitStatus(): Promise<{
  currentCount: number;
  maxRequests: number;
  windowSizeMs: number;
  percentUsed: number;
}> {
  try {
    const now = Date.now();
    const windowStart = now - WINDOW_SIZE_MS;

    // Clean old entries
    await redis.zRemRangeByScore(POLYMARKET_RATE_LIMIT_KEY, 0, windowStart);

    // Get current count
    const currentCount = await redis.zCard(POLYMARKET_RATE_LIMIT_KEY);
    const percentUsed = (currentCount / MAX_REQUESTS) * 100;

    return {
      currentCount,
      maxRequests: MAX_REQUESTS,
      windowSizeMs: WINDOW_SIZE_MS,
      percentUsed,
    };
  } catch (error) {
    console.error('[PolymarketRateLimiter] Error getting status:', error);
    return {
      currentCount: 0,
      maxRequests: MAX_REQUESTS,
      windowSizeMs: WINDOW_SIZE_MS,
      percentUsed: 0,
    };
  }
}
