/**
 * Enhanced Category Monitor Service
 *
 * Implements smart category filling per polymarket-fetching.md requirements:
 * 1. Maintain 1000 markets per category minimum
 * 2. Auto-refill when category drops to 100 markets
 * 3. Retry 3 times if unable to fill 1000 markets
 * 4. Exponential backoff if category can't reach 1000 for 3 consecutive days
 * 5. Priority: Show popular markets first (volume24hr)
 */

import { marketsPrisma as prisma } from '../lib/database.js';
import { ingestMarketsFromPolymarket } from './market-ingestion.service.js';
import { safeRedisGet, safeRedisSetEx } from '../lib/redis.js';

// Configuration from polymarket-fetching.md
const CATEGORY_TARGET = 1000; // Target markets per category
const CATEGORY_REFILL_THRESHOLD = 100; // Auto-refill when below this
const MAX_RETRIES = 3; // Retry attempts per fetch
const BACKOFF_DAYS = [1, 2, 4]; // Exponential backoff: 1 day, 2 days, 4 days
const REDIS_BACKOFF_KEY_PREFIX = 'category:backoff:';
const REDIS_RETRY_KEY_PREFIX = 'category:retries:';

export interface CategoryStats {
  category: string;
  count: number;
  needsRefill: boolean;
  isBackedOff: boolean;
  backoffDays?: number;
  retriesRemaining?: number;
}

export interface FillResult {
  category: string;
  success: boolean;
  marketsFetched: number;
  finalCount: number;
  retriesUsed: number;
  nextBackoffDays?: number;
}

/**
 * Get all categories with their current market counts
 */
export async function getAllCategoryStats(): Promise<CategoryStats[]> {
  // Get market counts grouped by category
  const categoryCounts = await prisma.market.groupBy({
    by: ['category'],
    where: {
      status: 'open', // Only count active markets
    },
    _count: {
      id: true,
    },
  });

  const stats: CategoryStats[] = [];

  for (const item of categoryCounts) {
    const category = item.category || 'general';
    const count = item._count.id;

    // Check if category is in backoff period
    const backoffKey = `${REDIS_BACKOFF_KEY_PREFIX}${category}`;
    const backoffUntil = await safeRedisGet(backoffKey);
    const isBackedOff = backoffUntil ? new Date(backoffUntil) > new Date() : false;

    // Get retry count
    const retryKey = `${REDIS_RETRY_KEY_PREFIX}${category}`;
    const retryData = await safeRedisGet(retryKey);
    const retries = retryData ? JSON.parse(retryData) : { count: 0, consecutiveDays: 0 };

    stats.push({
      category,
      count,
      needsRefill: count < CATEGORY_REFILL_THRESHOLD,
      isBackedOff,
      backoffDays: isBackedOff ? calculateBackoffDays(retries.consecutiveDays) : undefined,
      retriesRemaining: MAX_RETRIES - (retries.count % MAX_RETRIES),
    });
  }

  return stats;
}

/**
 * Calculate backoff days based on consecutive failure days
 */
function calculateBackoffDays(consecutiveDays: number): number {
  if (consecutiveDays === 0) return 0;
  const index = Math.min(consecutiveDays - 1, BACKOFF_DAYS.length - 1);
  return BACKOFF_DAYS[index];
}

/**
 * Check if category should be refilled
 */
export async function shouldRefillCategory(category: string): Promise<boolean> {
  // Check backoff status
  const backoffKey = `${REDIS_BACKOFF_KEY_PREFIX}${category}`;
  const backoffUntil = await safeRedisGet(backoffKey);

  if (backoffUntil && new Date(backoffUntil) > new Date()) {
    console.log(`[Category Monitor] ${category} is in backoff period until ${backoffUntil}`);
    return false;
  }

  // Check market count
  const count = await prisma.market.count({
    where: {
      status: 'open',
      category,
    },
  });

  return count < CATEGORY_REFILL_THRESHOLD;
}

/**
 * Fill a category to target (1000 markets) with retry logic
 */
