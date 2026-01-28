import type { FastifyRequest, FastifyReply } from 'fastify';
import { createPurchaseSchema } from './purchases.models.js';
import { CREDIT_PACKAGES, createCreditPurchase, getUserPurchases } from './purchases.services.js';

export async function listPackagesHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    success: true,
    packages: Object.values(CREDIT_PACKAGES),
  });
}

export async function createPurchaseHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const input = createPurchaseSchema.parse(request.body);
    const result = await createCreditPurchase(userId, input.packageId);

    return reply.status(201).send({
      success: true,
      purchase: result.purchase,
      newBalance: result.newBalance,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error.message === 'Invalid credit package') {
      return reply.status(400).send({
        success: false,
        error: error.message,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Create purchase error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to create purchase',
    });
  }
}

export async function listPurchasesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const purchases = await getUserPurchases(userId);

    return reply.send({
      success: true,
      purchases,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'List purchases error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to load purchases',
    });
  }
}

