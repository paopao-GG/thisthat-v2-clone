/**
 * MongoDB to PostgreSQL Market Sync Service
 * 
 * DEPRECATED: MongoDB has been removed. Markets are now ingested directly into PostgreSQL.
 * This service is kept for backward compatibility but does nothing.
 * 
 * Market ingestion now happens via market-ingestion.service.ts which writes directly to the markets database.
 */

import { marketsPrisma } from '../../lib/database.js';

/**
 * Sync all markets from MongoDB to PostgreSQL
 * DEPRECATED: No-op since MongoDB is removed
 */
export async function syncAllMarketsToPostgres(options?: {
  status?: 'active' | 'closed' | 'archived';
  limit?: number;
}): Promise<{
  synced: number;
  errors: number;
  skipped: number;
}> {
  console.warn('[Sync Service] MongoDB sync is deprecated. Markets are ingested directly into PostgreSQL.');
  return {
    synced: 0,
    errors: 0,
    skipped: 0,
  };
}

/**
 * Sync active markets only
 * DEPRECATED: No-op since MongoDB is removed
 */
export async function syncActiveMarketsToPostgres(): Promise<{
  synced: number;
  errors: number;
  skipped: number;
}> {
  return syncAllMarketsToPostgres({
    status: 'active',
    limit: 1000,
  });
}

/**
 * Get market count in PostgreSQL
 * MongoDB count is always 0 since MongoDB is removed
 */
export async function getMarketCounts(): Promise<{
  mongodb: number;
  postgresql: number;
  activeMongoDB: number;
  activePostgreSQL: number;
}> {
  const [postgresqlTotal, postgresqlActive] = await Promise.all([
    marketsPrisma.market.count({}),
    marketsPrisma.market.count({ where: { status: 'open' } }),
  ]);

  return {
    mongodb: 0,
    postgresql: postgresqlTotal,
    activeMongoDB: 0,
    activePostgreSQL: postgresqlActive,
  };
}
