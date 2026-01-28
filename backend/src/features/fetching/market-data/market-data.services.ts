// Market data service - Normalize Polymarket data
// NOTE: MongoDB has been removed. Only normalizeMarket function is kept for use by betting service.
// Market ingestion now happens via market-ingestion.service.ts which writes directly to PostgreSQL.
import { type PolymarketMarket } from '../../../lib/polymarket-client.js';
import type { FlattenedMarket } from './market-data.models.js';

/**
 * Normalize Polymarket market data to our flat structure
 * 
 * IMPORTANT: Per lazy loading pattern (docs/MARKET_FETCHING.md):
 * - Only stores STATIC fields (id, title, description, author, category, expiresAt)
 * - Does NOT store price fields (thisOdds, thatOdds, liquidity, volume)
 * - Prices are fetched on-demand from Polymarket API when client needs them
 */
export function normalizeMarket(polymarketData: PolymarketMarket): FlattenedMarket {
  // Extract THIS/THAT from outcomes (binary markets)
  // Note: Polymarket API returns outcomes as a JSON string, so we need to parse it
  let outcomes: string[] = [];
  if (typeof polymarketData.outcomes === 'string') {
    try {
      outcomes = JSON.parse(polymarketData.outcomes);
    } catch (e) {
      console.warn('Failed to parse outcomes string:', polymarketData.outcomes);
      outcomes = ['YES', 'NO'];
    }
  } else if (Array.isArray(polymarketData.outcomes)) {
    outcomes = polymarketData.outcomes;
  } else {
    outcomes = ['YES', 'NO'];
  }

  const thisOption = outcomes[0] || 'YES';
  const thatOption = outcomes[1] || 'NO';

  // NOTE: Price extraction removed - prices should NOT be stored per lazy loading pattern
  // Prices (thisOdds, thatOdds, liquidity, volume) are fetched on-demand from Polymarket API

  // Determine status
  // Note: Polymarket's 'active' and 'closed' fields are unreliable
  // 'accepting_orders' is the ONLY reliable indicator of market status
  // Priority: archived > accepting_orders (true indicator) > fallback to closed/active
  let status: 'active' | 'closed' | 'archived' = 'closed';

  if (polymarketData.archived) {
    status = 'archived';
  } else if (polymarketData.accepting_orders === true) {
    // Market is truly active and accepting bets (regardless of 'closed' field)
    status = 'active';
  } else if (polymarketData.accepting_orders === false) {
    // Market exists but not accepting orders
    status = 'closed';
  } else if (polymarketData.closed) {
    // Fallback: use closed field if accepting_orders not available
    status = 'closed';
  } else if (polymarketData.active === true) {
    // Fallback: use active field if neither accepting_orders nor closed available
    status = 'active';
  }

  // Parse end date (expiresAt)
  const endDateStr = polymarketData.endDateIso || polymarketData.end_date_iso;

  const conditionId = polymarketData.conditionId || polymarketData.condition_id;
  if (!conditionId) {
    throw new Error('Market data is missing conditionId');
  }

  return {
    conditionId,
    questionId: polymarketData.questionID || polymarketData.question_id,
    marketSlug: polymarketData.marketSlug || polymarketData.market_slug,

    // Static content fields (STORED)
    question: polymarketData.question,
    description: polymarketData.description,
    author: polymarketData.submitted_by, // Market creator/author

    // Binary options (STATIC - stored)
    thisOption,
    thatOption,

    // Price fields - NOT STORED per lazy loading pattern
    // These should be undefined - prices fetched on-demand from Polymarket API
    thisOdds: undefined,
    thatOdds: undefined,
    volume: undefined,
    volume24hr: undefined,
    liquidity: undefined,

    // Metadata (STATIC - stored)
    category: polymarketData.category,
    tags: polymarketData.tags,
    status,
    featured: polymarketData.featured,

    // Dates (STATIC - stored)
    startDate: polymarketData.gameStartTime || polymarketData.game_start_time,
    endDate: endDateStr, // Market expiration/due date

    // Source tracking
    source: 'polymarket',
    // rawData removed to save space - can be fetched from Polymarket API if needed

    // Timestamps
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * DEPRECATED: MongoDB functions removed.
 * 
 * Market ingestion now happens via market-ingestion.service.ts which writes directly to PostgreSQL.
 * These functions are kept for backward compatibility but are no-ops.
 */

/**
 * DEPRECATED: Use market-ingestion.service.ts instead
 */
export async function fetchAndSaveMarkets(options?: {
  active?: boolean;
  limit?: number;
}): Promise<{ saved: number; errors: number }> {
  console.warn('[DEPRECATED] fetchAndSaveMarkets is deprecated. Use market-ingestion.service.ts instead.');
  return { saved: 0, errors: 0 };
}

/**
 * DEPRECATED: Use markets.services.ts (PostgreSQL) instead
 */
export async function getAllMarkets(filter?: {
  status?: 'active' | 'closed' | 'archived';
  category?: string;
  featured?: boolean;
  limit?: number;
  skip?: number;
}): Promise<FlattenedMarket[]> {
  console.warn('[DEPRECATED] getAllMarkets is deprecated. Use markets.services.ts (PostgreSQL) instead.');
  return [];
}

/**
 * DEPRECATED: Use markets.services.ts (PostgreSQL) instead
 */
export async function getMarketStats(): Promise<any> {
  console.warn('[DEPRECATED] getMarketStats is deprecated. Use markets.services.ts (PostgreSQL) instead.');
  return {
    totalMarkets: 0,
    activeMarkets: 0,
    closedMarkets: 0,
    archivedMarkets: 0,
    featuredMarkets: 0,
    categoryCounts: {},
    lastUpdated: new Date(),
  };
}
