// Market data models with Zod validation
import { z } from 'zod';

/**
 * LEGACY: MongoDB market data structure
 * 
 * NOTE: This system is deprecated in favor of PostgreSQL lazy loading pattern.
 * Price fields (thisOdds, thatOdds, liquidity, volume) are kept for backward
 * compatibility but should NOT be stored. Only static data should be saved.
 * 
 * See: docs/MARKET_FETCHING.md for the correct lazy loading architecture.
 */

// Zod schema for market validation (static fields only)
export const MarketDataSchema = z.object({
  conditionId: z.string(),
  question: z.string(),
  description: z.string().optional(),
  thisOption: z.string(),
  thatOption: z.string(),
  // Price fields are optional - should NOT be stored per lazy loading pattern
  thisOdds: z.number().min(0).max(1).optional(),
  thatOdds: z.number().min(0).max(1).optional(),
  volume: z.number().optional(),
  volume24hr: z.number().optional(),
  liquidity: z.number().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['active', 'closed', 'archived']),
  featured: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  author: z.string().optional(), // Market creator/author
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MarketData = z.infer<typeof MarketDataSchema>;

/**
 * Flattened market structure for MongoDB
 * 
 * IMPORTANT: Per lazy loading pattern (docs/MARKET_FETCHING.md):
 * - Static fields (id, title, description, author, category, expiresAt) ARE stored
 * - Price fields (thisOdds, thatOdds, liquidity, volume) should NOT be stored
 * - Prices are fetched on-demand from Polymarket API when needed
 */
export interface FlattenedMarket {
  // Core identifiers
  conditionId: string;
  questionId?: string;
  marketSlug?: string;

  // Market content (STATIC - stored)
  question: string;
  description?: string;
  author?: string; // Market creator

  // Binary options (THIS/THAT) - STATIC
  thisOption: string;
  thatOption: string;

  // Price fields - DEPRECATED: Should NOT be stored per lazy loading pattern
  // Kept for backward compatibility but should be undefined/null
  thisOdds?: number;
  thatOdds?: number;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;

  // Metadata (STATIC - stored)
  category?: string;
  tags?: string[];
  status: 'active' | 'closed' | 'archived';
  featured?: boolean;

  // Dates (STATIC - stored)
  startDate?: string;
  endDate?: string; // Market expiration/due date

  // Source tracking
  source: 'polymarket';
  rawData?: any; // Original Polymarket data for debugging (can be removed to save space)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Statistics for market data
export interface MarketStats {
  totalMarkets: number;
  activeMarkets: number;
  closedMarkets: number;
  archivedMarkets: number;
  featuredMarkets: number;
  categoryCounts: Record<string, number>;
  lastUpdated: Date;
}
