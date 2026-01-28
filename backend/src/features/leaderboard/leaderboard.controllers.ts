import type { FastifyReply, FastifyRequest } from 'fastify';
import * as leaderboardService from './leaderboard.services.js';

interface LeaderboardQuery {
  limit?: string;
  offset?: string;
  category?: string;
  timeFilter?: 'today' | 'weekly' | 'monthly' | 'all';
}

/**
 * Get PnL leaderboard (supports time filtering, category filtering, and live Redis-backed leaderboard)
 */
export async function getPnLLeaderboardHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = request.query as LeaderboardQuery;
    const limit = Math.min(Number(query.limit) || 100, 1000);
    const offset = Number(query.offset) || 0;
    const category = query.category && query.category !== 'All' ? query.category : undefined;
    const timeFilter = query.timeFilter || 'all';

    // Priority: Use time-based leaderboard (which supports both time and category filtering)
    let result;
    if (timeFilter !== 'all' || category) {
      // Time-based filtering (with optional category)
      result = await leaderboardService.getTimeBasedLeaderboard('pnl', timeFilter, limit, offset, category);
    } else {
      // All-time leaderboard (no filters)
      result = await leaderboardService.getLiveLeaderboard('pnl', limit, offset);
    }

    return reply.send({
      success: true,
      data: result.leaderboard,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch PnL leaderboard';
    const errorStack = error instanceof Error ? error.stack : undefined;
    request.log.error({ error: errorMessage, stack: errorStack }, 'Error fetching PnL leaderboard');
    return reply.status(500).send({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Get Volume leaderboard (supports time filtering, category filtering, and live Redis-backed leaderboard)
 */
export async function getVolumeLeaderboardHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = request.query as LeaderboardQuery;
    const limit = Math.min(Number(query.limit) || 100, 1000);
    const offset = Number(query.offset) || 0;
    const category = query.category && query.category !== 'All' ? query.category : undefined;
    const timeFilter = query.timeFilter || 'all';

    console.log(`[Volume Leaderboard] Request - category: "${query.category}", timeFilter: "${timeFilter}", parsed category: "${category}"`);

    // Priority: Use time-based leaderboard (which supports both time and category filtering)
    let result;
    if (timeFilter !== 'all' || category) {
      // Time-based filtering (with optional category)
      result = await leaderboardService.getTimeBasedLeaderboard('volume', timeFilter, limit, offset, category);
    } else {
      // All-time leaderboard (no filters)
      result = await leaderboardService.getLiveLeaderboard('volume', limit, offset);
    }

    return reply.send({
      success: true,
      data: result.leaderboard,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Volume leaderboard';
    const errorStack = error instanceof Error ? error.stack : undefined;
    request.log.error({ error: errorMessage, stack: errorStack }, 'Error fetching Volume leaderboard');
    return reply.status(500).send({
      success: false,
      error: errorMessage,
    });
  }
}

interface UserRankingQuery {
  type?: string;
}

interface AuthenticatedUser {
  userId: string;
}

/**
 * Get current user's ranking
 */
export async function getUserRankingHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as AuthenticatedUser | undefined;
    const userId = user?.userId;
    
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const query = request.query as UserRankingQuery;
    const type = (query.type || 'pnl') as 'pnl' | 'volume';
    
    if (type !== 'pnl' && type !== 'volume') {
      return reply.status(400).send({
        success: false,
        error: 'Invalid type. Must be "pnl" or "volume"',
      });
    }

    const ranking = await leaderboardService.getUserRanking(userId, type);

    if (!ranking) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
      });
    }

    return reply.send({
      success: true,
      ranking,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch user ranking';
    const errorStack = error instanceof Error ? error.stack : undefined;
    request.log.error({ error: errorMessage, stack: errorStack }, 'Error fetching user ranking');
    return reply.status(500).send({
      success: false,
      error: errorMessage,
    });
  }
}

