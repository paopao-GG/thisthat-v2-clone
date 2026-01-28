import type { FastifyRequest, FastifyReply } from 'fastify';
import * as syncService from './mongodb-to-postgres.sync.js';

/**
 * Sync all markets from MongoDB to PostgreSQL
 */
export async function syncMarketsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = request.query as { status?: string; limit?: string };
    
    const result = await syncService.syncAllMarketsToPostgres({
      status: query.status as 'active' | 'closed' | 'archived' | undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return reply.send({
      success: true,
      ...result,
      message: `Synced ${result.synced} markets, ${result.errors} errors, ${result.skipped} skipped`,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'Sync markets error');
    return reply.status(500).send({
      success: false,
      error: error.message || 'Failed to sync markets',
    });
  }
}

/**
 * Get market counts from both databases
 */
export async function getMarketCountsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const counts = await syncService.getMarketCounts();

    return reply.send({
      success: true,
      counts,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'Get market counts error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get market counts',
    });
  }
}

