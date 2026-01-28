import type { FastifyInstance } from 'fastify';
import {
  placeBetHandler,
  getUserBetsHandler,
  getBetByIdHandler,
  sellPositionHandler,
  getTradeQuoteHandler,
} from './betting.controllers.js';
import { authenticate } from '../auth/auth.middleware.js';

export default async function bettingRoutes(fastify: FastifyInstance) {
  // Public routes (no authentication required)
  fastify.get('/quote', getTradeQuoteHandler);

  // Protected routes (require authentication)
  fastify.post('/', { preHandler: authenticate }, placeBetHandler);
  fastify.get('/me', { preHandler: authenticate }, getUserBetsHandler);
  fastify.post('/:betId/sell', { preHandler: authenticate }, sellPositionHandler);
  fastify.get('/:betId', { preHandler: authenticate }, getBetByIdHandler);
}

