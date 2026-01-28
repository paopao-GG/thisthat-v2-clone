import { usersPrisma, marketsPrisma } from '../../lib/database.js';
import type { PlaceBetInput, BetQueryInput } from './betting.models.js';
import { getPolymarketClient } from '../../lib/polymarket-client.js';
import { normalizeMarket } from '../fetching/market-data/market-data.services.js';
import type { Prisma } from '@prisma/client';
import {
  createStructuredError,
  ErrorType,
  executeWithFailover,
  circuitBreakers,
} from '../../lib/error-handler.js';
import { retryWithBackoffSilent } from '../../lib/retry.js';

// Re-export AMM functions for use by controllers
export {
  placeBetAMM,
  sellPosition as sellPositionAMM,
  getTradeQuote,
} from './betting.services.amm.js';

const MIN_BET_AMOUNT = 10;
const MAX_BET_AMOUNT = 10000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getCurrentOddsForBet(
  bet: { side: string; oddsAtBet: any },
  market: { polymarketId?: string | null; thisOdds: any; thatOdds: any }
): Promise<number> {
  if (market.polymarketId) {
    const liveData = await executeWithFailover(
      async () => {
        const { fetchLivePriceData } = await import('../markets/markets.services.js');
        return await circuitBreakers.polymarket.execute(() =>
          fetchLivePriceData(market.polymarketId!)
        );
      },
      {
        circuitBreaker: circuitBreakers.polymarket,
        retryOptions: { maxRetries: 2, initialDelayMs: 1000 },
        serviceName: 'Polymarket Live Prices',
        fallback: async () => {
          console.warn(
            `[Sell Position] Using stored odds as fallback for market ${market.polymarketId}`
          );
          return {
            thisOdds: Number(market.thisOdds),
            thatOdds: Number(market.thatOdds),
          };
        },
      }
    );

    if (!liveData) {
      return bet.side === 'this' ? Number(market.thisOdds) : Number(market.thatOdds);
    }

    return bet.side === 'this' ? liveData.thisOdds : liveData.thatOdds;
  }

  return bet.side === 'this' ? Number(market.thisOdds) : Number(market.thatOdds);
}

/**
 * Attempt to load a market from markets database or create it on-the-fly from Polymarket.
 * Note: Markets are in a separate database, so we query directly (not within a transaction).
 */
