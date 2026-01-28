/**
 * Polymarket Price Service (P1 - Polymarket Liquidity Integration)
 *
 * Fetches live prices from Polymarket CLOB API with caching.
 * This replaces the internal AMM calculations - prices now come directly from Polymarket.
 *
 * Key features:
 * - Live price fetching from CLOB API
 * - In-memory and Redis caching (5-10 second TTL)
 * - Batch requests for multiple markets
 * - Circuit breaker for API resilience
 * - Price history fetching for charts
 */

import axios, { AxiosInstance } from 'axios';
import { retryWithBackoff } from '../lib/retry.js';
import redis from '../lib/redis.js';
import { waitForPolymarketSlot } from '../lib/polymarket-rate-limiter.js';

// ============================================================================
// Types
// ============================================================================

export interface LivePrice {
  tokenId: string;
  midpoint: number; // Current price (0-1), represents probability
  bestBid: number; // Best bid price
  bestAsk: number; // Best ask price
  spread: number; // Bid-ask spread
  lastUpdated: Date;
  isAvailable: boolean; // Whether live price was successfully fetched
}

export interface PriceHistoryPoint {
  timestamp: number; // Unix timestamp
  price: number; // Price at that time (0-1)
}

// Polymarket CLOB API supports: 1m, 5m, 1h, 6h, 1d, all (for max)
export type PriceInterval = '1h' | '6h' | '1d' | '1w' | 'max' | 'all';

// ============================================================================
// Configuration
// ============================================================================

const CLOB_BASE_URL = 'https://clob.polymarket.com';
const CACHE_TTL_MS = 10000; // 10 seconds cache TTL
const MAX_BATCH_SIZE = 50; // Maximum tokens per batch request

// ============================================================================
// Redis-Based Cache
// ============================================================================

const CACHE_TTL_SECONDS = 10; // 10 seconds cache TTL

/**
 * Get cached price from Redis
 */
async function getCachedPrice(tokenId: string): Promise<LivePrice | null> {
  try {
    if (!redis.isOpen) {
      return null; // Redis not available, skip cache
    }

    const cached = await redis.get(`price:${tokenId}`);
    if (!cached) return null;

    return JSON.parse(cached);
  } catch (error) {
    // Cache errors should not break the application
    console.warn(`[PolymarketPrice] Cache read error for ${tokenId}:`, error);
    return null;
  }
}

/**
 * Set cached price in Redis
 */
async function setCachedPrice(tokenId: string, price: LivePrice): Promise<void> {
  try {
    if (!redis.isOpen) {
      return; // Redis not available, skip cache
    }

    await redis.setEx(
      `price:${tokenId}`,
      CACHE_TTL_SECONDS,
      JSON.stringify(price)
    );
  } catch (error) {
    // Cache errors should not break the application
    console.warn(`[PolymarketPrice] Cache write error for ${tokenId}:`, error);
  }
}

// ============================================================================
// CLOB Client
// ============================================================================

let clobClient: AxiosInstance | null = null;

function getClobClient(): AxiosInstance {
  if (!clobClient) {
    clobClient = axios.create({
      baseURL: CLOB_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000, // 10 seconds
    });
  }
  return clobClient;
}

// ============================================================================
// Circuit Breaker for CLOB API (Redis-Based)
// ============================================================================

const CIRCUIT_BREAKER_KEY = 'polymarket:circuit-breaker';
const CIRCUIT_BREAKER_THRESHOLD = 3; // Open after 3 failures
const CIRCUIT_BREAKER_TIMEOUT_SECONDS = 30; // 30 seconds before retry

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Get circuit breaker state from Redis
 */
async function getCircuitBreakerState(): Promise<CircuitBreakerState> {
  try {
    if (!redis.isOpen) {
      // Redis unavailable, return closed state (allow requests)
      return { failures: 0, lastFailure: 0, isOpen: false };
    }

    const state = await redis.get(CIRCUIT_BREAKER_KEY);
    if (!state) {
      return { failures: 0, lastFailure: 0, isOpen: false };
    }

    return JSON.parse(state);
  } catch (error) {
    console.error('[PolymarketPrice] Error reading circuit breaker state:', error);
    return { failures: 0, lastFailure: 0, isOpen: false };
  }
}

/**
 * Set circuit breaker state in Redis
 */
async function setCircuitBreakerState(state: CircuitBreakerState): Promise<void> {
  try {
    if (!redis.isOpen) {
      return;
    }

    await redis.setEx(
      CIRCUIT_BREAKER_KEY,
      CIRCUIT_BREAKER_TIMEOUT_SECONDS * 2,
      JSON.stringify(state)
    );
  } catch (error) {
    console.error('[PolymarketPrice] Error writing circuit breaker state:', error);
  }
}

/**
 * Check if circuit breaker allows requests
 */
