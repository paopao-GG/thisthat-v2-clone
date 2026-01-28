import { createClient } from 'redis';

// Redis Client singleton
const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined;
};

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Check if this is an Upstash or other TLS-enabled Redis URL
const isTlsRequired = redisUrl.includes('upstash.io') || redisUrl.includes('rediss://') || process.env.REDIS_TLS === 'true';

// Convert redis:// to rediss:// for TLS if needed (redis v5 client handles this automatically)
const tlsUrl = isTlsRequired && redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')
  ? redisUrl.replace('redis://', 'rediss://')
  : redisUrl;

export const redis =
  globalForRedis.redis ??
  createClient({
    url: tlsUrl,
    socket: isTlsRequired ? {
      tls: true,
      rejectUnauthorized: false, // Upstash uses self-signed certificates
    } : undefined,
  });

let redisAvailableState = false;

redis.on('error', (err) => {
  console.warn('⚠️  Redis Client Error (continuing without cache):', err.message);
  redisAvailableState = false;
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
  redisAvailableState = true;
});

// Export function to check Redis availability
export function isRedisAvailable(): boolean {
  return redisAvailableState && redis.isOpen;
}

// Helper function to safely use Redis with automatic reconnection attempts
export async function safeRedisGet(key: string): Promise<string | null> {
  // Attempt reconnection if Redis is marked unavailable but client is open
  if (!redisAvailableState && redis.isOpen) {
    try {
      await redis.ping();
      console.log('[Redis] Reconnection successful');
      redisAvailableState = true;
    } catch {
      // Still unavailable, return null
      return null;
    }
  }

  if (!redisAvailableState || !redis.isOpen) {
    return null;
  }

  try {
    return await redis.get(key);
  } catch (error) {
    console.warn(`Redis get error for key ${key}:`, error);
    redisAvailableState = false;
    return null;
  }
}

export async function safeRedisSetEx(key: string, seconds: number, value: string): Promise<void> {
  // Attempt reconnection if Redis is marked unavailable but client is open
  if (!redisAvailableState && redis.isOpen) {
    try {
      await redis.ping();
      console.log('[Redis] Reconnection successful');
      redisAvailableState = true;
    } catch {
      return;
    }
  }

  if (!redisAvailableState || !redis.isOpen) {
    return;
  }

  try {
    await redis.setEx(key, seconds, value);
  } catch (error) {
    console.warn(`Redis setEx error for key ${key}:`, error);
    redisAvailableState = false;
  }
}

export async function safeRedisDel(keys: string[]): Promise<void> {
  if (!redisAvailableState || !redis.isOpen || keys.length === 0) {
    return;
  }
  try {
    await redis.del(keys);
  } catch (error) {
    console.warn(`Redis del error:`, error);
  }
}

export async function safeRedisKeys(pattern: string): Promise<string[]> {
  if (!redisAvailableState || !redis.isOpen) {
    return [];
  }
  try {
    return await redis.keys(pattern);
  } catch (error) {
    console.warn(`Redis keys error for pattern ${pattern}:`, error);
    return [];
  }
}

/**
 * Add member to sorted set
 */
export async function safeRedisZAdd(key: string, score: number, member: string): Promise<number> {
  if (!redisAvailableState || !redis.isOpen) return 0;
  try {
    return await redis.zAdd(key, { score, value: member });
  } catch (error) {
    console.error('Redis ZADD error:', error);
    return 0;
  }
}

/**
 * Get range from sorted set (highest to lowest) with scores
 */
export async function safeRedisZRevRangeWithScores(
  key: string,
  start: number,
  stop: number
): Promise<Array<{ userId: string; score: number }>> {
  if (!redisAvailableState || !redis.isOpen) return [];
  try {
    const results = await redis.zRangeWithScores(key, start, stop, { REV: true });
    return results.map(r => ({ userId: r.value, score: r.score }));
  } catch (error) {
    console.error('Redis ZREVRANGE error:', error);
    return [];
  }
}

/**
 * Get range from sorted set (highest to lowest) - members only
 */
export async function safeRedisZRevRange(key: string, start: number, stop: number): Promise<string[]> {
  if (!redisAvailableState || !redis.isOpen) return [];
  try {
    return await redis.zRange(key, start, stop, { REV: true });
  } catch (error) {
    console.error('Redis ZREVRANGE error:', error);
    return [];
  }
}

/**
 * Get rank of member in sorted set (0-indexed, highest first)
 */
export async function safeRedisZRevRank(key: string, member: string): Promise<number | null> {
  if (!redisAvailableState || !redis.isOpen) return null;
  try {
    return await redis.zRevRank(key, member);
  } catch (error) {
    console.error('Redis ZREVRANK error:', error);
    return null;
  }
}

/**
 * Get cardinality (count) of sorted set
 */
export async function safeRedisZCard(key: string): Promise<number> {
  if (!redisAvailableState || !redis.isOpen) return 0;
  try {
    return await redis.zCard(key);
  } catch (error) {
    console.error('Redis ZCARD error:', error);
    return 0;
  }
}

/**
 * Count members in sorted set with scores between min and max
 */
export async function safeRedisZCount(key: string, min: number | string, max: number | string): Promise<number> {
  if (!redisAvailableState || !redis.isOpen) return 0;
  try {
    return await redis.zCount(key, min, max);
  } catch (error) {
    console.error('Redis ZCOUNT error:', error);
    return 0;
  }
}

/**
 * Get range from sorted set with optional scores
 */
export async function safeRedisZRange(
  key: string,
  start: number,
  stop: number,
  options?: string
): Promise<string[]> {
  if (!redisAvailableState || !redis.isOpen) return [];
  try {
    if (options === 'WITHSCORES') {
      const results = await redis.zRangeWithScores(key, start, stop);
      // Flatten to [member, score, member, score, ...]
      return results.flatMap(r => [r.value, r.score.toString()]);
    }
    return await redis.zRange(key, start, stop);
  } catch (error) {
    console.error('Redis ZRANGE error:', error);
    return [];
  }
}

/**
 * Add member to sorted set
 */
export async function safeRedisZAdd2(key: string, score: number, member: string): Promise<number> {
  if (!redisAvailableState || !redis.isOpen) return 0;
  try {
    return await redis.zAdd(key, { score, value: member });
  } catch (error) {
    console.error('Redis ZADD error:', error);
    return 0;
  }
}

/**
 * Remove members from sorted set by score range
 */
export async function safeRedisZRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number> {
  if (!redisAvailableState || !redis.isOpen) return 0;
  try {
    return await redis.zRemRangeByScore(key, min, max);
  } catch (error) {
    console.error('Redis ZREMRANGEBYSCORE error:', error);
    return 0;
  }
}

/**
 * Set expiration on key (in seconds)
 */
export async function safeRedisExpire(key: string, seconds: number): Promise<boolean> {
  if (!redisAvailableState || !redis.isOpen) return false;
  try {
    const result = await redis.expire(key, seconds);
    // Redis expire returns number (1 for success, 0 for failure) - cast to boolean
    return Boolean(result);
  } catch (error) {
    console.error('Redis EXPIRE error:', error);
    return false;
  }
}

// Note: Redis connection will be established on first use or explicitly in app startup
// Don't connect here to avoid blocking module load

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export default redis;

