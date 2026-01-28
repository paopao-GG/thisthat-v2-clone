import type { FastifyInstance } from 'fastify';
import {
  syncMarketsHandler,
  getMarketCountsHandler,
} from './sync.controllers.js';

export default async function syncRoutes(fastify: FastifyInstance) {
  // Public routes (can add admin auth later)
  fastify.post('/markets', syncMarketsHandler);
  fastify.get('/markets/counts', getMarketCountsHandler);
}

