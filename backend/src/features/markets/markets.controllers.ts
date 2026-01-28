/**
 * Markets Controllers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as marketsService from './markets.services.js';
import * as marketSkipService from './market-skip.services.js';
import { ingestMarketsFromPolymarket, backfillTokenIds } from '../../services/market-ingestion.service.js';
import { sendErrorResponse, sendValidationError } from '../../lib/error-response.js';
import { createStructuredError } from '../../lib/error-handler.js';
import {
  getPrice,
  getPrices,
  getPriceHistory,
  isPriceServiceAvailable,
  getCircuitBreakerStatus,
  type PriceInterval,
} from '../../services/polymarket-price.service.js';

/**
 * Get markets with live prices
 */
export async function getMarketsHandler(
  request: FastifyRequest<{
    Querystring: {
      status?: string;
      category?: string;
      filter?: string; // NEW: 'ending_soon' | 'popular'
      limit?: string;
      skip?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const status = request.query.status || 'open';
    const category = request.query.category;
    const requestedLimit = request.query.limit ? parseInt(request.query.limit) : 1000;
    const limit = Math.min(requestedLimit, 1000); // Cap at 1000 to prevent abuse
    const skip = request.query.skip ? parseInt(request.query.skip) : 0;

    // TYPE-SAFE filter validation (don't lie to TypeScript with `as` cast)
    const filterRaw = request.query.filter;
    const validFilters = ['ending_soon', 'popular'] as const;
    const filter: 'ending_soon' | 'popular' | undefined =
      filterRaw && validFilters.includes(filterRaw as typeof validFilters[number])
        ? (filterRaw as 'ending_soon' | 'popular')
        : undefined;

    // Return 400 if filter was provided but invalid
    if (filterRaw && !filter) {
      return reply.status(400).send({
        success: false,
        error: `Invalid filter value '${filterRaw}'. Must be 'ending_soon' or 'popular'`,
      });
    }

    // Get markets from PostgreSQL
    const markets = await marketsService.getMarkets({
      status: status as 'open' | 'closed' | 'resolved',
      category,
      filter, // NEW - now type-safe
      limit,
      skip,
      userId: (request.user as any)?.userId, // Filter out skipped markets for authenticated users
    });

    // Return markets with database odds (refreshed every 50 mins by ingestion job)
    // Live odds will be fetched on-demand by frontend when card is displayed
    const marketsWithDefaults = markets.map(market => ({
      ...market,
      thisOdds: market.thisOdds || 0.5,
      thatOdds: market.thatOdds || 0.5,
      liquidity: market.liquidity || 0,
    }));

    return reply.send({
      success: true,
      count: marketsWithDefaults.length,
      filter: filter || null, // NEW: Include applied filter in response
      data: marketsWithDefaults,
    });
  } catch (error: any) {
    request.log.error({
      error: createStructuredError(error),
      stack: error.stack
    }, 'Failed to get markets');
    return sendErrorResponse(reply, error, 'Failed to get markets');
  }
}

/**
 * Trigger on-demand ingestion from Polymarket
 */
export async function ingestMarketsHandler(
  request: FastifyRequest<{
    Body: {
      limit?: number;
      category?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { limit, category } = request.body || {};
    const result = await ingestMarketsFromPolymarket({
      limit,
      activeOnly: true,
      category,
    });

    return reply.send({
      success: true,
      data: result,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to ingest markets');
    return reply.status(500).send({
      success: false,
      error: 'Failed to ingest markets',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * P1: Backfill token IDs for existing markets
 * Call this once after deployment to populate missing token IDs
 */
export async function backfillTokenIdsHandler(
  request: FastifyRequest<{
    Body: {
      batchSize?: number;
      limit?: number;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { batchSize, limit } = request.body || {};
    const result = await backfillTokenIds({ batchSize, limit });

    return reply.send({
      success: true,
      data: result,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to backfill token IDs');
    return reply.status(500).send({
      success: false,
      error: 'Failed to backfill token IDs',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get random markets (static data only)
 * Now prioritizes popular markets (high volume24hr) by default
 */
export async function getRandomMarketsHandler(
  request: FastifyRequest<{
    Querystring: {
      count?: string;
      popular?: string; // 'true' or 'false'
    };
  }>,
  reply: FastifyReply
) {
  try {
    const count = request.query.count ? parseInt(request.query.count) : 10;
    const maxCount = Math.min(count, 50); // Cap at 50
    const prioritizePopular = request.query.popular !== 'false'; // Default true

    // NEW: Pass prioritizePopular flag to service
    const markets = await marketsService.getRandomMarkets(maxCount, prioritizePopular);

    return reply.send({
      success: true,
      count: markets.length,
      data: markets,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get random markets');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get random markets',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get single market by ID (static data only)
 */
export async function getMarketByIdHandler(
  request: FastifyRequest<{
    Params: {
      id: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const market = await marketsService.getMarketById(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: 'Market not found',
      });
    }

    // Ensure odds and liquidity always have sensible defaults,
    // mirroring the logic used in getMarketsHandler
    const marketWithDefaults = {
      ...market,
      thisOdds: market.thisOdds || 0.5,
      thatOdds: market.thatOdds || 0.5,
      liquidity: market.liquidity || 0,
    };

    return reply.send({
      success: true,
      data: marketWithDefaults,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get market');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get market',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get live prices for a market - P1 Polymarket Integration
 * Now fetches live prices from Polymarket CLOB API
 */
export async function getMarketLiveHandler(
  request: FastifyRequest<{
    Params: {
      id: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const market = await marketsService.getMarketById(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: 'Market not found',
      });
    }

    // P1: Check if Polymarket service is available
    if (!(await isPriceServiceAvailable())) {
      return reply.status(503).send({
        success: false,
        error: 'Polymarket is currently unavailable',
        isServiceDown: true,
      });
    }

    // P1: Get token IDs for live price fetching
    const thisTokenId = (market as any).thisTokenId;
    const thatTokenId = (market as any).thatTokenId;

    if (!thisTokenId && !thatTokenId) {
      // Fallback to database odds if no token IDs
      const liveData = {
        thisOdds: market.thisOdds || 0.5,
        thatOdds: market.thatOdds || 0.5,
        liquidity: market.liquidity || 0,
        isLive: false,
      };

      return reply.send({
        success: true,
        data: liveData,
        marketId: id,
      });
    }

    // P1: Fetch live prices from Polymarket
    const tokenIds = [thisTokenId, thatTokenId].filter(Boolean);
    const prices = await getPrices(tokenIds);

    const thisPrice = thisTokenId ? prices.get(thisTokenId) : null;
    const thatPrice = thatTokenId ? prices.get(thatTokenId) : null;

    const liveData = {
      thisOdds: thisPrice?.isAvailable ? thisPrice.midpoint : (market.thisOdds || 0.5),
      thatOdds: thatPrice?.isAvailable ? thatPrice.midpoint : (market.thatOdds || 0.5),
      liquidity: market.liquidity || 0,
      spread: thisPrice?.spread || 0,
      isLive: thisPrice?.isAvailable || thatPrice?.isAvailable || false,
      lastUpdated: thisPrice?.lastUpdated || thatPrice?.lastUpdated || null,
    };

    console.log('[Live API] P1 Returning live Polymarket data:', {
      marketId: id,
      thisOdds: liveData.thisOdds,
      thatOdds: liveData.thatOdds,
      isLive: liveData.isLive,
    });

    return reply.send({
      success: true,
      data: liveData,
      marketId: id,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get live prices');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get live prices',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get price history for a market - P1 Polymarket Integration
 * Returns price history from Polymarket for charts
 */
export async function getMarketPriceHistoryHandler(
  request: FastifyRequest<{
    Params: {
      id: string;
    };
    Querystring: {
      interval?: string;
      side?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const interval = (request.query.interval || '1d') as PriceInterval;
    const side = (request.query.side || 'this') as 'this' | 'that';

    // Validate interval
    const validIntervals: PriceInterval[] = ['1h', '6h', '1d', '1w', 'max'];
    if (!validIntervals.includes(interval)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid interval. Must be one of: ${validIntervals.join(', ')}`,
      });
    }

    const market = await marketsService.getMarketById(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: 'Market not found',
      });
    }

    // P1: Check if Polymarket service is available
    if (!(await isPriceServiceAvailable())) {
      return reply.status(503).send({
        success: false,
        error: 'Polymarket is currently unavailable',
        isServiceDown: true,
      });
    }

    // P1: Get token ID for the requested side
    const tokenId = side === 'this' ? (market as any).thisTokenId : (market as any).thatTokenId;

    if (!tokenId) {
      return reply.status(400).send({
        success: false,
        error: 'Market is not configured for price history',
      });
    }

    // P1: Fetch price history from Polymarket
    const history = await getPriceHistory(tokenId, interval);

    return reply.send({
      success: true,
      data: {
        marketId: id,
        side,
        interval,
        history,
      },
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get price history');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get price history',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get Polymarket service status - P1
 */
export async function getPolymarketStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const isAvailable = await isPriceServiceAvailable();
    const circuitBreaker = await getCircuitBreakerStatus();

    return reply.send({
      success: true,
      data: {
        isAvailable,
        circuitBreaker: {
          isOpen: circuitBreaker.isOpen,
          failures: circuitBreaker.failures,
          lastFailure: circuitBreaker.lastFailure,
        },
      },
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get Polymarket status');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get Polymarket status',
    });
  }
}

/**
 * Get market with static + live data combined
 */
export async function getMarketFullHandler(
  request: FastifyRequest<{
    Params: {
      id: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    request.log.info({ marketId: id }, 'Fetching market with live data');
    
    const market = await marketsService.getMarketWithLiveData(id);

    if (!market) {
      request.log.warn({ marketId: id }, 'Market not found');
      return reply.status(404).send({
        success: false,
        error: 'Market not found',
      });
    }

    request.log.info({ marketId: id, hasLiveData: !!market.live }, 'Market fetched successfully');
    return reply.send({
      success: true,
      data: market,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack, marketId: request.params.id }, 'Failed to get market');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get market',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get markets by category
 */
export async function getMarketsByCategoryHandler(
  request: FastifyRequest<{
    Params: {
      category: string;
    };
    Querystring: {
      limit?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { category } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit) : 20;
    const maxLimit = Math.min(limit, 100); // Cap at 100

    const markets = await marketsService.getMarketsByCategory(category, maxLimit);

    return reply.send({
      success: true,
      count: markets.length,
      category,
      data: markets,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get markets by category');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get markets by category',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get market count
 */
export async function getMarketCountHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const count = await marketsService.getMarketCount();

    return reply.send({
      success: true,
      count,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get market count');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get market count',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Get all categories
 */
export async function getCategoriesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const categories = await marketsService.getCategories();

    // Ensure we always return an array, even if empty
    const categoriesArray = Array.isArray(categories) ? categories : [];

    request.log.info({ count: categoriesArray.length }, 'Categories fetched successfully');

    return reply.send({
      success: true,
      data: categoriesArray,
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to get categories');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get categories',
      details: error.message || 'Unknown error',
    });
  }
}

/**
 * Skip a market (user swiped up)
 * Marks market as skipped for 3 days
 */
export async function skipMarketHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { id: marketId } = request.params as { id: string };
    const userId = (request.user as any)?.userId;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const result = await marketSkipService.skipMarket(userId, marketId);

    return reply.send({
      success: true,
      data: {
        marketId,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error: any) {
    request.log.error({ error }, 'Failed to skip market');
    return reply.status(500).send({
      success: false,
      error: 'Failed to skip market',
      details: error.message || 'Unknown error',
    });
  }
}

