// Market data routes
import type { FastifyInstance } from 'fastify';
import * as controller from './market-data.controllers.js';

/**
 * LEGACY MongoDB-based market routes
 * 
 * DEPRECATED: These routes are kept for backward compatibility but should not be used.
 * The new PostgreSQL-based system follows the lazy loading pattern (docs/MARKET_FETCHING.md):
 * - Static data stored in PostgreSQL
 * - Prices fetched on-demand from Polymarket API
 * 
 * Migration: Use PostgreSQL endpoints instead:
 * - GET /api/v1/markets/random - Get random markets (static data)
 * - GET /api/v1/markets/:id/live - Get live prices on-demand
 */
export default async function marketDataRoutes(fastify: FastifyInstance) {
  // Fetch markets from Polymarket and save to MongoDB (LEGACY)
  // Changed to GET to match Polymarket API (POST was causing 415 error)
  fastify.get('/fetch', controller.fetchMarkets);
  // Keep POST for backward compatibility
  fastify.post('/fetch', controller.fetchMarkets);

  // Get markets from MongoDB (LEGACY)
  fastify.get('/', controller.getMarkets);

  // Get market statistics (LEGACY)
  fastify.get('/stats', controller.getMarketStats);
}
