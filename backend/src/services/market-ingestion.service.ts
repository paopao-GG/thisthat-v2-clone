/**
 * Market Ingestion Service
 *
 * Server-side service that fetches markets from Polymarket and saves STATIC data only.
 * Price data (odds, liquidity, volume) is NOT saved - it's fetched live by client API.
 *
 * P1 Update: Now fetches token IDs from CLOB API for live price fetching.
 *
 * This follows the "lazy loading" pattern:
 * - Static data (title, description, options, expiry) is stored in PostgreSQL
 * - Dynamic data (prices) is fetched on-demand when client requests it via CLOB API
 */

import axios, { AxiosInstance } from 'axios';
import { marketsPrisma as prisma } from '../lib/database.js';
import { getPolymarketClient, type PolymarketMarket } from '../lib/polymarket-client.js';
import { retryWithBackoff } from '../lib/retry.js';
import { initializePoolWithProbability } from './amm.service.js';
import { waitForPolymarketSlot } from '../lib/polymarket-rate-limiter.js';

// Default expiration for markets without explicit end date (1 year from now)
const DEFAULT_EXPIRATION_DAYS = 365;

// P1: CLOB API client for fetching market details with token IDs
const CLOB_BASE_URL = 'https://clob.polymarket.com';
let clobClient: AxiosInstance | null = null;

function getClobClient(): AxiosInstance {
  if (!clobClient) {
    clobClient = axios.create({
      baseURL: CLOB_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000,
    });
  }
  return clobClient;
}

/**
 * P1: Fetch market details from CLOB API to get token IDs
 */
async function fetchClobMarketDetails(conditionId: string): Promise<{
  thisTokenId: string | null;
  thatTokenId: string | null;
  thisPrice: number | null;
  thatPrice: number | null;
} | null> {
  try {
    // Wait for rate limit slot before making CLOB API call
    const slotAcquired = await waitForPolymarketSlot(5000);
    if (!slotAcquired) {
      console.warn(`[Market Ingestion] Rate limit reached, skipping CLOB fetch for ${conditionId}`);
      return null;
    }

    const client = getClobClient();
    const response = await client.get(`/markets/${conditionId}`);
    const data = response.data;

    if (!data || !data.tokens || !Array.isArray(data.tokens)) {
      return null;
    }

    // Find YES (this) and NO (that) tokens
    const yesToken = data.tokens.find((t: any) => t.outcome?.toLowerCase() === 'yes');
    const noToken = data.tokens.find((t: any) => t.outcome?.toLowerCase() === 'no');

    return {
      thisTokenId: yesToken?.token_id || null,
      thatTokenId: noToken?.token_id || null,
      thisPrice: yesToken?.price || null,
      thatPrice: noToken?.price || null,
    };
  } catch (error: any) {
    // Don't log every failure - some markets might not exist in CLOB
    if (error?.response?.status !== 404) {
      console.warn(`[Market Ingestion] CLOB API error for ${conditionId}:`, error.message);
    }
    return null;
  }
}

/**
 * Validate image URL from external API before storing
 * Prevents storing malicious or malformed URLs
 */
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  // Must be HTTPS
  if (!url.startsWith('https://')) return false;

  // Basic URL format validation
  try {
    const parsed = new URL(url);
    // Must have a valid hostname
    if (!parsed.hostname || parsed.hostname.length < 3) return false;
    return true;
  } catch {
    return false;
  }
}

export interface MarketIngestionResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Extract static market data from Polymarket API response
 * Only includes fields that don't change frequently
 */
function clampOdds(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.5;
  }
  // Keep odds within (0,1) to avoid invalid payouts
  return Math.min(Math.max(value, 0.01), 0.99);
}

/**
 * Normalize odds to ensure they sum to 1.0
 * Handles cases where Polymarket returns invalid odds
 */
function normalizeOdds(thisOdds: number, thatOdds: number): { thisOdds: number; thatOdds: number } {
  const sum = thisOdds + thatOdds;

  // If sum is close to 1.0 (within 5% tolerance), keep as-is
  if (Math.abs(sum - 1.0) <= 0.05) {
    return { thisOdds, thatOdds };
  }

  // Otherwise, normalize by dividing each by the sum
  console.warn(`[Market Ingestion] Normalizing invalid odds: ${thisOdds} + ${thatOdds} = ${sum} (expected ~1.0)`);
  return {
    thisOdds: thisOdds / sum,
    thatOdds: thatOdds / sum,
  };
}

