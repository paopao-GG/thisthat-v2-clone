// Polymarket API Client (V1 - READ ONLY)
import axios, { AxiosInstance, AxiosError } from 'axios';
import { retryWithBackoff } from './retry.js';
import { circuitBreakers, ErrorType } from './error-handler.js';

export interface PolymarketMarket {
  conditionId: string; // Polymarket uses camelCase
  condition_id?: string; // Deprecated, kept for compatibility
  question: string;
  description?: string;
  outcomes: string[];
  endDateIso?: string; // Polymarket uses camelCase
  end_date_iso?: string; // Deprecated
  gameStartTime?: string; // Polymarket uses camelCase
  game_start_time?: string; // Deprecated
  questionID?: string; // Polymarket uses camelCase
  question_id?: string; // Deprecated
  marketSlug?: string; // Polymarket uses camelCase
  market_slug?: string; // Deprecated
  min_incentive_size?: number;
  max_incentive_size?: number;
  volume?: number;
  volume_24hr?: number;
  liquidity?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  accepting_orders?: boolean;
  new?: boolean;
  featured?: boolean;
  submitted_by?: string;
  umami_id?: string;
  category?: string;
  tags?: string[];
  // Image fields from CLOB API
  image?: string;
  icon?: string;
  // Outcome tokens with prices
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner?: boolean;
  }>;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  start_date_iso?: string; // Legacy field
  end_date_iso?: string; // Legacy field
  image?: string;
  icon?: string;
  image_url?: string; // Legacy field
  icon_url?: string; // Legacy field
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  featured?: boolean;
  category?: string;
  subcategory?: string;
  tags?: Array<{ id: string; label: string; slug: string }>;
  markets?: PolymarketMarket[];
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  openInterest?: number;
  ticker?: string;
  resolutionSource?: string;
  creationDate?: string;
  published_at?: string;
}

