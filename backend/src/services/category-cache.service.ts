/**
 * Category Cache Service
 *
 * Lightweight caching layer for prefetched markets per category.
 * Uses Redis when available and gracefully degrades to no-op when Redis
 * connectivity is unavailable.
 */

import {
  safeRedisGet,
  safeRedisSetEx,
  safeRedisDel,
} from '../lib/redis.js';

const CACHE_KEY_PREFIX = 'prefetch:category:';
const DEFAULT_CACHE_TTL = Number(process.env.CATEGORY_PREFETCH_CACHE_TTL_SECONDS) || 300; // 5 minutes
const DEFAULT_CACHE_LIMIT = Number(process.env.CATEGORY_PREFETCH_CACHE_LIMIT) || 200;

export interface CategoryCachePayload<T = any> {
  category: string;
  cachedAt: string;
  count: number;
  markets: T[];
}

function buildCacheKey(category: string): string {
  return `${CACHE_KEY_PREFIX}${category.toLowerCase()}`;
}

/**
 * Cache markets for a category.
 * Automatically clamps to DEFAULT_CACHE_LIMIT to avoid oversized payloads.
 */
export async function cacheCategoryMarkets<T = any>(
  category: string,
  markets: T[],
  options?: {
    ttlSeconds?: number;
    limit?: number;
  }
): Promise<void> {
  if (!markets || markets.length === 0) {
    return;
  }

  const normalizedCategory = category.toLowerCase();
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_CACHE_TTL;
  const limit = options?.limit ?? DEFAULT_CACHE_LIMIT;

  const payload: CategoryCachePayload<T> = {
    category: normalizedCategory,
    cachedAt: new Date().toISOString(),
    count: Math.min(markets.length, limit),
    markets: markets.slice(0, limit),
  };

  try {
    await safeRedisSetEx(buildCacheKey(normalizedCategory), ttlSeconds, JSON.stringify(payload));
  } catch (error) {
    console.warn(
      `[Category Cache] Failed to cache category "${normalizedCategory}":`,
      (error as Error).message
    );
  }
}

/**
 * Retrieve cached markets for a category.
 */
export async function getCachedCategoryMarkets<T = any>(
  category: string,
  limit?: number
): Promise<CategoryCachePayload<T> | null> {
  try {
    const raw = await safeRedisGet(buildCacheKey(category));
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as CategoryCachePayload<T>;
    if (limit && payload.markets.length > limit) {
      payload.markets = payload.markets.slice(0, limit);
      payload.count = payload.markets.length;
    }
    return payload;
  } catch (error) {
    console.warn(
      `[Category Cache] Failed to read cache for "${category}":`,
      (error as Error).message
    );
    return null;
  }
}

/**
 * Invalidate cache entries for one or more categories.
 */
export async function invalidateCategoryCache(categories: string | string[]): Promise<void> {
  const categoryList = Array.isArray(categories) ? categories : [categories];
  const keys = categoryList.map((category) => buildCacheKey(category));
  await safeRedisDel(keys);
}

