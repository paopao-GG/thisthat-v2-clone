import type { FastifyInstance } from 'fastify';
import {
  claimDailyCreditsHandler,
  buyStockHandler,
  sellStockHandler,
  getPortfolioHandler,
  getStocksHandler,
} from './economy.controllers.js';
import { authenticate } from '../auth/auth.middleware.js';

export default async function economyRoutes(fastify: FastifyInstance) {
  // Protected routes (require authentication)
  fastify.post('/daily-credits', { preHandler: authenticate }, claimDailyCreditsHandler);
  fastify.post('/buy', { preHandler: authenticate }, buyStockHandler);
  fastify.post('/sell', { preHandler: authenticate }, sellStockHandler);
  fastify.get('/portfolio', { preHandler: authenticate }, getPortfolioHandler);
  
  // Public route
  fastify.get('/stocks', getStocksHandler);
}

