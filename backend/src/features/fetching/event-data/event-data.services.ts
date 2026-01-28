// Event data service - Normalize Polymarket event data
// NOTE: MongoDB has been removed. Only normalizeEvent function is kept.
// Event ingestion is not currently used - markets are ingested directly via market-ingestion.service.ts
import { type PolymarketEvent } from '../../../lib/polymarket-client.js';
import type { FlattenedEvent } from './event-data.models.js';

/**
 * Normalize Polymarket event data to our flat structure
 */
export function normalizeEvent(polymarketData: PolymarketEvent): FlattenedEvent {
  // Determine status - Gamma API uses active/closed/archived fields
  let status: 'active' | 'closed' | 'archived' = 'active';
  if (polymarketData.archived) {
    status = 'archived';
  } else if (polymarketData.closed) {
    status = 'closed';
  } else if (polymarketData.active === false) {
    status = 'closed';
  }

  // Extract market IDs if markets are included (filter out undefined values)
  const marketIds = (polymarketData.markets?.map(m => m.condition_id || m.question_id) || []).filter((id): id is string => !!id);

  return {
    eventId: polymarketData.id,
    slug: polymarketData.slug,

    title: polymarketData.title,
    description: polymarketData.description || polymarketData.subtitle,

    // Gamma API uses 'image' and 'icon', fallback to legacy fields
    imageUrl: polymarketData.image || polymarketData.image_url,
    iconUrl: polymarketData.icon || polymarketData.icon_url,

    category: polymarketData.category,
    status,
    featured: polymarketData.featured,

    // Gamma API uses 'startDate' and 'endDate', fallback to legacy fields
    startDate: polymarketData.startDate || polymarketData.start_date_iso,
    endDate: polymarketData.endDate || polymarketData.end_date_iso,

    marketCount: polymarketData.markets?.length || 0,
    marketIds,

    source: 'polymarket',
    rawData: polymarketData, // Keep original for debugging

    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * DEPRECATED: MongoDB functions removed.
 * Event ingestion is not currently used - markets are ingested directly via market-ingestion.service.ts
 */

/**
 * DEPRECATED: MongoDB removed
 */
export async function fetchAndSaveEvents(options?: {
  active?: boolean;
  limit?: number;
}): Promise<{ saved: number; errors: number }> {
  console.warn('[DEPRECATED] fetchAndSaveEvents is deprecated. MongoDB has been removed.');
  return { saved: 0, errors: 0 };
}

/**
 * DEPRECATED: MongoDB removed
 */
export async function getAllEvents(filter?: {
  status?: 'active' | 'closed' | 'archived';
  category?: string;
  featured?: boolean;
  limit?: number;
  skip?: number;
}): Promise<FlattenedEvent[]> {
  console.warn('[DEPRECATED] getAllEvents is deprecated. MongoDB has been removed.');
  return [];
}

/**
 * DEPRECATED: MongoDB removed
 */
export async function getEventStats(): Promise<any> {
  console.warn('[DEPRECATED] getEventStats is deprecated. MongoDB has been removed.');
  return {
    totalEvents: 0,
    activeEvents: 0,
    closedEvents: 0,
    archivedEvents: 0,
    featuredEvents: 0,
    categoryCounts: {},
    lastUpdated: new Date(),
  };
}