async function checkCircuitBreaker(): Promise<boolean> {
  const state = await getCircuitBreakerState();

  if (!state.isOpen) {
    return true; // Circuit closed, allow requests
  }

  // Check if timeout has passed
  const elapsed = Date.now() - state.lastFailure;
  if (elapsed > CIRCUIT_BREAKER_TIMEOUT_SECONDS * 1000) {
    // Timeout passed, reset circuit breaker
    await setCircuitBreakerState({ failures: 0, lastFailure: 0, isOpen: false });
    console.log('[PolymarketPrice] Circuit breaker reset, retrying API');
    return true;
  }

  return false; // Circuit still open
}

/**
 * Record successful API call
 */
async function recordSuccess(): Promise<void> {
  try {
    if (!redis.isOpen) {
      return;
    }

    // Clear circuit breaker state on success
    await redis.del(CIRCUIT_BREAKER_KEY);
  } catch (error) {
    console.error('[PolymarketPrice] Error recording success:', error);
  }
}

/**
 * Record failed API call
 */
async function recordFailure(): Promise<void> {
  const state = await getCircuitBreakerState();
  state.failures++;
  state.lastFailure = Date.now();

  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    console.error(
      `[PolymarketPrice] Circuit breaker OPEN after ${state.failures} failures (shared across all instances)`
    );
  }

  await setCircuitBreakerState(state);
}

// ============================================================================
// Price Fetching Functions
// ============================================================================

/**
 * Get live price for a single token
 */
export async function getPrice(tokenId: string): Promise<LivePrice> {
  // Check cache first
  const cached = await getCachedPrice(tokenId);
  if (cached) {
    return cached;
  }

  // Check circuit breaker
  if (!(await checkCircuitBreaker())) {
    return createUnavailablePrice(tokenId);
  }

  // Wait for rate limit slot
  const slotAcquired = await waitForPolymarketSlot(5000);
  if (!slotAcquired) {
    console.warn('[PolymarketPrice] Rate limit reached, returning cached/default price');
    return createUnavailablePrice(tokenId);
  }

  try {
    const client = getClobClient();

    // Fetch midpoint, bid, and ask in parallel
    const [midpointRes, spreadRes] = await Promise.all([
      retryWithBackoff(
        () => client.get('/midpoint', { params: { token_id: tokenId } }),
        { maxRetries: 2, initialDelayMs: 500 }
      ),
      retryWithBackoff(
        () => client.get('/spread', { params: { token_id: tokenId } }),
        { maxRetries: 2, initialDelayMs: 500 }
      ),
    ]);

    const midpoint = parseFloat(midpointRes.data?.mid || midpointRes.data || '0.5');
    const spread = spreadRes.data;

    const price: LivePrice = {
      tokenId,
      midpoint: isNaN(midpoint) ? 0.5 : midpoint,
      bestBid: parseFloat(spread?.bid || '0'),
      bestAsk: parseFloat(spread?.ask || '1'),
      spread: parseFloat(spread?.spread || '0'),
      lastUpdated: new Date(),
      isAvailable: true,
    };

    await recordSuccess();
    await setCachedPrice(tokenId, price);
    return price;
  } catch (error: any) {
    console.error(`[PolymarketPrice] Error fetching price for ${tokenId}:`, error.message);
    await recordFailure();
    return createUnavailablePrice(tokenId);
  }
}

/**
 * Get live prices for multiple tokens (batch request)
 */
