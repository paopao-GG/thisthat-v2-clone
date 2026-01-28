/**
 * Category Monitor Service
 *
 * Monitors market counts per category and triggers prefetching when needed.
 * Ensures each category maintains sufficient markets for users.
 */

import { marketsPrisma } from '../lib/database.js';

export interface CategoryStats {
  category: string;
  count: number;
  needsPrefetch: boolean;
  targetCount: number;
  maxCount: number;
}

// Configuration from environment with defaults
const MIN_MARKETS_PER_CATEGORY = Number(process.env.MIN_MARKETS_PER_CATEGORY) || 500;
const MAX_MARKETS_PER_CATEGORY = Number(process.env.MAX_MARKETS_PER_CATEGORY) || 10000;
const PREFETCH_BATCH_SIZE = Number(process.env.PREFETCH_BATCH_SIZE) || 1000;

// Define all categories we want to monitor
// Based on Polymarket's actual market distribution (analyzed from 500+ active markets)
export const CATEGORIES = [
  'politics',      // ~26% - US politics, government (129+ markets)
  'elections',     // ~39% - Elections, voting (194+ markets)
  'sports',        // ~8% - Sports events (40+ markets)
  'crypto',        // ~7% - Crypto, blockchain (36+ markets)
  'technology',    // ~16% - Tech, AI, companies (81+ markets)
  'economics',     // ~11% - Economy, markets (56+ markets)
  'business',      // ~11% - Companies, finance (55+ markets)
  'entertainment', // ~5% - Movies, celebrities (23+ markets)
  'science',       // ~3% - Science, research (15+ markets)
  'international', // ~7% - World events, geopolitics (33+ markets)
  'general',       // Fallback for uncategorized
] as const;

export type Category = typeof CATEGORIES[number];

/**
 * Get market count for a specific category
 */
export async function getCategoryCount(category: string): Promise<number> {
  return await marketsPrisma.market.count({
    where: {
      category: category.toLowerCase(),
      status: 'open', // Only count active markets
    },
  });
}

/**
 * Get market counts for all categories
 */
export async function getAllCategoryCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  const results = await marketsPrisma.market.groupBy({
    by: ['category'],
    where: {
      status: 'open',
    },
    _count: true,
  });

  results.forEach((result) => {
    if (result.category) {
      counts.set(result.category, result._count);
    }
  });

  return counts;
}

/**
 * Get detailed stats for a category
 */
export async function getCategoryStats(category: string): Promise<CategoryStats> {
  const count = await getCategoryCount(category);
  const needsPrefetch = count < MIN_MARKETS_PER_CATEGORY;

  return {
    category,
    count,
    needsPrefetch,
    targetCount: MIN_MARKETS_PER_CATEGORY,
    maxCount: MAX_MARKETS_PER_CATEGORY,
  };
}

/**
 * Get stats for all categories
 */
export async function getAllCategoryStats(): Promise<CategoryStats[]> {
  const counts = await getAllCategoryCounts();
  const stats: CategoryStats[] = [];

  for (const category of CATEGORIES) {
    const count = counts.get(category) || 0;
    const needsPrefetch = count < MIN_MARKETS_PER_CATEGORY;

    stats.push({
      category,
      count,
      needsPrefetch,
      targetCount: MIN_MARKETS_PER_CATEGORY,
      maxCount: MAX_MARKETS_PER_CATEGORY,
    });
  }

  return stats;
}

/**
 * Get categories that need prefetching
 */
export async function getCategoriesNeedingPrefetch(): Promise<string[]> {
  const stats = await getAllCategoryStats();
  return stats
    .filter((stat) => stat.needsPrefetch && stat.count < stat.maxCount)
    .map((stat) => stat.category);
}

/**
 * Calculate how many markets to fetch for a category
 */
export function calculatePrefetchAmount(currentCount: number): number {
  // If below minimum, fetch up to batch size
  if (currentCount < MIN_MARKETS_PER_CATEGORY) {
    const needed = MIN_MARKETS_PER_CATEGORY - currentCount;
    return Math.min(needed, PREFETCH_BATCH_SIZE);
  }

  // Don't exceed maximum
  if (currentCount >= MAX_MARKETS_PER_CATEGORY) {
    return 0;
  }

  return 0;
}

/**
 * Check if a category can accept more markets
 */
export async function canAcceptMoreMarkets(category: string): Promise<boolean> {
  const count = await getCategoryCount(category);
  return count < MAX_MARKETS_PER_CATEGORY;
}

/**
 * Get summary statistics across all categories
 */
export async function getSystemStats(): Promise<{
  totalMarkets: number;
  totalOpen: number;
  categoriesNeedingPrefetch: number;
  categoriesAtCapacity: number;
  averageMarketsPerCategory: number;
}> {
  const stats = await getAllCategoryStats();
  const totalOpen = stats.reduce((sum, stat) => sum + stat.count, 0);
  const totalMarkets = await marketsPrisma.market.count();
  const categoriesNeedingPrefetch = stats.filter((s) => s.needsPrefetch).length;
  const categoriesAtCapacity = stats.filter((s) => s.count >= s.maxCount).length;
  const averageMarketsPerCategory = totalOpen / stats.length;

  return {
    totalMarkets,
    totalOpen,
    categoriesNeedingPrefetch,
    categoriesAtCapacity,
    averageMarketsPerCategory,
  };
}