function extractStaticData(market: PolymarketMarket) {
  // Extract THIS/THAT options from outcomes
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

  // P1: Extract token IDs for CLOB API price fetching
  const thisToken = market.tokens?.find((t) => t.outcome === thisOption);
  const thatToken = market.tokens?.find((t) => t.outcome === thatOption);
  const thisTokenId = thisToken?.token_id || null;
  const thatTokenId = thatToken?.token_id || null;
  const thisTokenPrice = thisToken?.price;
  const thatTokenPrice = thatToken?.price;

  // Determine status from Polymarket fields
  // Priority: archived > accepting_orders > closed > active
  let status: 'open' | 'closed' | 'resolved' = 'open';
  if (market.archived) {
    status = 'closed';
  } else if (market.accepting_orders === true) {
    status = 'open';
  } else if (market.accepting_orders === false || market.closed) {
    status = 'closed';
  }

  // Parse end date with fallback to default expiration
  const endDateStr = market.endDateIso || market.end_date_iso;
  let expiresAt: Date;

  if (endDateStr) {
    expiresAt = new Date(endDateStr);
  } else {
    // Default: 1 year from now for markets without explicit expiration
    expiresAt = new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
    console.warn(`[Market Ingestion] No expiration date for market ${market.conditionId || market.condition_id}, using default (${DEFAULT_EXPIRATION_DAYS} days)`);
  }

  // Derive category from market data
  // Priority: 1) market.category, 2) first tag, 3) derive from title/description
  // CRITICAL FIX: Normalize category to lowercase for consistency
  let category = market.category?.trim().toLowerCase() || null;

  if (!category && market.tags && market.tags.length > 0) {
    // Use first tag as category if available (normalized to lowercase)
    category = market.tags[0]?.trim().toLowerCase() || null;
  }

  if (!category) {
    // Derive category from title/description keywords
    // Priority order matters - more specific categories checked first
    const titleLower = (market.question || '').toLowerCase();
    const descLower = (market.description || '').toLowerCase();
    const combined = `${titleLower} ${descLower}`;

    // Category keywords mapping (SPORTS FIRST - highest priority)
    // Priority order matters - more specific categories checked first
    if (combined.match(/\b(nfl|nba|mlb|nhl|fifa|uefa|super\s+bowl|world\s+series|stanley\s+cup|olympics|championship|playoff|tournament|league|premier\s+league|serie\s+a|la\s+liga|bundesliga|eredivisie|ligue\s+1|football|basketball|baseball|hockey|soccer|tennis|golf|masters|formula\s+1|f1|ufc|boxing|mma|relegated?|relegation)\b/)) {
      category = 'sports';
    } else if (combined.match(/\b(academy\s+awards?|oscar|golden\s+globe|entertainment|movie|film|tv\s+show|television|celebrity|award\s+show|grammy|emmy|mtv|billboard|actor|actress|director|screenplay|concert|streaming|netflix)\b/)) {
      category = 'entertainment';
    } else if (combined.match(/\b(presidential\s+election|presidential\s+race|general\s+election|electoral\s+college|midterm\s+election|primary\s+election)\b/) ||
               (combined.match(/\b(election|vote|voting|ballot|primary|electoral|midterm)\b/) && !combined.match(/\b(selection|reelection)\b/))) {
      category = 'elections';
    } else if (combined.match(/\b(trump|biden|congress|senate|house\s+of\s+representatives|governor|supreme\s+court|white\s+house|politics|political\s+party)\b/)) {
      category = 'politics';
    } else if (combined.match(/\b(china|russia|europe|asia|africa|middle\s+east|israel|palestine|iran|korea|war|military|conflict|nato|ukraine|india|japan)\b/)) {
      category = 'international';
    } else if (combined.match(/\b(company|ceo|merger|acquisition|revenue|earnings|ipo|startup|business|corporate|venture\s+capital)\b/)) {
      category = 'business';
    } else if (combined.match(/\b(economy|recession|inflation|federal\s+reserve|fed|interest\s+rate|gdp|unemployment|stock\s+market|jobs|economic)\b/)) {
      category = 'economics';
    } else if (combined.match(/\b(technology|artificial\s+intelligence|machine\s+learning|ai\s+model|tech|software|hardware|apple|google|microsoft|openai|tesla|spacex|gpt|claude)\b/)) {
      category = 'technology';
    } else if (combined.match(/\b(crypto|bitcoin|ethereum|blockchain|defi|nft|token|coinbase|binance|web3|solana|btc|eth)\b/)) {
      category = 'crypto';
    } else if (combined.match(/\b(science|research|study|discovery|space\s+exploration|nasa|physics|biology|chemistry|scientific)\b/)) {
      category = 'science';
    } else {
      // Default category
      category = 'general';
    }
  }

  // Calculate AMM reserves based on Polymarket probability
  // Default total liquidity: 10,000 (5x larger than initial 2,000 for better price stability)
  const INITIAL_LIQUIDITY = 10000;
  const yesProbability = clampOdds(thisTokenPrice); // Probability of YES (this)

  // Initialize pool with the probability from Polymarket
  // P(YES) = noReserve / (yesReserve + noReserve)
  // noReserve = P(YES) * L, yesReserve = (1 - P(YES)) * L
  const pool = initializePoolWithProbability(INITIAL_LIQUIDITY, yesProbability);

  // Calculate raw odds
  const rawThisOdds = yesProbability;
  const rawThatOdds = clampOdds(thatTokenPrice ?? (thisTokenPrice ? 1 - thisTokenPrice : undefined));

  // Normalize odds to ensure they sum to 1.0
  const normalizedOdds = normalizeOdds(rawThisOdds, rawThatOdds);

  // Extract image URL from market data (CLOB API returns image/icon)
  // Prefer 'image' over 'icon', validate before storing
  const rawImageUrl = market.image || market.icon || null;
  const imageUrl = isValidImageUrl(rawImageUrl) ? rawImageUrl : null;

  return {
    polymarketId: market.conditionId || market.condition_id,
    title: market.question,
    description: market.description || null,
    imageUrl, // Extract from market data, fallback to event data if null
    thisOption,
    thatOption,

    // P1: Token IDs for CLOB API price fetching
    thisTokenId,
    thatTokenId,

    // AMM reserves (DEPRECATED - kept for backwards compatibility)
    // P1: These are no longer used for pricing - prices come from Polymarket CLOB API
    yesReserve: pool.yesReserve,
    noReserve: pool.noReserve,

    // Cached odds from Polymarket (updated during ingestion)
    thisOdds: normalizedOdds.thisOdds,
    thatOdds: normalizedOdds.thatOdds,

    // P1: Track when prices were last updated
    lastPriceUpdate: new Date(),

    liquidity: typeof market.liquidity === 'number' ? Number(market.liquidity) : null,
    volume: typeof market.volume === 'number' ? Number(market.volume) : null,
    volume24hr: typeof market.volume_24hr === 'number' ? Number(market.volume_24hr) : null,
    category,
    marketType: 'polymarket' as const,
    status,
    expiresAt, // Now always a Date (never null)
  };
}

