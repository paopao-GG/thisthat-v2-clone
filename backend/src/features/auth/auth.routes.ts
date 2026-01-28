import type { FastifyInstance } from 'fastify';
// import rateLimit from '@fastify/rate-limit';
import { getMeHandler, logoutHandler, refreshHandler, xAuthHandler, xCallbackHandler, getPnLHistoryHandler } from './auth.controllers.js';
import { authenticate } from './auth.middleware.js';
import { authRateLimit, standardRateLimit } from '../../lib/rate-limit.config.js';
import rateLimitRedis from '../../lib/redis-rate-limit.js';

export default async function authRoutes(fastify: FastifyInstance) {
  // OAuth routes (X login only) 
  // We intentionally DO NOT attach the generic rate-limit plugin here,
  // because its JSON error responses would be shown directly in the browser
  // when initiating the OAuth flow (e.g. "/api/v1/auth/x").
  // Instead, OAuth-specific errors are handled in the controllers and
  // redirected back to the frontend with friendly messaging.
  await fastify.register(async (fastify) => {
    fastify.get('/x', xAuthHandler);
    fastify.get('/x/callback', xCallbackHandler);
  });

  await fastify.register(async (fastify) => {
    fastify.post('/refresh', refreshHandler);
    fastify.post('/logout', logoutHandler);
  });

  await fastify.register(async (fastify) => {
    fastify.get('/me', { preHandler: authenticate }, getMeHandler);
    fastify.get('/pnl-history', { preHandler: authenticate }, getPnLHistoryHandler);
  });
}