export async function fillCategoryToTarget(category: string): Promise<FillResult> {
  console.log(`[Category Fill] Starting fill for category: ${category}`);

  // Get current count
  const initialCount = await prisma.market.count({
    where: {
      status: 'open',
      category,
    },
  });

  console.log(`[Category Fill] ${category} has ${initialCount} markets, target is ${CATEGORY_TARGET}`);

  if (initialCount >= CATEGORY_TARGET) {
    return {
      category,
      success: true,
      marketsFetched: 0,
      finalCount: initialCount,
      retriesUsed: 0,
    };
  }

  const needed = CATEGORY_TARGET - initialCount;
  let totalFetched = 0;
  let retriesUsed = 0;

  // Try up to MAX_RETRIES times
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    retriesUsed = attempt;
    console.log(`[Category Fill] Attempt ${attempt}/${MAX_RETRIES} for ${category}`);

    try {
      // Fetch markets for this category
      const result = await ingestMarketsFromPolymarket({
        limit: needed - totalFetched,
        activeOnly: true,
        category,
      });

      totalFetched += result.created;
      console.log(`[Category Fill] Fetched ${result.created} new markets for ${category} (total: ${totalFetched})`);

      // Check if we reached target
      const currentCount = await prisma.market.count({
        where: {
          status: 'open',
          category,
        },
      });

      if (currentCount >= CATEGORY_TARGET) {
        console.log(`[Category Fill] ✅ Successfully filled ${category} to ${currentCount} markets`);
        await resetRetryCount(category);
        return {
          category,
          success: true,
          marketsFetched: totalFetched,
          finalCount: currentCount,
          retriesUsed,
        };
      }

      // If we got no new markets, Polymarket doesn't have more
      if (result.created === 0) {
        console.warn(`[Category Fill] ⚠️ Polymarket has no more markets for ${category}`);
        break;
      }

    } catch (error: any) {
      console.error(`[Category Fill] Error on attempt ${attempt} for ${category}:`, error.message);
    }

    // Wait before retry (exponential backoff within day)
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Max 30s
      console.log(`[Category Fill] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Failed to reach target after retries
  const finalCount = await prisma.market.count({
    where: {
      status: 'open',
      category,
    },
  });

  console.error(`[Category Fill] ❌ Failed to fill ${category} after ${retriesUsed} attempts. Final count: ${finalCount}`);

  // Track consecutive failures and apply backoff
  await incrementFailureCount(category);

  return {
    category,
    success: false,
    marketsFetched: totalFetched,
    finalCount,
    retriesUsed,
    nextBackoffDays: await getNextBackoffDays(category),
  };
}

/**
 * Increment failure count and apply exponential backoff if needed
 */
async function incrementFailureCount(category: string): Promise<void> {
  const retryKey = `${REDIS_RETRY_KEY_PREFIX}${category}`;
  const retryData = await safeRedisGet(retryKey);
  const retries = retryData ? JSON.parse(retryData) : { count: 0, consecutiveDays: 0, lastFailure: null };

  const now = new Date();
  const lastFailure = retries.lastFailure ? new Date(retries.lastFailure) : null;

  // Check if this is a new day of failures
  const isNewDay = !lastFailure || (now.getTime() - lastFailure.getTime()) > 24 * 60 * 60 * 1000;

  if (isNewDay) {
    retries.consecutiveDays++;
    retries.count = 1;
  } else {
    retries.count++;
  }

  retries.lastFailure = now.toISOString();

  // Save retry state
  await safeRedisSetEx(retryKey, 7 * 24 * 60 * 60, JSON.stringify(retries)); // Keep for 7 days

  // Apply backoff if we've hit 3 retries in a day
  if (retries.count >= MAX_RETRIES) {
    const backoffDays = calculateBackoffDays(retries.consecutiveDays);
    const backoffUntil = new Date(now.getTime() + backoffDays * 24 * 60 * 60 * 1000);

    console.warn(`[Category Monitor] ${category} backed off for ${backoffDays} days until ${backoffUntil.toISOString()}`);

    const backoffKey = `${REDIS_BACKOFF_KEY_PREFIX}${category}`;
    await safeRedisSetEx(backoffKey, backoffDays * 24 * 60 * 60, backoffUntil.toISOString());
  }
}

/**
 * Reset retry count after successful fill
 */
async function resetRetryCount(category: string): Promise<void> {
  const retryKey = `${REDIS_RETRY_KEY_PREFIX}${category}`;
  const backoffKey = `${REDIS_BACKOFF_KEY_PREFIX}${category}`;

  // Clear both retry and backoff states
  const { safeRedisDel } = await import('../lib/redis.js');
  await safeRedisDel([retryKey]);
  await safeRedisDel([backoffKey]);
}

/**
 * Get next backoff days for a category
 */
async function getNextBackoffDays(category: string): Promise<number> {
  const retryKey = `${REDIS_RETRY_KEY_PREFIX}${category}`;
  const retryData = await safeRedisGet(retryKey);
  const retries = retryData ? JSON.parse(retryData) : { consecutiveDays: 0 };
  return calculateBackoffDays(retries.consecutiveDays + 1);
}

/**
 * Monitor all categories and refill those below threshold
 */
export async function monitorAndRefillCategories(): Promise<void> {
  console.log('[Category Monitor] Starting category monitoring cycle...');

  const stats = await getAllCategoryStats();

  for (const stat of stats) {
    if (stat.needsRefill && !stat.isBackedOff) {
      console.log(`[Category Monitor] ${stat.category} needs refill (${stat.count} < ${CATEGORY_REFILL_THRESHOLD})`);
      await fillCategoryToTarget(stat.category);
    } else if (stat.isBackedOff) {
      console.log(`[Category Monitor] ${stat.category} is backed off (${stat.backoffDays} days)`);
    } else {
      console.log(`[Category Monitor] ${stat.category} is healthy (${stat.count} markets)`);
    }
  }

  console.log('[Category Monitor] Category monitoring cycle complete');
}
