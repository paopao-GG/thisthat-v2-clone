import type { FastifyReply, FastifyRequest } from 'fastify';
import { getReferralStats } from './referral.services.js';

interface AuthenticatedUser {
  userId: string;
}

export async function getReferralStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user as AuthenticatedUser | undefined;
    const userId = user?.userId;
    
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const stats = await getReferralStats(userId);

    return reply.send({
      success: true,
      ...stats,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch referral stats';
    const errorStack = error instanceof Error ? error.stack : undefined;
    request.log.error({ error: errorMessage, stack: errorStack }, 'Referral stats error');
    
    if (error instanceof Error && error.message === 'User not found') {
      return reply.status(404).send({
        success: false,
        error: error.message,
      });
    }

    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch referral stats',
    });
  }
}

