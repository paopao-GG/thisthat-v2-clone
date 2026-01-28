/**
 * Markets Service
 *
 * Client-facing service for market data.
 * - Static data comes from PostgreSQL
 * - Live price data is fetched on-demand from Polymarket API
 */

import { marketsPrisma } from '../../lib/database.js';
import { getPolymarketClient } from '../../lib/polymarket-client.js';
import { executeWithFailover, circuitBreakers, createStructuredError } from '../../lib/error-handler.js';
import {
  cacheCategoryMarkets,
  getCachedCategoryMarkets,
} from '../../services/category-cache.service.js';
import { isMarketEndingSoon, ENDING_SOON_THRESHOLD_MS } from '../../shared/helpers/market-helpers.js';
import { getSkippedMarketIds } from './market-skip.services.js';

export interface MarketStaticData {
  id: string;
  polymarketId: string | null;
  title: string;
  description: string | null;
  thisOption: string;
  thatOption: string;
  author?: string | null; // Not in schema, kept for compatibility
  category: string | null;
  imageUrl?: string | null; // NOW STORED IN DB
  status: string;
  expiresAt: Date | null;
  thisOdds?: number;
  thatOdds?: number;
  liquidity?: number;
  volume?: number; // NEW: Total volume
  volume24hr?: number; // NEW: 24-hour volume for popularity
  marketType?: string;
  isEndingSoon?: boolean; // P5: Flag for markets ending within 24 hours
}

export interface MarketLiveData {
  polymarketId: string;
  thisOdds: number;
  thatOdds: number;
  liquidity: number;
  volume: number;
  volume24hr: number;
  acceptingOrders: boolean;
}

export interface MarketWithLiveData extends MarketStaticData {
  live: MarketLiveData | null;
}

/**
 * Utility: Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get random open markets from the database
 * Returns static data only - no prices
 *
 * @param count - Number of markets to return
 * @param prioritizePopular - If true, prioritize markets with high volume24hr
 */
export async function getRandomMarkets(count: number = 10, prioritizePopular: boolean = true): Promise<MarketStaticData[]> {
  // P1: Only return markets with token IDs (required for Polymarket price integration)
  // Also filter out markets without images and expired markets
  const where: any = {
    status: 'open',
    thisTokenId: { not: null }, // Required for live prices and charts
    imageUrl: { not: null }, // Only show markets with images
    OR: [
      { expiresAt: { gt: new Date() } }, // Expires in the future
      { expiresAt: null } // No expiration date
    ]
  };

  if (prioritizePopular) {
    // Fetch 3x more popular markets to allow for randomization while keeping popular ones
    const markets = await marketsPrisma.market.findMany({
      where,
      take: count * 3, // Fetch more to shuffle
      orderBy: [
        { volume24hr: 'desc' }, // Popular markets first
        { updatedAt: 'desc' }, // Then recent markets
      ],
      select: {
        id: true,
        polymarketId: true,
        title: true,
        description: true,
        imageUrl: true, // NEW FIELD
        thisOption: true,
        thatOption: true,
        category: true,
        status: true,
        expiresAt: true,
        marketType: true,
        volume: true, // NEW FIELD
        volume24hr: true, // NEW FIELD
      },
    });

    // Shuffle top results to add variety while keeping popular ones
    return shuffleArray(markets).slice(0, count).map((market): MarketStaticData => ({
      ...market,
      author: null,
      volume: market.volume ? Number(market.volume) : undefined,
      volume24hr: market.volume24hr ? Number(market.volume24hr) : undefined,
      isEndingSoon: isMarketEndingSoon(market.expiresAt),
    }));
  }

  // Original random logic (fallback if not prioritizing popular)
  const totalOpen = await marketsPrisma.market.count({ where });

  if (totalOpen === 0) {
    return [];
  }

  const maxOffset = Math.max(0, totalOpen - count);
  const randomOffset = Math.floor(Math.random() * maxOffset);

  const markets = await marketsPrisma.market.findMany({
    where,
    take: count,
    skip: randomOffset,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      polymarketId: true,
      title: true,
      description: true,
      imageUrl: true, // NEW FIELD
      thisOption: true,
      thatOption: true,
      category: true,
      status: true,
      expiresAt: true,
      marketType: true,
      volume: true, // NEW FIELD
      volume24hr: true, // NEW FIELD
    },
  });

  return markets.map((market): MarketStaticData => ({
    ...market,
    author: null,
    volume: market.volume ? Number(market.volume) : undefined,
    volume24hr: market.volume24hr ? Number(market.volume24hr) : undefined,
    isEndingSoon: isMarketEndingSoon(market.expiresAt),
  }));
}

