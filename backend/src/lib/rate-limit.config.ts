/**
 * Rate Limiting Configuration
 * 
 * Different rate limits for different endpoint types:
 * - Critical processes (betting, economy): Stricter limits
 * - Auth endpoints: Moderate limits to prevent brute force
 * - User-facing endpoints: Standard limits
 * - External API calls: Very strict limits
 * 
 * Uses Redis (ioredis) for distributed rate limiting when available.
 * Falls back to in-memory storage if Redis is unavailable.
 * 
 * Note: Redis client is evaluated at plugin registration time, not at import time.
 */

import type { FastifyRequest } from 'fastify';
import type { RateLimitPluginOptions } from '@fastify/rate-limit';
import rateLimitRedis from './redis-rate-limit.js';

/**
 * Get client identifier for rate limiting
 * Uses IP address or user ID if authenticated
 */
export function getRateLimitKey(request: FastifyRequest): string {
  // If user is authenticated, use their user ID for more accurate per-user limiting
  const userId = (request as any).user?.userId;
  if (userId) {
    return `user:${userId}`;
  }
  
  // Otherwise use IP address
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit configuration for critical processes
 * Betting, economy operations, credit transactions
 */
export const criticalProcessRateLimit: RateLimitPluginOptions = {
  max: Number(process.env.RATE_LIMIT_CRITICAL_MAX) || 30, // 30 requests
  timeWindow: Number(process.env.RATE_LIMIT_CRITICAL_WINDOW) || 60 * 1000, // per minute
  keyGenerator: getRateLimitKey,
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please slow down.',
      retryAfter: Math.ceil(context.ttl / 1000), // seconds
      limit: context.max,
    };
  },
  // Use Redis if available, otherwise in-memory
  // Client is evaluated at plugin registration time (after Redis connection attempt)
  redis: rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
  nameSpace: 'rate-limit:critical',
};

/**
 * Rate limit configuration for authentication endpoints
 * Prevents brute force attacks
 */
export const authRateLimit: RateLimitPluginOptions = {
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10, // 10 requests
  timeWindow: Number(process.env.RATE_LIMIT_AUTH_WINDOW) || 15 * 60 * 1000, // per 15 minutes
  keyGenerator: getRateLimitKey,
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: Math.ceil(context.ttl / 1000), // seconds
      limit: context.max,
    };
  },
  redis: rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
  nameSpace: 'rate-limit:auth',
};

/**
 * Rate limit configuration for user-facing endpoints
 * Standard API endpoints (markets, leaderboards, etc.)
 */
export const standardRateLimit: RateLimitPluginOptions = {
  max: Number(process.env.RATE_LIMIT_STANDARD_MAX) || 100, // 100 requests
  timeWindow: Number(process.env.RATE_LIMIT_STANDARD_WINDOW) || 60 * 1000, // per minute
  keyGenerator: getRateLimitKey,
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please slow down.',
      retryAfter: Math.ceil(context.ttl / 1000), // seconds
      limit: context.max,
    };
  },
  redis: rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
  nameSpace: 'rate-limit:standard',
};

/**
 * Rate limit configuration for external API calls
 * Market ingestion, sync operations
 */
export const externalApiRateLimit: RateLimitPluginOptions = {
  max: Number(process.env.RATE_LIMIT_EXTERNAL_MAX) || 5, // 5 requests
  timeWindow: Number(process.env.RATE_LIMIT_EXTERNAL_WINDOW) || 60 * 1000, // per minute
  keyGenerator: getRateLimitKey,
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      message: 'Too many external API calls. Please wait before retrying.',
      retryAfter: Math.ceil(context.ttl / 1000), // seconds
      limit: context.max,
    };
  },
  redis: rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
  nameSpace: 'rate-limit:external',
};

/**
 * Rate limit configuration for background jobs
 * Internal rate limiting for scheduled tasks
 */
export const jobRateLimit: RateLimitPluginOptions = {
  max: Number(process.env.RATE_LIMIT_JOB_MAX) || 1, // 1 request
  timeWindow: Number(process.env.RATE_LIMIT_JOB_WINDOW) || 60 * 1000, // per minute
  keyGenerator: () => 'internal:job', // All jobs share the same key
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      message: 'Job rate limit exceeded',
      retryAfter: Math.ceil(context.ttl / 1000),
      limit: context.max,
    };
  },
  redis: rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
  nameSpace: 'rate-limit:job',
};