async function findOrSyncMarket(
  marketIdentifier: string
) {
  console.log(`[findOrSyncMarket] Looking for market: ${marketIdentifier}`);
  
  // Try polymarketId first so conditionIds work out of the box
  let market = await marketsPrisma.market.findUnique({
    where: { polymarketId: marketIdentifier },
  });

  if (market) {
    console.log(`[findOrSyncMarket] Found market by polymarketId: ${market.id}`);
    return market;
  }

  // Fallback to UUID lookups when the frontend already knows the Postgres id
  if (UUID_REGEX.test(marketIdentifier)) {
    market = await marketsPrisma.market.findUnique({ where: { id: marketIdentifier } });
    if (market) {
      console.log(`[findOrSyncMarket] Found market by UUID: ${market.id}`);
      return market;
    }
  }

  console.log(`[findOrSyncMarket] Market not in PostgreSQL cache, fetching from Polymarket API...`);
  
  // As a last resort, fetch the market from Polymarket and insert it locally
  // Use circuit breaker and retry for external API calls
  const polymarket = await executeWithFailover(
    async () => {
      const polymarketClient = getPolymarketClient();
      
      // Try direct market fetch first
      let market = await circuitBreakers.polymarket.execute(
        () => polymarketClient.getMarket(marketIdentifier)
      );
      
      // If direct fetch fails, search through markets list
      if (!market) {
        console.log(`[findOrSyncMarket] Direct fetch failed, searching markets list...`);
        const markets = await retryWithBackoffSilent(
          () => polymarketClient.getMarkets({ limit: 1000 }),
          { maxRetries: 2 }
        );
        if (markets) {
          market = markets.find(
            (m) => m.conditionId === marketIdentifier || m.condition_id === marketIdentifier
          ) || null;
        }
      }
      
      return market;
    },
    {
      circuitBreaker: circuitBreakers.polymarket,
      retryOptions: { maxRetries: 2, initialDelayMs: 1000 },
      serviceName: 'Polymarket API',
    }
  );
  
  if (!polymarket) {
    console.error(`[findOrSyncMarket] Market not found in Polymarket API: ${marketIdentifier}`);
    return null;
  }

  try {
    console.log(`[findOrSyncMarket] Fetched market from Polymarket: ${polymarket.conditionId || polymarket.condition_id}`);
    
    const normalized = normalizeMarket(polymarket);
    if (!normalized.conditionId) {
      console.error(`[findOrSyncMarket] Normalized market missing conditionId`);
      return null;
    }

    // Check if market was created while we were fetching (race condition)
    const existingMarket = await marketsPrisma.market.findUnique({
      where: { polymarketId: normalized.conditionId },
    });
    
    if (existingMarket) {
      console.log(`[findOrSyncMarket] Market was created concurrently, using existing: ${existingMarket.id}`);
      return existingMarket;
    }

    const status = normalized.status === 'active' ? 'open' : 'closed';
    const expiresAt =
      normalized.endDate && !Number.isNaN(new Date(normalized.endDate).getTime())
        ? new Date(normalized.endDate)
        : null;

    console.log(`[findOrSyncMarket] Creating new market in DB: ${normalized.conditionId}`);
    
    const newMarket = await marketsPrisma.market.create({
      data: {
        polymarketId: normalized.conditionId,
        title: normalized.question,
        description: normalized.description || null,
        thisOption: normalized.thisOption,
        thatOption: normalized.thatOption,
        thisOdds: normalized.thisOdds || 0.5,
        thatOdds: normalized.thatOdds || 0.5,
        liquidity: normalized.liquidity ?? null,
        category: normalized.category || null,
        marketType: 'polymarket',
        status,
        expiresAt,
      },
    });

    console.log(`[findOrSyncMarket] Successfully created market: ${newMarket.id}`);
    return newMarket;
  } catch (error: any) {
    const structuredError = createStructuredError(error);
    console.error(`[findOrSyncMarket] Error fetching/creating market:`, {
      error: structuredError.message,
      type: structuredError.type,
      retryable: structuredError.retryable,
    });
    return null;
  }
}

/**
 * Place a bet on a market
 */
export async function placeBet(
  userId: string,
  input: PlaceBetInput
): Promise<{
  bet: any;
  newBalance: number;
  potentialPayout: number;
}> {
  // First, find or sync the market (markets are in a separate database)
  const market = await findOrSyncMarket(input.marketId);
  if (!market) throw new Error('Market not found');
  if (market.status !== 'open') throw new Error('Market is not open');
  
  // Check if market has expired
  if (market.expiresAt && new Date() > market.expiresAt) {
    throw new Error('Market has expired');
  }

  // Wrap in retry logic for database transaction failures
  return await retryWithBackoffSilent(
    async () => {
      return await usersPrisma.$transaction(async (tx) => {
    // Get user
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!market) throw new Error('Market not found');
    if (market.status !== 'open') throw new Error('Market is not open');
    
    // Check if market has expired
    if (market.expiresAt && new Date() > market.expiresAt) {
      throw new Error('Market has expired');
    }

    // Validate bet amount
    if (input.amount < MIN_BET_AMOUNT) {
      throw new Error(`Minimum bet amount is ${MIN_BET_AMOUNT} credits`);
    }
    if (input.amount > MAX_BET_AMOUNT) {
      throw new Error(`Maximum bet amount is ${MAX_BET_AMOUNT} credits`);
    }

    // Check available credits
    const availableCredits = Number(user.availableCredits);
    if (availableCredits < input.amount) {
      throw new Error('Insufficient credits');
    }

    // Get odds for selected side
    const odds = input.side === 'this' ? Number(market.thisOdds) : Number(market.thatOdds);
    if (odds <= 0 || odds > 1) {
      throw new Error('Invalid odds');
    }

    // Calculate potential payout: betAmount / odds
    const potentialPayout = input.amount / odds;

    const balanceBefore = availableCredits;
    const balanceAfter = balanceBefore - input.amount;

    // Create bet record
    // Note: marketId is stored directly (no foreign key constraint since Market is in different database)
    const bet = await tx.bet.create({
      data: {
        userId: userId,
        marketId: market.id,
        amount: input.amount,
        side: input.side,
        oddsAtBet: odds,
        potentialPayout,
        status: 'pending',
      },
    });

    // Update user credits and get updated values
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        availableCredits: balanceAfter,
        creditBalance: balanceAfter, // Also update main balance
        expendedCredits: {
          increment: input.amount,
        },
        totalVolume: {
          increment: input.amount,
        },
      },
      select: {
        overallPnL: true,
        totalVolume: true,
      },
    });

    // Create credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -input.amount, // Negative for debit
        transactionType: 'bet_placed',
        referenceId: bet.id,
        balanceAfter,
      },
    });

        // Fetch market data to include in response (markets are in different database)
        const marketData = {
          id: market.id,
          title: market.title,
          thisOption: market.thisOption,
          thatOption: market.thatOption,
          status: market.status,
        };

        return {
          bet: {
            ...bet,
            market: marketData,
          },
          newBalance: balanceAfter,
          potentialPayout,
          updatedPnL: Number(updatedUser.overallPnL),
          updatedVolume: Number(updatedUser.totalVolume),
        };
      }, {
        timeout: 10000, // 10 second timeout for transaction
        isolationLevel: 'ReadCommitted', // Prevent deadlocks
      });
    },
    {
      maxRetries: 2,
      initialDelayMs: 500,
      retryableErrors: (error) => {
        // Retry on database deadlocks and timeouts
        return error.code === 'P2034' || // Deadlock
               error.code === 'P1008' || // Operation timed out
               error.message?.includes('timeout') ||
               error.message?.includes('deadlock');
      },
    }
  ) || (() => {
    throw new Error('Failed to place bet after retries. Please try again.');
  })();
}