/**
 * Get markets with filtering
 */
export async function getMarkets(options?: {
  status?: 'open' | 'closed' | 'resolved';
  category?: string;
  filter?: 'ending_soon' | 'popular';
  limit?: number;
  skip?: number;
  userId?: string; // Filter out markets skipped by this user
}): Promise<MarketStaticData[]> {
  // P1: Base filter - only return markets with token IDs (required for Polymarket price integration)
  // Note: imageUrl filter removed for ending_soon markets to show all expiring markets
  const where: any = {
    thisTokenId: { not: null }, // Required for live prices and charts
  };

  // Only filter by image for non-ending_soon queries
  if (options?.filter !== 'ending_soon') {
    where.imageUrl = { not: null }; // Only show markets with images (except ending_soon)
  }
  // FIX: Normalize category to lowercase for consistent database queries and cache keys
  const normalizedCategory = options?.category?.trim().toLowerCase() || undefined;
  // INCREASED default limit from 100 to 200 to fetch more markets and reduce "no markets" errors
  const limit = options?.limit || 200;
  const skip = options?.skip || 0;
  // IMPORTANT: Don't use cache when filter is applied - cached data won't be filtered correctly
  const shouldUseCategoryCache =
    !!normalizedCategory &&
    skip === 0 &&
    (!options?.status || options.status === 'open') &&
    !options?.filter;

  console.log(`[Markets] Query - Original: "${options?.category}", Normalized: "${normalizedCategory}", Status: "${options?.status}", Limit: ${limit}`);

  if (options?.status) {
    where.status = options.status;
  }

  // FIX: Use normalized lowercase category for database query with case-insensitive matching
  if (normalizedCategory) {
    where.category = { equals: normalizedCategory, mode: 'insensitive' };
  }

  // CRITICAL FIX: Filter out expired markets
  // Only show markets that haven't expired yet OR have no expiration date
  where.OR = [
    { expiresAt: { gt: new Date() } }, // Expires in the future
    { expiresAt: null } // No expiration date
  ];

  // Apply ending_soon filter - overrides the OR clause above
  // Uses the same threshold as isMarketEndingSoon() for credit restriction consistency
  if (options?.filter === 'ending_soon') {
    const now = new Date();
    const endingSoonThreshold = new Date(now.getTime() + ENDING_SOON_THRESHOLD_MS);

    // Override the OR clause to only show markets ending within 3 days
    where.expiresAt = {
      gte: now,                  // Not expired yet
      lte: endingSoonThreshold,  // But expires within 3 days
    };
    // Remove the OR clause since we're using specific expiresAt filter
    delete where.OR;
  }

  // Determine sort order based on filter
  // CRITICAL: popular filter must sort by volume24hr, not use random offset
  const orderBy = options?.filter === 'popular'
    ? [
      { volume24hr: 'desc' as const },
      { updatedAt: 'desc' as const },
      { id: 'asc' as const },
    ]
    : [
      { updatedAt: 'desc' as const },
      { id: 'asc' as const },
    ];

  // Flag to skip random offset when filter requires deterministic ordering
  const useRandomOffset = !options?.filter;

  // Check cache first (only for specific categories, not "All")
  if (shouldUseCategoryCache) {
    const cached = await getCachedCategoryMarkets<MarketStaticData>(normalizedCategory, limit);
    if (cached && cached.markets.length > 0) {
      console.log(`[Markets Service] Cache HIT for category "${normalizedCategory}" (${cached.markets.length} markets)`);
      // Shuffle cached results to mix markets from different events
      console.log(`[Markets Service] Shuffling ${cached.markets.length} cached markets for category "${normalizedCategory}" to mix events`);
      return shuffleArray(cached.markets);
    }
    console.log(`[Markets Service] Cache MISS for category "${normalizedCategory}", fetching from database...`);
  }

  // FIX: Use different strategies for "All" category vs specific categories
  // For specific categories: use updatedAt to show recent markets
  // For "All" category: use a mixed approach to ensure diversity across all categories

  let rawMarkets: any[] = [];

  if (normalizedCategory) {
    // Specific category: fetch from database with random offset
    // (Cache already checked above - no need to check again)
    // Count total markets in this category
    const totalCount = await marketsPrisma.market.count({
      where: {
        ...where,
        category: { equals: normalizedCategory, mode: 'insensitive' },
      },
    });

    // CHANGED: Only use random offset when NO filter is applied
    // Popular/ending_soon filters need deterministic ordering
    let effectiveSkip = skip;
    if (useRandomOffset) {
      const maxOffset = Math.max(0, totalCount - limit);
      effectiveSkip = skip + Math.floor(Math.random() * Math.min(maxOffset - skip, totalCount / 2));
      console.log(`[Markets Service] Category "${normalizedCategory}": ${totalCount} total, random offset ${effectiveSkip}`);
    } else {
      console.log(`[Markets Service] Category "${normalizedCategory}": ${totalCount} total, filter applied - using deterministic skip=${skip}`);
    }

    rawMarkets = await marketsPrisma.market.findMany({
      where,
      take: limit,
      skip: effectiveSkip,
      orderBy, // CHANGED: Use the orderBy variable
      select: {
        id: true,
        polymarketId: true,
        title: true,
        description: true,
        imageUrl: true,
        thisOption: true,
        thatOption: true,
        thisOdds: true,
        thatOdds: true,
        liquidity: true,
        category: true,
        status: true,
        expiresAt: true,
        marketType: true,
        volume24hr: true, // NEW: Required for popular filter sorting
      },
    });
  } else {
    // "All" category: Use deterministic pagination
    rawMarkets = await marketsPrisma.market.findMany({
      where,
      take: limit,
      skip: skip,
      orderBy, // CHANGED: Use the orderBy variable (not hardcoded)
      select: {
        id: true,
        polymarketId: true,
        title: true,
        description: true,
        imageUrl: true,
        thisOption: true,
        thatOption: true,
        thisOdds: true,
        thatOdds: true,
        liquidity: true,
        category: true,
        status: true,
        expiresAt: true,
        marketType: true,
        volume24hr: true, // NEW: Required for popular filter sorting
      },
    });

    console.log(`[Markets Service] "All" category: Fetched ${rawMarkets.length} markets with skip=${skip}, filter=${options?.filter || 'none'}`);
  }

  console.log(`[Markets Service] Database query returned ${rawMarkets.length} markets for category "${normalizedCategory || 'all'}"`);

  const mapped = rawMarkets.map(m => ({
    id: m.id,
    polymarketId: m.polymarketId,
    title: m.title,
    description: m.description,
    thisOption: m.thisOption,
    thatOption: m.thatOption,
    author: null, // Not in schema
    category: m.category,
    imageUrl: m.imageUrl || null,
    status: m.status,
    expiresAt: m.expiresAt,
    // Include odds and liquidity from database (may be stale, will be updated with live data)
    thisOdds: m.thisOdds ? Number(m.thisOdds) : undefined,
    thatOdds: m.thatOdds ? Number(m.thatOdds) : undefined,
    liquidity: m.liquidity ? Number(m.liquidity) : undefined,
    volume24hr: m.volume24hr ? Number(m.volume24hr) : undefined, // NEW: For popular filter
    marketType: m.marketType,
    isEndingSoon: isMarketEndingSoon(m.expiresAt), // P5: Calculate ending soon flag
  })) as MarketStaticData[];

  // Cache the results
  if (shouldUseCategoryCache && mapped.length > 0) {
    console.log(`[Markets Service] Caching ${mapped.length} markets for category "${normalizedCategory}"`);
    await cacheCategoryMarkets(normalizedCategory, mapped);
  }

  // Filter out skipped markets for authenticated users
  let filteredMarkets = mapped;
  if (options?.userId) {
    const skippedMarketIds = await getSkippedMarketIds(options.userId);
    if (skippedMarketIds.length > 0) {
      const skippedSet = new Set(skippedMarketIds);
      filteredMarkets = mapped.filter(m => !skippedSet.has(m.id));
      console.log(`[Markets Service] Filtered out ${mapped.length - filteredMarkets.length} skipped markets for user ${options.userId}`);
    }
  }

  // Shuffle results (without filters) to mix markets from different events
  // This prevents showing all markets from one event before moving to the next
  // Applies to both specific categories AND "All" category
  const shouldShuffle = !options?.filter;
  if (shouldShuffle) {
    console.log(`[Markets Service] Shuffling ${filteredMarkets.length} markets for category "${normalizedCategory}" to mix events`);
    return shuffleArray(filteredMarkets);
  }

  return filteredMarkets;
}

