import type { FastifyInstance } from 'fastify';
import { getUserTransactionsHandler } from './transactions.controllers.js';
import { authenticate } from '../auth/auth.middleware.js';

export default async function transactionRoutes(fastify: FastifyInstance) {
  // Protected route
  fastify.get('/me', { preHandler: authenticate }, getUserTransactionsHandler);
}