/**
 * Get user's bets with filters and pagination
 */
export async function getUserBets(
  userId: string,
  query: BetQueryInput
): Promise<{
  bets: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  const where: any = {
    userId,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.marketId) {
    where.marketId = query.marketId;
  }

  const [bets, total] = await Promise.all([
    usersPrisma.bet.findMany({
      where,
      orderBy: {
        placedAt: 'desc',
      },
      take: query.limit,
      skip: query.offset,
    }),
    usersPrisma.bet.count({ where }),
  ]);

  // Fetch market data separately (markets are in a different database)
  const marketIds = [...new Set(bets.map(bet => bet.marketId))];
  const markets = await marketsPrisma.market.findMany({
    where: { id: { in: marketIds } },
    select: {
      id: true,
      title: true,
      thisOption: true,
      thatOption: true,
      thisOdds: true,
      thatOdds: true,
      status: true,
      resolution: true,
      resolvedAt: true,
    },
  });
  const marketMap = new Map(markets.map(m => [m.id, m]));

  // Attach market data to bets (normalize Decimal fields to numbers)
  const betsWithMarkets = bets.map(bet => {
    const market = marketMap.get(bet.marketId);
    return {
      ...bet,
      market: market ? {
        ...market,
        thisOdds: market.thisOdds ? Number(market.thisOdds) : null,
        thatOdds: market.thatOdds ? Number(market.thatOdds) : null,
      } : null,
    };
  });

  return {
    bets: betsWithMarkets,
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Get bet by ID
 */
export async function getBetById(betId: string, userId: string): Promise<any | null> {
  const bet = await usersPrisma.bet.findFirst({
    where: {
      id: betId,
      userId, // Ensure user can only access their own bets
    },
  });

  if (!bet) {
    return null;
  }

  // Fetch market data separately (markets are in a different database)
  const market = await marketsPrisma.market.findUnique({
    where: { id: bet.marketId },
    select: {
      id: true,
      title: true,
      description: true,
      thisOption: true,
      thatOption: true,
      status: true,
      resolution: true,
      resolvedAt: true,
      expiresAt: true,
    },
  });

  return {
    ...bet,
    market: market || null,
  };
}

/**
 * Sell a position early (before market expires)
 * Calculates current value based on live odds and returns credits to user
 */
export async function sellPosition(
  userId: string,
  betId: string,
  input?: { amount?: number }
): Promise<{
  bet: any;
  creditsReturned: number;
  newBalance: number;
  currentValue: number;
}> {
  // First, get the bet and user (outside of transaction to avoid long locks)
  const bet = await usersPrisma.bet.findUnique({
    where: { id: betId },
    include: {
      user: true,
    },
  });

  if (!bet) {
    throw new Error('Bet not found');
  }

  if (bet.userId !== userId) {
    throw new Error('Unauthorized');
  }

  if (bet.status !== 'pending') {
    throw new Error('Bet is not pending');
  }

  // Fetch market from markets database
  const market = await marketsPrisma.market.findUnique({
    where: { id: bet.marketId },
  });

  if (!market) {
    throw new Error('Market not found');
  }

  // Check if market is sellable
  if (market.status !== 'open') {
    throw new Error('Cannot sell: Market is not open');
  }

  // Check if market has expired
  if (market.expiresAt && new Date() > market.expiresAt) {
    throw new Error('Cannot sell: Market has expired');
  }

  // Fetch live odds BEFORE entering the transaction to avoid long-running DB locks
  const currentOdds = await getCurrentOddsForBet(bet, market);
  const betAmount = Number(bet.amount);
  const oddsAtBet = Number(bet.oddsAtBet);
  const sellAmount = input?.amount ? Math.min(input.amount, betAmount) : betAmount;
  const currentValue = sellAmount * (currentOdds / oddsAtBet);
  const creditsReturned = Math.max(0, currentValue); // Ensure non-negative

  if (sellAmount < betAmount) {
    // Partial sells not supported yet
    throw new Error('Partial position selling is not yet supported. Please sell your entire position.');
  }

  // Wrap DB work in retry logic for transient errors (deadlocks/timeouts)
  return await retryWithBackoffSilent(
    async () => {
      return await usersPrisma.$transaction(
        async (tx) => {
          // Re-validate bet is still pending
          const currentBet = await tx.bet.findUnique({
            where: { id: bet.id },
            select: {
              id: true,
              status: true,
              amount: true,
              oddsAtBet: true,
              placedAt: true,
              side: true,
            },
          });

          if (!currentBet) {
            throw new Error('Bet not found');
          }

          if (currentBet.status !== 'pending') {
            throw new Error('Bet is not pending');
          }

          // Update bet (mark as cancelled)
          const updatedBet = await tx.bet.update({
            where: { id: bet.id },
            data: {
              status: 'cancelled',
              actualPayout: creditsReturned,
              resolvedAt: new Date(),
            },
          });

          // Update user credits atomically and get new balance
          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: {
              creditBalance: {
                increment: creditsReturned,
              },
              availableCredits: {
                increment: creditsReturned,
              },
              overallPnL: {
                increment: creditsReturned - sellAmount,
              },
            },
            select: {
              creditBalance: true,
            },
          });

          // Create credit transaction audit
          await tx.creditTransaction.create({
            data: {
              userId,
              amount: creditsReturned,
              transactionType: 'position_sold',
              referenceId: bet.id,
              balanceAfter: updatedUser.creditBalance,
            },
          });

          // Attach market data manually (markets live in a different database)
          const betWithMarket = {
            ...updatedBet,
            market: {
              id: market.id,
              title: market.title,
              thisOption: market.thisOption,
              thatOption: market.thatOption,
              status: market.status,
            },
          };

          return {
            bet: betWithMarket,
            creditsReturned,
            newBalance: Number(updatedUser.creditBalance),
            currentValue: creditsReturned,
          };
        },
        {
          timeout: 10000, // 10 second timeout for transaction
          isolationLevel: 'ReadCommitted',
        }
      );
    },
    {
      maxRetries: 2,
      initialDelayMs: 500,
      retryableErrors: (error) => {
        // Retry on database deadlocks and timeouts
        return error.code === 'P2034' || // Deadlock
               error.code === 'P1008' || // Operation timed out
               error.message?.includes('timeout') ||
               error.message?.includes('deadlock');
      },
    }
  ) || (() => {
    throw new Error('Failed to sell position after retries. Please try again.');
  })();
}