/**
 * Get markets by category
 */
export async function getMarketsByCategory(
  category: string,
  limit: number = 20
): Promise<MarketStaticData[]> {
  return getMarkets({ category, limit, status: 'open' });
}

/**
 * Get a single market by ID (static data)
 */
export async function getMarketById(marketId: string): Promise<MarketStaticData | null> {
  const market = await marketsPrisma.market.findUnique({
    where: { id: marketId },
    select: {
      id: true,
      polymarketId: true,
      title: true,
      description: true,
      imageUrl: true,
      thisOption: true,
      thatOption: true,
      category: true,
      status: true,
      expiresAt: true,
      marketType: true,
      // Include odds & liquidity so single-market endpoint has the same data as list endpoint
      thisOdds: true,
      thatOdds: true,
      liquidity: true,
      // P1: Include token IDs for Polymarket price integration
      thisTokenId: true,
      thatTokenId: true,
    },
  });

  if (!market) {
    return null;
  }

  // Map to MarketStaticData and normalize numeric fields
  const mapped: MarketStaticData & { thisTokenId?: string | null; thatTokenId?: string | null } = {
    id: market.id,
    polymarketId: market.polymarketId,
    title: market.title,
    description: market.description,
    thisOption: market.thisOption,
    thatOption: market.thatOption,
    author: null,
    category: market.category,
    imageUrl: market.imageUrl || null,
    status: market.status,
    expiresAt: market.expiresAt,
    thisOdds: market.thisOdds ? Number(market.thisOdds) : undefined,
    thatOdds: market.thatOdds ? Number(market.thatOdds) : undefined,
    liquidity: market.liquidity ? Number(market.liquidity) : undefined,
    marketType: market.marketType,
    isEndingSoon: isMarketEndingSoon(market.expiresAt), // P5: Calculate ending soon flag
    // P1: Include token IDs for price history
    thisTokenId: market.thisTokenId,
    thatTokenId: market.thatTokenId,
  };

  return mapped;
}