/**
 * Ingest markets from Polymarket API and save to PostgreSQL
 * Only saves static data - no prices
 */
export async function ingestMarketsFromPolymarket(options?: {
  limit?: number;
  activeOnly?: boolean;
  category?: string;
}): Promise<MarketIngestionResult> {
  const client = getPolymarketClient();
  const totalTarget = options?.limit ?? 1000;
  const activeOnly = options?.activeOnly ?? true;
  const categoryFilter = options?.category?.toLowerCase();
  const maxPageSize = Number(process.env.POLYMARKET_PAGE_SIZE) || 50; // Gamma API returns 50 per page

  const result: MarketIngestionResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    console.log('[Market Ingestion] Fetching markets from Polymarket...');
    console.log(`[Market Ingestion] Parameters: limit=${totalTarget}, activeOnly=${activeOnly}, category=${categoryFilter ?? 'ALL'}, pageSize=${maxPageSize}`);

    // Retry API call with exponential backoff and circuit breaker
    const { executeWithFailover, circuitBreakers } = await import('../lib/error-handler.js');

    let offset = 0;
    let fetchedCount = 0;

    // When filtering by category, we need to fetch MORE markets since most will be filtered out
    // Rough category distribution: sports (40%), general (25%), politics (20%), others (15%)
    // So to get 1000 markets in a specific category, we might need to fetch 5000-10000 total
    const fetchMultiplier = categoryFilter ? 10 : 1; // Fetch 10x more when filtering by category
    const adjustedTarget = Math.min(totalTarget * fetchMultiplier, 5000); // Cap at 5000 to avoid overwhelming

    while (fetchedCount < adjustedTarget && result.total < totalTarget) {
      const remaining = adjustedTarget - fetchedCount;
      const batchSize = Math.min(remaining, maxPageSize);

      console.log(`[Market Ingestion] Fetching batch: offset=${offset}, batchSize=${batchSize}`);

      const markets = await executeWithFailover(
        () =>
          circuitBreakers.polymarket.execute(
            () => client.getMarkets({
              closed: !activeOnly, // false = active markets
              limit: batchSize,
              offset,
            })
          ),
        {
          circuitBreaker: circuitBreakers.polymarket,
          retryOptions: {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
          },
          serviceName: 'Polymarket Market Ingestion',
          fallback: async () => {
            console.warn('[Market Ingestion] Polymarket API unavailable, returning empty result');
            return [];
          },
        }
      ) || [];
      
      console.log(`[Market Ingestion] API returned ${Array.isArray(markets) ? markets.length : 'non-array'} markets for offset ${offset}`);

      if (!Array.isArray(markets)) {
        console.error(
          '[Market Ingestion] Invalid response from Polymarket API - expected array, received:',
          markets
        );
        break;
      }

      if (markets.length === 0) {
        console.warn('[Market Ingestion] Polymarket returned 0 markets for this batch. Ending pagination early.');
        break;
      }

      fetchedCount += markets.length;
      offset += markets.length;

      console.log(
        `[Market Ingestion] Processing ${markets.length} markets from batch (filtering for category: ${categoryFilter || 'ALL'})`
      );

      for (const market of markets) {
      try {
        const staticData = extractStaticData(market);

        // Skip if missing required fields
        if (!staticData.polymarketId || !staticData.title) {
          result.skipped++;
          continue;
        }

        // Filter by category AFTER we've categorized the market
        if (categoryFilter && staticData.category !== categoryFilter) {
          result.skipped++;
          continue;
        }

        result.total++;

        // P1: Fetch token IDs from CLOB API (Gamma API doesn't return them)
        // Only fetch if we don't already have token IDs
        if (!staticData.thisTokenId && !staticData.thatTokenId) {
          const clobDetails = await fetchClobMarketDetails(staticData.polymarketId);
          if (clobDetails) {
            staticData.thisTokenId = clobDetails.thisTokenId;
            staticData.thatTokenId = clobDetails.thatTokenId;
            // Also use CLOB prices if available (more accurate)
            if (clobDetails.thisPrice !== null) {
              staticData.thisOdds = clampOdds(clobDetails.thisPrice);
            }
            if (clobDetails.thatPrice !== null) {
              staticData.thatOdds = clampOdds(clobDetails.thatPrice);
            }
          }
        }

        // Check if market exists
        const existing = await prisma.market.findUnique({
          where: { polymarketId: staticData.polymarketId },
        });

        if (existing) {
          // Update existing market (only static fields)
          // DON'T overwrite reserves if users have already placed bets
          // Only update reserves if no bets exist (market is fresh)
          const updateData: any = {
            title: staticData.title,
            description: staticData.description,
            // Only update imageUrl if existing is null (don't overwrite event images)
            ...(existing.imageUrl ? {} : { imageUrl: staticData.imageUrl }),
            thisOption: staticData.thisOption,
            thatOption: staticData.thatOption,
            // P1: Always update token IDs (they don't change but might be missing)
            thisTokenId: staticData.thisTokenId,
            thatTokenId: staticData.thatTokenId,
            thisOdds: staticData.thisOdds,
            thatOdds: staticData.thatOdds,
            lastPriceUpdate: staticData.lastPriceUpdate,
            liquidity: staticData.liquidity,
            volume: staticData.volume,
            volume24hr: staticData.volume24hr,
            category: staticData.category,
            status: staticData.status,
            expiresAt: staticData.expiresAt,
            updatedAt: new Date(),
          };

          // Only update reserves if they're still at default values (no bets placed)
          // Default reserves are 1000/1000 (50-50 probability)
          // @ts-ignore - yesReserve/noReserve not in current Prisma types until regenerated
          const currentYes = Number(existing.yesReserve || 1000);
          // @ts-ignore
          const currentNo = Number(existing.noReserve || 1000);
          if (currentYes === 1000 && currentNo === 1000) {
            updateData.yesReserve = staticData.yesReserve;
            updateData.noReserve = staticData.noReserve;
          }

          await prisma.market.update({
            where: { polymarketId: staticData.polymarketId },
            data: updateData,
          });
          result.updated++;
        } else {
          // Create new market with AMM reserves
          await prisma.market.create({
            data: staticData,
          });
          result.created++;
        }
      } catch (error: any) {
        const marketId = market?.conditionId || 'unknown';
        console.error(
          `[Market Ingestion] Error processing market ${marketId}:`,
          error.message
        );
        result.errors++;
        // Continue processing other markets even if one fails
      }
      }

      if (markets.length < batchSize) {
        console.log('[Market Ingestion] Received fewer markets than requested, assuming end of data');
        break;
      }
    }

    console.log(
      `[Market Ingestion] Complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors (total processed: ${result.total})`
    );
    return result;
  } catch (error: any) {
    console.error('[Market Ingestion] Fatal error:', error?.message || error);
    // Return partial result instead of throwing to allow job to continue
    return result;
  }
}