export async function getPrices(tokenIds: string[]): Promise<Map<string, LivePrice>> {
  const results = new Map<string, LivePrice>();

  if (tokenIds.length === 0) {
    return results;
  }

  // Check cache for all tokens
  const uncachedTokens: string[] = [];
  for (const tokenId of tokenIds) {
    const cached = await getCachedPrice(tokenId);
    if (cached) {
      results.set(tokenId, cached);
    } else {
      uncachedTokens.push(tokenId);
    }
  }

  // If all cached, return early
  if (uncachedTokens.length === 0) {
    return results;
  }

  // Check circuit breaker
  if (!(await checkCircuitBreaker())) {
    for (const tokenId of uncachedTokens) {
      results.set(tokenId, createUnavailablePrice(tokenId));
    }
    return results;
  }

  // Wait for rate limit slot (batch counts as 1 request)
  const slotAcquired = await waitForPolymarketSlot(5000);
  if (!slotAcquired) {
    console.warn('[PolymarketPrice] Rate limit reached for batch request');
    for (const tokenId of uncachedTokens) {
      results.set(tokenId, createUnavailablePrice(tokenId));
    }
    return results;
  }

  try {
    const client = getClobClient();

    // Batch fetch midpoints
    const batchRequests = uncachedTokens.map((tokenId) => ({ token_id: tokenId }));

    // Split into chunks if needed
    const chunks: typeof batchRequests[] = [];
    for (let i = 0; i < batchRequests.length; i += MAX_BATCH_SIZE) {
      chunks.push(batchRequests.slice(i, i + MAX_BATCH_SIZE));
    }

    for (const chunk of chunks) {
      try {
        const response = await retryWithBackoff(
          () =>
            client.post('/midpoints', chunk),
          { maxRetries: 2, initialDelayMs: 500 }
        );

        // Parse batch response - CLOB API returns object with token_id as key
        // Format: { "token_id_1": "0.09", "token_id_2": "0.91" }
        const midpoints = response.data;
        if (midpoints && typeof midpoints === 'object') {
          for (const req of chunk) {
            const tokenId = req.token_id;
            const midpointValue = midpoints[tokenId];
            const midpoint = midpointValue ? parseFloat(midpointValue) : 0.5;

            const price: LivePrice = {
              tokenId,
              midpoint: isNaN(midpoint) ? 0.5 : midpoint,
              bestBid: 0, // Not available in batch
              bestAsk: 1,
              spread: 0,
              lastUpdated: new Date(),
              isAvailable: midpointValue !== undefined && midpointValue !== null,
            };

            results.set(tokenId, price);
            await setCachedPrice(tokenId, price);
          }
        }
      } catch (chunkError: any) {
        console.error('[PolymarketPrice] Batch chunk failed:', chunkError.message);
        // Fall back to individual fetches for this chunk
        for (const req of chunk) {
          const price = await getPrice(req.token_id);
          results.set(req.token_id, price);
        }
      }
    }

    await recordSuccess();
  } catch (error: any) {
    console.error('[PolymarketPrice] Batch fetch failed:', error.message);
    await recordFailure();

    // Return unavailable for all uncached tokens
    for (const tokenId of uncachedTokens) {
      if (!results.has(tokenId)) {
        results.set(tokenId, createUnavailablePrice(tokenId));
      }
    }
  }

  return results;
}

/**
 * Get price history for charts
 */
export async function getPriceHistory(
  tokenId: string,
  interval: PriceInterval = '1d'
): Promise<PriceHistoryPoint[]> {
  // Check circuit breaker
  if (!(await checkCircuitBreaker())) {
    console.warn('[PolymarketPrice] Circuit breaker open, returning empty price history');
    return [];
  }

  try {
    const client = getClobClient();

    // Map our interval to Polymarket's API format
    // Polymarket uses 'all' instead of 'max', and doesn't support '1w'
    let apiInterval = interval;
    if (interval === 'max') {
      apiInterval = 'all' as PriceInterval;
    } else if (interval === '1w') {
      // Polymarket doesn't support 1w, use all instead
      apiInterval = 'all' as PriceInterval;
    }

    const response = await retryWithBackoff(
      () =>
        client.get('/prices-history', {
          params: {
            market: tokenId,
            interval: apiInterval,
          },
        }),
      { maxRetries: 2, initialDelayMs: 500 }
    );

    const history = response.data?.history;
    if (!Array.isArray(history)) {
      console.warn('[PolymarketPrice] Invalid price history response');
      return [];
    }

    await recordSuccess();

    return history.map((point: any) => ({
      timestamp: point.t || point.timestamp,
      price: parseFloat(point.p || point.price || '0.5'),
    }));
  } catch (error: any) {
    console.error(`[PolymarketPrice] Error fetching price history for ${tokenId}:`, error.message);
    await recordFailure();
    return [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createUnavailablePrice(tokenId: string): LivePrice {
  return {
    tokenId,
    midpoint: 0.5, // Default to 50%
    bestBid: 0,
    bestAsk: 1,
    spread: 1,
    lastUpdated: new Date(),
    isAvailable: false,
  };
}

/**
 * Check if Polymarket price service is available
 */
export async function isPriceServiceAvailable(): Promise<boolean> {
  const state = await getCircuitBreakerState();
  return !state.isOpen;
}

/**
 * Get circuit breaker status for monitoring
 */
export async function getCircuitBreakerStatus(): Promise<{
  isOpen: boolean;
  failures: number;
  lastFailure: Date | null;
}> {
  const state = await getCircuitBreakerState();
  return {
    isOpen: state.isOpen,
    failures: state.failures,
    lastFailure: state.lastFailure ? new Date(state.lastFailure) : null,
  };
}

/**
 * Clear all price cache (useful for testing)
 */
export async function clearPriceCache(): Promise<void> {
  try {
    if (!redis.isOpen) {
      return;
    }

    // Find all price keys and delete them
    const keys = await redis.keys('price:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('[PolymarketPrice] Error clearing cache:', error);
  }
}

/**
 * Calculate shares for a given amount and price
 * shares = amount / price
 */
export function calculateShares(amount: number, price: number): number {
  if (price <= 0 || price >= 1) {
    throw new Error(`Invalid price: ${price}. Must be between 0 and 1.`);
  }
  return amount / price;
}

/**
 * Calculate potential payout for shares
 * On win, each share pays 1 credit
 */
export function calculatePotentialPayout(shares: number): number {
  return shares;
}
