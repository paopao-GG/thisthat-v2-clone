import type { FastifyRequest, FastifyReply } from 'fastify';
import { placeBetSchema, betQuerySchema, sellPositionSchema } from './betting.models.js';
import * as bettingService from './betting.services.js';
import { createStructuredError, ErrorType } from '../../lib/error-handler.js';
import { sendErrorResponse, sendValidationError, sendNotFoundError, sendUnauthorizedError } from '../../lib/error-response.js';
import { z } from 'zod';

// Trade quote schema
const tradeQuoteSchema = z.object({
  marketId: z.string().uuid(),
  amount: z.number().positive().min(10).max(10000),
  side: z.enum(['this', 'that']),
});

/**
 * Place a bet using AMM (share-based)
 */
export async function placeBetHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    request.log.info({ userId, user: request.user }, 'Place bet request received');
    if (!userId) {
      request.log.error('No userId in request.user');
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const input = placeBetSchema.parse(request.body);
    request.log.info({ userId, input }, 'Placing bet');

    // Use AMM service for share-based betting
    const result = await bettingService.placeBetAMM(userId, input);

    return reply.status(201).send({
      success: true,
      bet: result.bet,
      newBalance: result.newBalance,
      sharesReceived: result.sharesReceived,
      priceImpact: result.priceImpact,
      newProbability: result.newProbability,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        code: ErrorType.VALIDATION,
        details: error.errors,
      });
    }

    const structuredError = createStructuredError(error);
    request.log.error({ 
      error: structuredError, 
      stack: error.stack 
    }, 'Place bet error');

    const statusCode = structuredError.type === ErrorType.INSUFFICIENT_BALANCE 
      ? 400 
      : structuredError.type === ErrorType.MARKET_CLOSED 
      ? 400 
      : structuredError.type === ErrorType.NOT_FOUND
      ? 404
      : structuredError.retryable 
      ? 503 
      : 400;

    return reply.status(statusCode).send({
      success: false,
      error: structuredError.message,
      code: structuredError.code,
      type: structuredError.type,
      retryable: structuredError.retryable,
      retryAfter: structuredError.retryAfter,
    });
  }
}

/**
 * Get user's bets
 */
export async function getUserBetsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const query = betQuerySchema.parse(request.query);
    const result = await bettingService.getUserBets(userId, query);

    return reply.send({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Get user bets error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get bets',
    });
  }
}

/**
 * Get bet by ID
 */
export async function getBetByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return sendUnauthorizedError(reply);
    }

    const betId = (request.params as any).betId;
    if (!betId) {
      return sendValidationError(reply, [{ path: ['betId'], message: 'Bet ID is required' }], 'Bet ID is required');
    }

    const bet = await bettingService.getBetById(betId, userId);

    if (!bet) {
      return sendNotFoundError(reply, 'Bet');
    }

    return reply.send({
      success: true,
      bet,
    });
  } catch (error: any) {
    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Get bet error');
    return sendErrorResponse(reply, error, 'Failed to get bet');
  }
}

/**
 * Sell a position early using AMM (before market expires)
 */
export async function sellPositionHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const betId = (request.params as any).betId;
    if (!betId) {
      return reply.status(400).send({
        success: false,
        error: 'Bet ID is required',
      });
    }

    // Use AMM service to sell shares
    const result = await bettingService.sellPositionAMM(userId, betId);

    return reply.send({
      success: true,
      creditsReceived: result.creditsReceived,
      profit: result.profit,
      priceImpact: result.priceImpact,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        code: ErrorType.VALIDATION,
        details: error.errors,
      });
    }

    const structuredError = createStructuredError(error);
    request.log.error({ 
      error: structuredError, 
      stack: error.stack 
    }, 'Sell position error');

    const statusCode = structuredError.type === ErrorType.NOT_FOUND
      ? 404
      : structuredError.retryable
      ? 503
      : 400;

    return reply.status(statusCode).send({
      success: false,
      error: structuredError.message,
      code: structuredError.code,
      type: structuredError.type,
      retryable: structuredError.retryable,
      retryAfter: structuredError.retryAfter,
    });
  }
}

/**
 * Get trade quote (preview trade without executing)
 */
export async function getTradeQuoteHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = tradeQuoteSchema.parse(request.query);

    const quote = await bettingService.getTradeQuote(
      query.marketId,
      query.amount,
      query.side
    );

    return reply.send({
      success: true,
      ...quote,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        code: ErrorType.VALIDATION,
        details: error.errors,
      });
    }

    const structuredError = createStructuredError(error);
    request.log.error({
      error: structuredError,
      stack: error.stack
    }, 'Get trade quote error');

    return reply.status(400).send({
      success: false,
      error: structuredError.message,
      code: structuredError.code,
      type: structuredError.type,
    });
  }
}