/**
 * Fetch event data and update market images
 * Events contain image URLs that should be applied to their markets
 */
export async function updateMarketImagesFromEvents(): Promise<{
  eventsProcessed: number;
  marketsUpdated: number;
  errors: number;
}> {
  const client = getPolymarketClient();
  const result = {
    eventsProcessed: 0,
    marketsUpdated: 0,
    errors: 0,
  };

  try {
    console.log('[Image Update] Fetching events from Polymarket...');

    // Fetch ALL active events (not just featured) to get more images
    // First get featured events (they have better quality images)
    const featuredEvents = await client.getEvents({
      closed: false,
      featured: true,
      limit: 100,
    });

    // Then get all active events to cover non-featured ones
    const allEvents = await client.getEvents({
      closed: false,
      limit: 500,
    });

    // Combine and deduplicate by event ID
    const eventMap = new Map();
    // Add featured first (they have priority for images)
    for (const event of featuredEvents) {
      eventMap.set(event.id, event);
    }
    // Add non-featured (won't overwrite featured ones)
    for (const event of allEvents) {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    }

    const events = Array.from(eventMap.values());
    console.log(`[Image Update] Processing ${events.length} unique events for images (${featuredEvents.length} featured, ${allEvents.length} total fetched)`);

    for (const event of events) {
      try {
        result.eventsProcessed++;

        // Extract image URL (prefer 'image' over 'icon')
        const rawImageUrl = event.image || event.icon || event.image_url || event.icon_url || null;

        // Validate URL before using it
        if (!isValidImageUrl(rawImageUrl)) {
          continue; // Skip events with invalid or missing images
        }

        const imageUrl = rawImageUrl as string; // Type narrowing after validation

        // Get markets in this event
        const markets = event.markets || [];

        if (markets.length === 0) {
          // If no markets in event object, try fetching them
          const eventId = event.id;
          if (eventId) {
            const eventMarkets = await client.getEventMarkets(eventId);
            markets.push(...eventMarkets);
          }
        }

        for (const market of markets) {
          try {
            const conditionId = market.conditionId || market.condition_id;
            if (!conditionId) continue;

            // Update market imageUrl if market exists and doesn't have an image
            const updated = await prisma.market.updateMany({
              where: {
                polymarketId: conditionId,
                imageUrl: null, // Only update if no image exists
              },
              data: { imageUrl },
            });

            if (updated.count > 0) {
              result.marketsUpdated += updated.count;
            }
          } catch (marketError: any) {
            console.error(`[Image Update] Error updating market ${market.conditionId}:`, marketError.message);
            result.errors++;
          }
        }
      } catch (eventError: any) {
        console.error(`[Image Update] Error processing event ${event.id}:`, eventError.message);
        result.errors++;
      }
    }

    console.log(
      `[Image Update] Complete: ${result.eventsProcessed} events processed, ${result.marketsUpdated} markets updated, ${result.errors} errors`
    );
  } catch (error: any) {
    console.error('[Image Update] Fatal error:', error?.message || error);
  }

  return result;
}