export class PolymarketClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    // Use Gamma API for markets/events (public endpoints)
    // CLOB API is for trading operations (requires authentication)
    this.baseUrl = baseUrl || process.env.POLYMARKET_BASE_URL || 'https://gamma-api.polymarket.com';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Gamma API doesn't require authentication for public endpoints
        // API key is stored for future authenticated endpoints
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Fetch all active markets from Polymarket Gamma API
   * Uses GET /markets endpoint with query parameters
   */
  async getMarkets(params?: {
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    limit?: number;
    offset?: number;
    tag_id?: string;
  }): Promise<PolymarketMarket[]> {
    // Use circuit breaker and retry for external API calls
    return await circuitBreakers.polymarket.execute(async () => {
      return await retryWithBackoff(
        async () => {
          // Build query parameters for Gamma API
          const queryParams: Record<string, string | number> = {};
          
          // Gamma API: closed=false means active markets, closed=true means closed markets
          // If not specified, defaults to active markets (closed=false)
          if (params?.closed !== undefined) {
            queryParams.closed = params.closed.toString();
          } else {
            // Default to active markets if not specified
            queryParams.closed = 'false';
          }
          if (params?.limit) {
            queryParams.limit = params.limit;
          }
          if (params?.offset !== undefined) {
            queryParams.offset = params.offset;
          }
          if (params?.tag_id) {
            queryParams.tag_id = params.tag_id;
          }

          const response = await this.client.get('/markets', { params: queryParams });
          
          // Gamma API returns array directly or wrapped in data property
          if (Array.isArray(response.data)) {
            return response.data;
          }
          // Some endpoints wrap in { data: [...] } or { markets: [...] }
          return response.data?.data || response.data?.markets || [];
        },
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          retryableErrors: (error: any) => {
            // Retry on rate limits (429), network errors, and 5xx errors
            if (!error.response) return true; // Network error
            const status = error.response.status;
            return status === 429 || status >= 500;
          },
        }
      );
    });
  }

  /**
   * Fetch a single market by condition ID
   */
  async getMarket(conditionId: string): Promise<PolymarketMarket | null> {
    try {
      return await circuitBreakers.polymarket.execute(async () => {
        return await retryWithBackoff(
          async () => {
            const response = await this.client.get(`/markets/${conditionId}`);
            return response.data || null;
          },
          {
            maxRetries: 2,
            initialDelayMs: 1000,
            retryableErrors: (error: any) => {
              if (!error.response) return true; // Network error
              const status = error.response.status;
              // Don't retry on 422 (invalid request) or 404 (not found)
              if (status === 422 || status === 404) {
                return false;
              }
              return status === 429 || status >= 500;
            },
          }
        );
      });
    } catch (error: any) {
      // Return null on failure (graceful degradation)
      // Only log non-422 errors to reduce noise (422 means invalid market ID)
      if (error?.response?.status !== 422) {
        console.error(`Error fetching market ${conditionId}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Fetch all events from Polymarket Gamma API
   * Uses GET /events endpoint with query parameters
   */
  async getEvents(params?: {
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    limit?: number;
    offset?: number;
    tag_id?: string;
    featured?: boolean;
    order?: string;
    ascending?: boolean;
  }): Promise<PolymarketEvent[]> {
    // Use circuit breaker and retry for external API calls
    return await circuitBreakers.polymarket.execute(async () => {
      return await retryWithBackoff(
        async () => {
          // Build query parameters for Gamma API
          const queryParams: Record<string, string | number | boolean> = {};
          
          if (params?.closed !== undefined) {
            queryParams.closed = params.closed.toString();
          }
          if (params?.limit) {
            queryParams.limit = params.limit;
          }
          if (params?.offset) {
            queryParams.offset = params.offset;
          }
          if (params?.tag_id) {
            queryParams.tag_id = params.tag_id;
          }
          if (params?.featured !== undefined) {
            queryParams.featured = params.featured.toString();
          }
          if (params?.order) {
            queryParams.order = params.order;
          }
          if (params?.ascending !== undefined) {
            queryParams.ascending = params.ascending.toString();
          }

          const response = await this.client.get('/events', { params: queryParams });
          
          // Gamma API returns array directly or wrapped
          if (Array.isArray(response.data)) {
            return response.data;
          }
          return response.data?.data || response.data?.events || [];
        },
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          retryableErrors: (error: any) => {
            if (!error.response) return true; // Network error
            const status = error.response.status;
            return status === 429 || status >= 500;
          },
        }
      );
    });
  }

  /**
   * Fetch a single event by ID
   */
  async getEvent(eventId: string): Promise<PolymarketEvent | null> {
    try {
      const response = await this.client.get(`/events/${eventId}`);
      return response.data || null;
    } catch (error) {
      console.error(`Error fetching event ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Fetch markets for a specific event
   */
  async getEventMarkets(eventId: string): Promise<PolymarketMarket[]> {
    try {
      const response = await this.client.get(`/events/${eventId}/markets`);
      return response.data || [];
    } catch (error) {
      console.error(`Error fetching markets for event ${eventId}:`, error);
      return [];
    }
  }
}

// Singleton instance
let polymarketClient: PolymarketClient | null = null;

export function getPolymarketClient(): PolymarketClient {
  if (!polymarketClient) {
    const apiKey = process.env.POLYMARKET_API_KEY;
    const baseUrl = process.env.POLYMARKET_BASE_URL;
    polymarketClient = new PolymarketClient(apiKey, baseUrl);
  }
  return polymarketClient;
}

// ============================================================================
// Re-export Price Service Functions (P1 - Polymarket Liquidity Integration)
// ============================================================================

// Import and re-export price service functions for convenience
export {
  getPrice,
  getPrices,
  getPriceHistory,
  isPriceServiceAvailable,
  getCircuitBreakerStatus,
  calculateShares,
  calculatePotentialPayout,
  type LivePrice,
  type PriceHistoryPoint,
  type PriceInterval,
} from '../services/polymarket-price.service.js';
