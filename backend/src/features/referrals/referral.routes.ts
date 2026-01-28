import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { getReferralStatsHandler } from './referral.controllers.js';

export default async function referralRoutes(fastify: FastifyInstance) {
  fastify.get('/me', { preHandler: authenticate }, getReferralStatsHandler);
}

