/**
 * Redis Client for Rate Limiting
 * 
 * Uses ioredis (required by @fastify/rate-limit) for distributed rate limiting.
 * This is separate from the main Redis client (redis v5) used for caching.
 * 
 * Graceful fallback: If Redis is unavailable, rate limiting falls back to in-memory storage.
 */

/// <reference types="node" />

import Redis, { type RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Check if this is an Upstash or other TLS-enabled Redis URL
const isTlsRequired = redisUrl.includes('upstash.io') || redisUrl.includes('rediss://') || process.env.REDIS_TLS === 'true';

// Create ioredis client for rate limiting
// Singleton pattern to prevent multiple connections
const globalForRateLimitRedis = globalThis as unknown as {
  rateLimitRedis: Redis | undefined;
};

// Parse Redis URL to extract connection details
let redisConfig: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    // Exponential backoff: 50ms, 100ms, 200ms, 400ms, max 3000ms
    const delay = Math.min(times * 50, 3000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
};

// Configure TLS for Upstash and other TLS-enabled Redis services
if (isTlsRequired) {
  try {
    // Parse the URL to extract host, port, and password
    const url = new URL(redisUrl);
    // Upstash format: redis://default:password@host:port
    // ioredis uses password, not username
    const password = url.password || '';
    const host = url.hostname;
    const port = parseInt(url.port || '6379');
    
    redisConfig = {
      ...redisConfig,
      host,
      port,
      password, // ioredis uses password, not username
      tls: {
        rejectUnauthorized: false, // Upstash uses self-signed certificates
      },
    };
  } catch {
    // Fallback: parse URL manually
    const url = new URL(redisUrl);
    const password = url.password || '';
    const host = url.hostname;
    const port = parseInt(url.port || '6379');
    
    redisConfig = {
      ...redisConfig,
      host,
      port,
      password,
      tls: {
        rejectUnauthorized: false,
      },
    };
  }
} else {
  // For local Redis, parse the URL manually
  try {
    const url = new URL(redisUrl);
    const password = url.password || undefined;
    const host = url.hostname;
    const port = parseInt(url.port || '6379');
    
    redisConfig = {
      ...redisConfig,
      host,
      port,
      ...(password && { password }),
    };
  } catch {
    // If URL parsing fails, ioredis can accept the URL string directly
    redisConfig = {
      ...redisConfig,
      ...(redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://') 
        ? {} 
        : { host: redisUrl }),
    };
  }
}

export const rateLimitRedis: Redis =
  globalForRateLimitRedis.rateLimitRedis ??
  new Redis(redisConfig);

// Event handlers
rateLimitRedis.on('error', (err) => {
  console.warn('⚠️  Rate Limit Redis Error (falling back to in-memory):', err.message);
});

rateLimitRedis.on('connect', () => {
  console.log('✅ Rate Limit Redis connected');
});

rateLimitRedis.on('ready', () => {
  console.log('✅ Rate Limit Redis ready');
});

rateLimitRedis.on('close', () => {
  console.log('⚠️  Rate Limit Redis connection closed');
});

rateLimitRedis.on('reconnecting', () => {
  console.log('🔄 Rate Limit Redis reconnecting...');
});

// Store in global for hot reloading (development)
if (process.env.NODE_ENV !== 'production') {
  globalForRateLimitRedis.rateLimitRedis = rateLimitRedis;
}

// Check if Redis is available (for graceful degradation)
export async function isRateLimitRedisAvailable(): Promise<boolean> {
  try {
    await rateLimitRedis.ping();
    return true;
  } catch {
    return false;
  }
}

export default rateLimitRedis;

