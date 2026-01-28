/**
 * Category Prefetch Service
 *
 * Executes a single category prefetch operation by:
 * 1. Fetching fresh markets from Polymarket
 * 2. Saving them to PostgreSQL (handled by ingest service)
 * 3. Hydrating the category cache so clients have immediate access
 */

import { marketsPrisma } from '../lib/database.js';
import {
  ingestMarketsFromPolymarket,
  type MarketIngestionResult,
} from './market-ingestion.service.js';
import { cacheCategoryMarkets } from './category-cache.service.js';

const CACHE_LIMIT = Number(process.env.CATEGORY_PREFETCH_CACHE_LIMIT) || 200;

export interface PrefetchCategoryParams {
  category: string;
  amountToFetch: number;
  reason?: string;
}

export interface PrefetchCategoryResult extends MarketIngestionResult {
  category: string;
  cached: number;
  cacheTimestamp: string;
}

function mapMarketToCacheEntry(market: any) {
  return {
    id: market.id,
    polymarketId: market.polymarketId,
    title: market.title,
    description: market.description,
    thisOption: market.thisOption,
    thatOption: market.thatOption,
    thisOdds: market.thisOdds !== null && market.thisOdds !== undefined ? Number(market.thisOdds) : undefined,
    thatOdds: market.thatOdds !== null && market.thatOdds !== undefined ? Number(market.thatOdds) : undefined,
    liquidity: market.liquidity !== null && market.liquidity !== undefined ? Number(market.liquidity) : undefined,
    category: market.category,
    status: market.status,
    expiresAt: market.expiresAt,
    marketType: market.marketType,
    author: null,
    imageUrl: null,
  };
}

export async function prefetchCategoryMarkets(
  params: PrefetchCategoryParams
): Promise<PrefetchCategoryResult> {
  const normalizedCategory = params.category.toLowerCase();

  const ingestionResult = await ingestMarketsFromPolymarket({
    limit: params.amountToFetch,
    activeOnly: true,
    category: normalizedCategory,
  });

  // Refresh cache with latest markets for the category
  const freshMarkets = await marketsPrisma.market.findMany({
    where: {
      status: 'open',
      category: normalizedCategory,
    },
    orderBy: { updatedAt: 'desc' },
    take: CACHE_LIMIT,
  });

  const cachePayload = freshMarkets.map(mapMarketToCacheEntry);
  await cacheCategoryMarkets(normalizedCategory, cachePayload);

  return {
    ...ingestionResult,
    category: normalizedCategory,
    cached: cachePayload.length,
    cacheTimestamp: new Date().toISOString(),
  };
}