/**
 * P1: Backfill token IDs for existing markets missing them
 * Call this after initial deployment to populate token IDs
 */
export async function backfillTokenIds(options?: {
  batchSize?: number;
  limit?: number;
}): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const batchSize = options?.batchSize ?? 50;
  const limit = options?.limit ?? 10000;
  const MAX_CONCURRENT_REQUESTS = 3; // Reduced from 5 to 3 for safety with rate limiter

  const result = {
    processed: 0,
    updated: 0,
    errors: 0,
  };

  console.log(`[Token Backfill] Starting backfill (batchSize=${batchSize}, limit=${limit}, concurrency=${MAX_CONCURRENT_REQUESTS})`);

  try {
    // Get markets missing token IDs
    const marketsToUpdate = await prisma.market.findMany({
      where: {
        thisTokenId: null,
        polymarketId: { not: null },
        status: 'open',
      },
      select: {
        id: true,
        polymarketId: true,
      },
      take: limit,
    });

    console.log(`[Token Backfill] Found ${marketsToUpdate.length} markets missing token IDs`);

    // Process in batches
    for (let i = 0; i < marketsToUpdate.length; i += batchSize) {
      const batch = marketsToUpdate.slice(i, i + batchSize);
      console.log(`[Token Backfill] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(marketsToUpdate.length / batchSize)}`);

      // Process batch with controlled concurrency
      for (let j = 0; j < batch.length; j += MAX_CONCURRENT_REQUESTS) {
        const chunk = batch.slice(j, j + MAX_CONCURRENT_REQUESTS);

        await Promise.all(
          chunk.map(async (market) => {
            result.processed++;
            try {
              if (!market.polymarketId) {
                console.warn(`[Token Backfill] Skipping market ${market.id} - missing polymarketId`);
                result.errors++;
                return;
              }

              // Rate limiter is already integrated into fetchClobMarketDetails
              const clobDetails = await fetchClobMarketDetails(market.polymarketId);

              if (!clobDetails) {
                console.warn(`[Token Backfill] Could not fetch CLOB details for market ${market.id}`);
                result.errors++;
                return;
              }

              if (clobDetails.thisTokenId || clobDetails.thatTokenId) {
                await prisma.market.update({
                  where: { id: market.id },
                  data: {
                    thisTokenId: clobDetails.thisTokenId,
                    thatTokenId: clobDetails.thatTokenId,
                    thisOdds: clobDetails.thisPrice ? clampOdds(clobDetails.thisPrice) : undefined,
                    thatOdds: clobDetails.thatPrice ? clampOdds(clobDetails.thatPrice) : undefined,
                    lastPriceUpdate: new Date(),
                  },
                });
                result.updated++;
              } else {
                console.warn(`[Token Backfill] CLOB returned no token IDs for market ${market.id}`);
                result.errors++;
              }
            } catch (error: any) {
              console.error(`[Token Backfill] Error for market ${market.id}:`, error.message);
              result.errors++;
            }
          })
        );

        // Delay between chunks (rate limiter handles this too, but extra safety)
        if (j + MAX_CONCURRENT_REQUESTS < batch.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Delay between batches
      if (i + batchSize < marketsToUpdate.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`[Token Backfill] Completed: ${result.updated} updated, ${result.errors} errors, ${result.processed} processed`);
  } catch (error: any) {
    console.error('[Token Backfill] Fatal error:', error.message);
  }

  return result;
}

/**
 * Get market counts from PostgreSQL
 */
export async function getMarketCounts(): Promise<{
  total: number;
  open: number;
  closed: number;
  resolved: number;
  expiringSoon: number; // Markets expiring in next 24 hours
}> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [total, open, closed, resolved, expiringSoon] = await Promise.all([
    prisma.market.count(),
    prisma.market.count({ where: { status: 'open' } }),
    prisma.market.count({ where: { status: 'closed' } }),
    prisma.market.count({ where: { status: 'resolved' } }),
    prisma.market.count({
      where: {
        status: 'open',
        expiresAt: {
          gte: now,
          lte: tomorrow,
        },
      },
    }),
  ]);

  return { total, open, closed, resolved, expiringSoon };
}
