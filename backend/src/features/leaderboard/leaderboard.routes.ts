import type { FastifyInstance } from 'fastify';
import {
  getPnLLeaderboardHandler,
  getVolumeLeaderboardHandler,
  getUserRankingHandler,
} from './leaderboard.controllers.js';
import { authenticate } from '../auth/auth.middleware.js';

export default async function leaderboardRoutes(fastify: FastifyInstance) {
  // Public routes
  fastify.get('/pnl', getPnLLeaderboardHandler);
  fastify.get('/volume', getVolumeLeaderboardHandler);
  
  // Protected route (requires authentication)
  fastify.get('/me', { preHandler: authenticate }, getUserRankingHandler);
}

