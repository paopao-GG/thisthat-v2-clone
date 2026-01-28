// Event-Market Group Service - Normalize events with markets
// NOTE: MongoDB has been removed. Only normalize functions are kept.
// Event-market groups are not currently used - markets are ingested directly via market-ingestion.service.ts
import { type PolymarketEvent } from '../../../lib/polymarket-client.js';
import { normalizeMarket } from '../market-data/market-data.services.js';
import type { FlattenedMarket } from '../market-data/market-data.models.js';

export interface EventMarketGroup {
  eventId: string;
  eventTitle: string;
  eventDescription?: string;
  eventSlug: string;
  eventImage?: string;
  eventIcon?: string;
  category?: string;
  status: 'active' | 'closed' | 'archived';
  markets: FlattenedMarket[];
  totalLiquidity: number;
  totalVolume: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DEPRECATED: MongoDB functions removed.
 * Event-market groups are not currently used - markets are ingested directly via market-ingestion.service.ts
 */

/**
 * DEPRECATED: MongoDB removed
 */
export async function fetchAndSaveEventMarketGroups(options?: {
  active?: boolean;
  limit?: number;
}): Promise<{ saved: number; errors: number }> {
  console.warn('[DEPRECATED] fetchAndSaveEventMarketGroups is deprecated. MongoDB has been removed.');
  return { saved: 0, errors: 0 };
}

/**
 * DEPRECATED: MongoDB removed
 */
export async function getAllEventMarketGroups(filter?: {
  status?: 'active' | 'closed' | 'archived';
  category?: string;
  limit?: number;
  skip?: number;
}): Promise<EventMarketGroup[]> {
  console.warn('[DEPRECATED] getAllEventMarketGroups is deprecated. MongoDB has been removed.');
  return [];
}

/**
 * DEPRECATED: MongoDB removed
 */
export async function getEventMarketGroup(eventId: string): Promise<EventMarketGroup | null> {
  console.warn('[DEPRECATED] getEventMarketGroup is deprecated. MongoDB has been removed.');
  return null;
}

/**
 * DEPRECATED: MongoDB removed
 */
export async function getEventMarketGroupStats() {
  console.warn('[DEPRECATED] getEventMarketGroupStats is deprecated. MongoDB has been removed.');
  return {
    totalEvents: 0,
    activeEvents: 0,
    closedEvents: 0,
    archivedEvents: 0,
    categoryCounts: {},
    lastUpdated: new Date(),
  };
}
