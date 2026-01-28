import type { FastifyRequest, FastifyReply } from 'fastify';
import * as transactionService from './transactions.services.js';

/**
 * Get user's credit transaction history
 */
export async function getUserTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const type = (request.query as any)?.type;
    const limit = Number((request.query as any)?.limit) || 50;
    const offset = Number((request.query as any)?.offset) || 0;

    const result = await transactionService.getUserTransactions(userId, {
      type,
      limit,
      offset,
    });

    return reply.send({
      success: true,
      ...result,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'Error fetching transactions');
    return reply.status(500).send({
      success: false,
      error: error.message || 'Failed to fetch transactions',
    });
  }
}




