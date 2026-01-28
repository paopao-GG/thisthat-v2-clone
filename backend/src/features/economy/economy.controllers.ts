import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersPrisma as prisma } from '../../lib/database.js';
import { buyStockSchema, sellStockSchema } from './economy.models.js';
import * as economyService from './economy.services.js';
import { sendErrorResponse, sendValidationError, sendUnauthorizedError } from '../../lib/error-response.js';
import { createStructuredError } from '../../lib/error-handler.js';

/**
 * Claim daily credit allocation
 */
export async function claimDailyCreditsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return sendUnauthorizedError(reply);
    }

    const result = await economyService.processDailyCreditAllocation(userId);

    return reply.send({
      success: true,
      creditsAwarded: result.creditsAwarded,
      consecutiveDays: result.consecutiveDays,
      nextAvailableAt: result.nextAvailableAt,
    });
  } catch (error: any) {
    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Daily credit claim error');
    return sendErrorResponse(reply, error, 'Failed to claim daily credits');
  }
}

/**
 * Buy stocks
 */
export async function buyStockHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return sendUnauthorizedError(reply);
    }

    const input = buyStockSchema.parse(request.body);
    const result = await economyService.buyStock(userId, input);

    return reply.send({
      success: true,
      transaction: result.transaction,
      holding: result.holding,
      newBalance: result.newBalance,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return sendValidationError(reply, error.errors, 'Invalid stock purchase data');
    }

    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Buy stock error');
    return sendErrorResponse(reply, error, 'Failed to buy stock');
  }
}

/**
 * Sell stocks
 */
export async function sellStockHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return sendUnauthorizedError(reply);
    }

    const input = sellStockSchema.parse(request.body);
    const result = await economyService.sellStock(userId, input);

    return reply.send({
      success: true,
      transaction: result.transaction,
      holding: result.holding,
      newBalance: result.newBalance,
      profit: result.profit,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return sendValidationError(reply, error.errors, 'Invalid stock sale data');
    }

    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Sell stock error');
    return sendErrorResponse(reply, error, 'Failed to sell stock');
  }
}

/**
 * Get user portfolio
 */
export async function getPortfolioHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return sendUnauthorizedError(reply);
    }

    const portfolio = await economyService.getUserPortfolio(userId);

    return reply.send({
      success: true,
      portfolio,
    });
  } catch (error: any) {
    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Get portfolio error');
    return sendErrorResponse(reply, error, 'Failed to get portfolio');
  }
}

/**
 * Get all stocks
 */
export async function getStocksHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stocks = await prisma.stock.findMany({
      where: {
        status: 'active',
      },
      orderBy: {
        marketCap: 'desc',
      },
    });

    return reply.send({
      success: true,
      stocks,
    });
  } catch (error: any) {
    request.log.error({ 
      error: createStructuredError(error), 
      stack: error.stack 
    }, 'Get stocks error');
    return sendErrorResponse(reply, error, 'Failed to get stocks');
  }
}