/**
 * Get a single market by Polymarket ID (static data)
 */
export async function getMarketByPolymarketId(polymarketId: string): Promise<MarketStaticData | null> {
  const market = await marketsPrisma.market.findUnique({
    where: { polymarketId },
    select: {
      id: true,
      polymarketId: true,
      title: true,
      description: true,
      imageUrl: true,
      thisOption: true,
      thatOption: true,
      category: true,
      status: true,
      expiresAt: true,
      marketType: true,
    },
  });

  if (!market) {
    return null;
  }

  // Add null values for fields not in schema but expected by interface
  return {
    ...market,
    author: null,
    imageUrl: market.imageUrl || null,
  };
}

/**
 * Fetch LIVE price data from Polymarket API for a single market
 * This is the "lazy loading" - only fetch prices when client needs them
 */
export async function fetchLivePriceData(polymarketId: string): Promise<MarketLiveData | null> {
  const client = getPolymarketClient();

  // Use circuit breaker and failover for external API calls
  const market = await executeWithFailover(
    () => circuitBreakers.polymarket.execute(
      () => client.getMarket(polymarketId)
    ),
    {
      circuitBreaker: circuitBreakers.polymarket,
      retryOptions: {
        maxRetries: 2, // Fewer retries for client-facing API (faster failure)
        initialDelayMs: 500,
        maxDelayMs: 5000,
      },
      serviceName: 'Polymarket Live Prices',
      fallback: async () => null, // Return null if all retries fail
    }
  );

  if (!market) {
    return null;
  }

  try {

    // Extract odds from tokens
    let outcomes: string[] = [];
    if (typeof market.outcomes === 'string') {
      try {
        outcomes = JSON.parse(market.outcomes);
      } catch {
        outcomes = ['YES', 'NO'];
      }
    } else if (Array.isArray(market.outcomes)) {
      outcomes = market.outcomes;
    } else {
      outcomes = ['YES', 'NO'];
    }

    const thisOption = outcomes[0] || 'YES';
    const thatOption = outcomes[1] || 'NO';

    const thisOdds = market.tokens?.find((t) => t.outcome === thisOption)?.price || 0.5;
    const thatOdds = market.tokens?.find((t) => t.outcome === thatOption)?.price || 0.5;

    return {
      polymarketId: market.conditionId || market.condition_id || polymarketId,
      thisOdds,
      thatOdds,
      liquidity: market.liquidity || 0,
      volume: market.volume || 0,
      volume24hr: market.volume_24hr || 0,
      acceptingOrders: market.accepting_orders ?? false,
    };
  } catch (error: any) {
    const structuredError = createStructuredError(error);
    console.error(`[Markets Service] Failed to process live data for ${polymarketId}:`, {
      error: structuredError.message,
      type: structuredError.type,
    });
    return null;
  }
}

