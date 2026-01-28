/**
 * Market Service
 * Handles all market-related API calls
 * Backend fetches data from PostgreSQL and live prices from Polymarket CLOB API
 */

import { get, post } from './api';
import type { Market } from '@shared/types';

// ============================================================================
// P1: Price History Types
// ============================================================================

export type PriceInterval = '1h' | '6h' | '1d' | '1w' | 'max';

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

export interface PriceHistoryResponse {
  marketId: string;
  side: 'this' | 'that';
  interval: PriceInterval;
  history: PriceHistoryPoint[];
}

export interface PolymarketStatus {
  isAvailable: boolean;
  circuitBreaker: {
    isOpen: boolean;
    failures: number;
    lastFailure: Date | null;
  };
}

export interface LiveOddsResponse {
  thisOdds: number;
  thatOdds: number;
  liquidity: number;
  spread?: number;
  isLive?: boolean;
  lastUpdated?: string;
}

/**
 * Market response from backend
 */
interface BackendMarket {
  id: string;
  polymarketId: string;
  title: string;
  thisOption: string;
  thatOption: string;
  thisOdds: number;
  thatOdds: number;
  status: 'open' | 'closed' | 'resolved';
  category: string;
  expiresAt: string;
  description?: string;
  liquidity?: number;
  imageUrl?: string;
  thisImageUrl?: string;
  thatImageUrl?: string;
  isEndingSoon?: boolean; // P5: Flag for markets ending within 24 hours
}

/**
 * Markets list response
 */
interface MarketsResponse {
  success: boolean;
  count: number;
  data: BackendMarket[];
}

/**
 * Safely parse expiration date from backend
 * Handles edge cases and validates against Unix epoch (1970) bug
 */
