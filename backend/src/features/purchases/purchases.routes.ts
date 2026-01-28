import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  createPurchaseHandler,
  listPackagesHandler,
  listPurchasesHandler,
} from './purchases.controllers.js';

export default async function purchaseRoutes(fastify: FastifyInstance) {
  fastify.get('/packages', listPackagesHandler);
  fastify.post('/', { preHandler: authenticate }, createPurchaseHandler);
  fastify.get('/me', { preHandler: authenticate }, listPurchasesHandler);
}