/**
 * Fetch LIVE price data for multiple markets (batch)
 * More efficient than calling fetchLivePriceData for each market
 */
export async function fetchBatchLivePriceData(
  polymarketIds: string[]
): Promise<Map<string, MarketLiveData>> {
  const results = new Map<string, MarketLiveData>();

  if (polymarketIds.length === 0) {
    return results;
  }

  // Fetch all markets in parallel
  const promises = polymarketIds.map(async (id) => {
    const liveData = await fetchLivePriceData(id);
    if (liveData) {
      results.set(id, liveData);
    }
  });

  await Promise.all(promises);

  return results;
}

/**
 * Get market with live data combined
 */
export async function getMarketWithLiveData(marketId: string): Promise<MarketWithLiveData | null> {
  try {
    const staticData = await getMarketById(marketId);

    if (!staticData) {
      console.log(`[Markets Service] Market not found: ${marketId}`);
      return null;
    }

    let liveData: MarketLiveData | null = null;
    if (staticData.polymarketId) {
      try {
        liveData = await fetchLivePriceData(staticData.polymarketId);
      } catch (error: any) {
        console.error(`[Markets Service] Error fetching live data for market ${marketId}:`, error.message);
        // Continue without live data - return static data only
        liveData = null;
      }
    } else {
      console.log(`[Markets Service] Market ${marketId} has no polymarketId, skipping live data fetch`);
    }

    return {
      ...staticData,
      live: liveData,
    };
  } catch (error: any) {
    console.error(`[Markets Service] Error in getMarketWithLiveData for ${marketId}:`, error.message);
    throw error; // Re-throw to be handled by controller
  }
}

/**
 * Get total market count
 */
export async function getMarketCount(): Promise<number> {
  return await marketsPrisma.market.count();
}

/**
 * Get all available categories with counts
 * Returns categories that have at least one open market
 */
export async function getCategories(): Promise<Array<{ category: string; count: number }>> {
  const categories = await marketsPrisma.market.groupBy({
    by: ['category'],
    where: {
      category: { not: null },
      status: 'open',  // Only count open markets
    },
    _count: { category: true },
    orderBy: { _count: { category: 'desc' } },
  });

  return categories
    .filter((c) => c.category !== null && c.category.trim() !== '')
    .map((c) => ({
      category: c.category as string,
      count: c._count.category,
    }));
}