function parseExpirationDate(expiresAt: string | null | undefined): Date {
  if (!expiresAt) {
    // Fallback: 1 year from now
    console.warn('[Market Service] Null expiration date received, using fallback');
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

  const date = new Date(expiresAt);

  // Validate: Reject dates before 2020 (likely Unix epoch bug)
  const MIN_VALID_DATE = new Date('2020-01-01').getTime();
  if (date.getTime() < MIN_VALID_DATE) {
    console.error('[Market Service] Suspicious expiration date detected (< 2020):', {
      received: expiresAt,
      parsed: date.toISOString(),
    });
    // Fallback: 1 year from now
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

  return date;
}

/**
 * Transform backend market to frontend format
 */
function transformMarket(backendMarket: BackendMarket): Market {
  return {
    id: backendMarket.id,
    title: backendMarket.title,
    description: backendMarket.description || '',
    thisOption: backendMarket.thisOption,
    thatOption: backendMarket.thatOption,
    thisOdds: backendMarket.thisOdds,
    thatOdds: backendMarket.thatOdds,
    expiryDate: parseExpirationDate(backendMarket.expiresAt),
    category: backendMarket.category,
    liquidity: backendMarket.liquidity || 0,
    imageUrl: backendMarket.imageUrl,
    thisImageUrl: backendMarket.thisImageUrl,
    thatImageUrl: backendMarket.thatImageUrl,
    marketType: backendMarket.thisImageUrl && backendMarket.thatImageUrl ? 'two-image' : 'binary',
    isEndingSoon: backendMarket.isEndingSoon, // P5: Map ending soon flag
  };
}

/**
 * Fetch markets with filters
 * Backend queries PostgreSQL database
 */
export async function fetchMarkets(params?: {
  category?: string;
  status?: 'open' | 'closed' | 'resolved';
  filter?: 'ending_soon' | 'popular'; // NEW
  limit?: number;
  skip?: number;
}): Promise<Market[]> {
  const queryParams = new URLSearchParams();

  if (params?.category) queryParams.append('category', params.category);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.filter) queryParams.append('filter', params.filter); // NEW
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.skip) queryParams.append('skip', params.skip.toString());

  const endpoint = `/api/v1/markets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await get<MarketsResponse>(endpoint);
  
  // Handle both wrapped and direct responses
  const data = Array.isArray(response) ? response : (response.data || []);
  return data.map(transformMarket);
}

/**
 * Fetch random/curated markets for discovery
 * Backend queries PostgreSQL database
 */
export async function fetchRandomMarkets(): Promise<Market[]> {
  const response = await get<MarketsResponse>('/api/v1/markets/random');
  const data = Array.isArray(response) ? response : (response.data || []);
  return data.map(transformMarket);
}

/**
 * Fetch a single market by ID
 * Backend queries PostgreSQL database
 */
export async function fetchMarketById(id: string): Promise<Market> {
  const backendMarket = await get<BackendMarket>(`/api/v1/markets/${id}`);
  return transformMarket(backendMarket);
}

/**
 * Fetch a market with live odds from Polymarket
 * Backend fetches from PostgreSQL + calls Polymarket API for live odds
 */
export async function fetchMarketWithLiveOdds(id: string): Promise<Market> {
  const backendMarket = await get<BackendMarket>(`/api/v1/markets/${id}/full`);
  return transformMarket(backendMarket);
}

/**
 * Fetch only live odds for a market - P1 Polymarket Integration
 * Backend fetches live prices from Polymarket CLOB API
 * Returns isServiceDown: true if Polymarket is unavailable
 */
export async function fetchLiveOdds(id: string): Promise<LiveOddsResponse & { isServiceDown?: boolean }> {
  try {
    const response = await get<LiveOddsResponse>(`/api/v1/markets/${id}/live`);
    return response;
  } catch (error: any) {
    // Check if this is a 503 Service Unavailable (Polymarket down)
    if (error?.status === 503 || error?.isServiceDown) {
      return {
        thisOdds: 0.5,
        thatOdds: 0.5,
        liquidity: 0,
        isLive: false,
        isServiceDown: true,
      };
    }
    throw error;
  }
}

/**
 * Fetch available categories
 * Backend queries PostgreSQL database
 */
export async function fetchCategories(): Promise<string[]> {
  // Note: get() already unwraps { success: true, data: [...] } and returns data directly
  return get<string[]>('/api/v1/markets/categories');
}

/**
 * Fetch markets by category
 * Backend queries PostgreSQL database
 */
export async function fetchMarketsByCategory(category: string, limit = 50): Promise<Market[]> {
  const response = await get<MarketsResponse>(`/api/v1/markets/category/${category}?limit=${limit}`);
  const data = Array.isArray(response) ? response : (response.data || []);
  return data.map(transformMarket);
}

/**
 * Trigger manual market ingestion (admin/dev feature)
 * Backend fetches from Polymarket API and stores in PostgreSQL
 */
export async function triggerMarketIngestion(): Promise<void> {
  await post('/api/v1/markets/ingest', {}, true);
}

// ============================================================================
// P1: Price History & Polymarket Status
// ============================================================================

/**
 * Fetch price history for a market from Polymarket
 * Used for displaying price charts
 */
export async function fetchPriceHistory(
  marketId: string,
  interval: PriceInterval = '1d',
  side: 'this' | 'that' = 'this'
): Promise<PriceHistoryResponse | null> {
  try {
    const response = await get<PriceHistoryResponse>(
      `/api/v1/markets/${marketId}/price-history?interval=${interval}&side=${side}`
    );
    return response;
  } catch (error: any) {
    // Return null if service is unavailable
    if (error?.status === 503 || error?.isServiceDown) {
      console.warn('[marketService] Polymarket unavailable for price history');
      return null;
    }
    console.error('[marketService] Failed to fetch price history:', error);
    return null;
  }
}

/**
 * Check Polymarket service status
 * Use this to show a warning banner when Polymarket is down
 */
export async function checkPolymarketStatus(): Promise<PolymarketStatus> {
  try {
    const response = await get<PolymarketStatus>('/api/v1/markets/polymarket/status');
    return response;
  } catch (error) {
    // If we can't check status, assume it's down
    return {
      isAvailable: false,
      circuitBreaker: {
        isOpen: true,
        failures: 0,
        lastFailure: null,
      },
    };
  }
}

/**
 * Poll live odds with automatic retry on failure
 * Returns null if service is down (allows UI to show appropriate message)
 */
export async function pollLiveOdds(
  marketId: string,
  onUpdate: (odds: LiveOddsResponse) => void,
  onServiceDown?: () => void,
  intervalMs: number = 10000
): Promise<() => void> {
  let isRunning = true;

  const poll = async () => {
    while (isRunning) {
      try {
        const odds = await fetchLiveOdds(marketId);

        if (odds.isServiceDown) {
          onServiceDown?.();
        } else {
          onUpdate(odds);
        }
      } catch (error) {
        console.error('[marketService] Failed to poll live odds:', error);
      }

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  // Start polling
  poll();

  // Return cleanup function
  return () => {
    isRunning = false;
  };
}

/**
 * Skip a market (user swiped up)
 * Records the skip in backend so market won't appear again for 3 days
 * Requires authentication
 */
export async function skipMarket(marketId: string): Promise<void> {
  await post(`/api/v1/markets/${marketId}/skip`, {}, true);
}



