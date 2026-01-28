/**
 * Markets Routes
 */

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
// import rateLimit from '@fastify/rate-limit';
import {
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketLiveHandler,
  getMarketFullHandler,
  getRandomMarketsHandler,
  getMarketsByCategoryHandler,
  getCategoriesHandler,
  getMarketCountHandler,
  ingestMarketsHandler,
  backfillTokenIdsHandler,
  getMarketPriceHistoryHandler,
  getPolymarketStatusHandler,
  skipMarketHandler,
} from './markets.controllers.js';
import { externalApiRateLimit } from '../../lib/rate-limit.config.js';
import { authenticate, requireAdmin } from '../auth/auth.middleware.js';

export default async function marketsRoutes(fastify: FastifyInstance) {
  // IMPORTANT: More specific routes must come before less specific ones
  // Get markets with live prices
  fastify.get('/', getMarketsHandler);

  // Get random markets (static data only)
  fastify.get('/random', getRandomMarketsHandler);

  // Admin-only routes - require authentication AND admin role
  await fastify.register(async (fastify) => {
    fastify.post(
      '/ingest',
      { preHandler: [authenticate, requireAdmin] },
      ingestMarketsHandler as RouteHandlerMethod
    );
    fastify.post(
      '/backfill-tokens',
      { preHandler: [authenticate, requireAdmin] },
      backfillTokenIdsHandler as RouteHandlerMethod
    );
  });

  // Get all categories (must come before /:id to avoid matching)
  fastify.get('/categories', getCategoriesHandler);

  // Get market count (must come before /:id to avoid matching)
  fastify.get('/count', getMarketCountHandler);

  // P1: Get Polymarket service status
  fastify.get('/polymarket/status', getPolymarketStatusHandler);

  // Get markets by category (must come before /:id)
  fastify.get('/category/:category', getMarketsByCategoryHandler);

  // Get live prices for a market (more specific than /:id)
  fastify.get('/:id/live', getMarketLiveHandler);

  // P1: Get price history for charts
  fastify.get('/:id/price-history', getMarketPriceHistoryHandler);

  // Get market with static + live data combined (more specific than /:id)
  fastify.get('/:id/full', getMarketFullHandler);

  // Skip a market (user swiped up) - requires auth
  fastify.post('/:id/skip', { preHandler: authenticate }, skipMarketHandler);

  // Get single market by ID (static data only) - least specific, comes last
  fastify.get('/:id', getMarketByIdHandler);
}

