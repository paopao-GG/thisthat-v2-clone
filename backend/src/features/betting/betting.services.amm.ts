/**
 * Polymarket-Based Betting Services (P1 - Polymarket Liquidity Integration)
 *
 * This implementation uses live prices from Polymarket's CLOB API.
 * THISTHAT bets don't affect Polymarket - we only display their odds.
 * Shares are calculated as: shares = amount / price
 * Each winning share pays 1 credit.
 */

import { usersPrisma, marketsPrisma } from '../../lib/database.js';
import type { PlaceBetInput } from './betting.models.js';
import {
  getPrice,
  isPriceServiceAvailable,
  calculateShares,
  calculatePotentialPayout,
  type LivePrice,
} from '../../services/polymarket-price.service.js';
import { retryWithBackoff } from '../../lib/retry.js';
import { updateUserScoreInCache } from '../leaderboard/leaderboard.services.js';
import { isMarketEndingSoon } from '../../shared/helpers/market-helpers.js';

const MIN_BET_AMOUNT = 10;
const MAX_BET_AMOUNT = 10000;

/**
 * Place a bet using Polymarket live prices (P1)
 * Shares = amount / price
 * Each winning share pays 1 credit
 */
export async function placeBetAMM(
  userId: string,
  input: PlaceBetInput
): Promise<{
  bet: any;
  newBalance: number;
  creditSource: 'free' | 'purchased';
  freeCreditsBalance: number;
  purchasedCreditsBalance: number;
  sharesReceived: number;
  priceImpact: number;
  newProbability: number;
}> {
  // P1: Check if Polymarket price service is available
  if (!(await isPriceServiceAvailable())) {
    throw new Error('Polymarket is currently unavailable. Please try again later.');
  }

  // Find market
  const market = await marketsPrisma.market.findUnique({
    where: { id: input.marketId },
  });

  if (!market) {
    throw new Error('Market not found');
  }

  if (market.status !== 'open') {
    throw new Error('Market is not open for betting');
  }

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

  // P1: Get token ID for the selected side
  const tokenId = input.side === 'this' ? market.thisTokenId : market.thatTokenId;
  if (!tokenId) {
    throw new Error('Market is not properly configured for betting. Missing Polymarket token ID.');
  }

  // P1: Fetch live price from Polymarket
  let livePrice: LivePrice;
  try {
    livePrice = await getPrice(tokenId);
  } catch (error: any) {
    console.error('[Betting] Failed to fetch Polymarket price:', error.message);
    throw new Error('Failed to fetch live price from Polymarket. Please try again.');
  }

  // P1: Check if price is available
  if (!livePrice.isAvailable) {
    throw new Error('Polymarket price is currently unavailable. Please try again later.');
  }

  // P1: Validate price bounds (must be between 0 and 1 exclusive)
  const price = livePrice.midpoint;
  if (price <= 0 || price >= 1) {
    throw new Error(`Invalid market price: ${price}. Cannot place bet.`);
  }

  // P1: Calculate shares based on live price
  // shares = amount / price
  const sharesReceived = calculateShares(input.amount, price);
  const potentialPayout = calculatePotentialPayout(sharesReceived);
  const effectivePrice = price;

  // For compatibility, calculate price impact as 0 (we don't affect Polymarket)
  const priceImpact = 0;

  console.log('[Betting] P1 Trade calculation:', {
    side: input.side,
    amount: input.amount,
    price,
    sharesReceived,
    potentialPayout,
  });

  let lastError: Error | null = null;
  let result;
  try {
    result = await retryWithBackoff(
      async () => {
        return await usersPrisma.$transaction(async (tx) => {
        // Check for duplicate bet using idempotency key
        if (input.idempotencyKey) {
          const existingBet = await tx.bet.findFirst({
            where: {
              userId,
              idempotencyKey: input.idempotencyKey,
            },
            select: {
              id: true,
              amount: true,
              side: true,
              sharesReceived: true,
              priceAtBet: true,
              creditSource: true,
            },
          });

          if (existingBet) {
            console.log(`[AMM] Duplicate bet request detected - idempotencyKey: ${input.idempotencyKey}, returning existing bet: ${existingBet.id}`);

            // Return the existing bet result
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: {
                freeCreditsBalance: true,
                purchasedCreditsBalance: true,
                overallPnL: true,
                totalVolume: true,
              },
            });

            if (!user) {
              throw new Error('User not found');
            }

            return {
              bet: existingBet,
              newBalance: existingBet.creditSource === 'free'
                ? Number(user.freeCreditsBalance)
                : Number(user.purchasedCreditsBalance),
              creditSource: existingBet.creditSource as 'free' | 'purchased',
              freeCreditsBalance: Number(user.freeCreditsBalance),
              purchasedCreditsBalance: Number(user.purchasedCreditsBalance),
              sharesReceived: Number(existingBet.sharesReceived),
              priceImpact: 0,
              newProbability: Number(existingBet.priceAtBet),
              updatedPnL: Number(user.overallPnL),
              updatedVolume: Number(user.totalVolume),
            };
          }
        }

        // First, get current user balances for logging and wallet selection
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            freeCreditsBalance: true,
            purchasedCreditsBalance: true,
          },
        });
        if (!user) {
          console.error(`[AMM] User not found: ${userId}`);
          throw new Error('User not found');
        }

        // Determine if market is ending soon
        const isEndingSoon = isMarketEndingSoon(market.expiresAt);
        const freeBalance = Number(user.freeCreditsBalance);
        const purchasedBalance = Number(user.purchasedCreditsBalance);

        let creditSource: 'free' | 'purchased';
        let updateResult: { count: number };

        console.log(`[AMM] Place bet attempt - User: ${user.name || user.email}, Free: ${freeBalance}, Purchased: ${purchasedBalance}, Bet: ${input.amount}, EndingSoon: ${isEndingSoon}`);

        // ATOMIC UPDATE: Use updateMany with balance check in WHERE clause
        // This prevents TOCTOU race conditions - the balance check and deduction happen atomically
        if (isEndingSoon) {
          // Ending soon markets require purchased credits only
          updateResult = await tx.user.updateMany({
            where: {
              id: userId,
              purchasedCreditsBalance: { gte: input.amount },
            },
            data: {
              purchasedCreditsBalance: { decrement: input.amount },
              availableCredits: { decrement: input.amount },
              creditBalance: { decrement: input.amount },
              expendedCredits: { increment: input.amount },
              totalVolume: { increment: input.amount },
            },
          });
          creditSource = 'purchased';

          if (updateResult.count === 0) {
            throw new Error(
              `This market ends soon. You need ${input.amount} purchased credits but only have ${Math.floor(purchasedBalance)}.`
            );
          }
        } else {
          // Normal markets: ONLY free credits allowed (no fallback to purchased)
          updateResult = await tx.user.updateMany({
            where: {
              id: userId,
              freeCreditsBalance: { gte: input.amount },
            },
            data: {
              freeCreditsBalance: { decrement: input.amount },
              availableCredits: { decrement: input.amount },
              creditBalance: { decrement: input.amount },
              expendedCredits: { increment: input.amount },
              totalVolume: { increment: input.amount },
            },
          });
          creditSource = 'free';

          if (updateResult.count === 0) {
            throw new Error(
              `Not enough free credits. You need ${input.amount} but only have ${Math.floor(freeBalance)}. Reduce your bet amount or wait for daily credit refill.`
            );
          }
        }

        console.log(`[AMM] Balance deducted atomically from ${creditSource} wallet`);

        // Create the bet (balance already deducted atomically)
        const bet = await tx.bet.create({
          data: {
            userId: userId,
            marketId: market.id,
            amount: input.amount,
            side: input.side,
            creditSource,
            sharesReceived: sharesReceived,
            priceAtBet: effectivePrice,
            oddsAtBet: effectivePrice,
            potentialPayout: potentialPayout,
            status: 'pending',
            idempotencyKey: input.idempotencyKey,
          },
        });

        // Get updated balances for response and audit
        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          select: {
            overallPnL: true,
            totalVolume: true,
            freeCreditsBalance: true,
            purchasedCreditsBalance: true,
            creditBalance: true,
          },
        });

        if (!updatedUser) {
          throw new Error('Failed to fetch updated user balance');
        }

        // Create audit record
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: -input.amount,
            transactionType: 'bet_placed',
            referenceId: bet.id,
            balanceAfter: Number(updatedUser.creditBalance),
          },
        });

        return {
          bet,
          newBalance: creditSource === 'free'
            ? Number(updatedUser.freeCreditsBalance)
            : Number(updatedUser.purchasedCreditsBalance),
          creditSource,
          freeCreditsBalance: Number(updatedUser.freeCreditsBalance),
          purchasedCreditsBalance: Number(updatedUser.purchasedCreditsBalance),
          sharesReceived: sharesReceived,
          priceImpact: priceImpact,
          newProbability: effectivePrice,
          updatedPnL: Number(updatedUser.overallPnL),
          updatedVolume: Number(updatedUser.totalVolume),
        };
      }, {
        timeout: 10000,
        isolationLevel: 'ReadCommitted',
      });
    },
    {
      maxRetries: 2,
      initialDelayMs: 500,
      retryableErrors: (error: any) => {
        return error.code === 'P2034' ||
               error.code === 'P1008' ||
               error.message?.includes('timeout') ||
               error.message?.includes('deadlock');
      },
    }
    );
  } catch (error: any) {
    // Preserve the original error message instead of generic "Failed to place bet"
    console.error('[AMM] Bet placement failed:', error.message);
    throw error;
  }

  if (!result) {
    throw new Error('Failed to place bet after retries');
  }

  // P1: Update market volume only (no reserve updates - we don't affect Polymarket)
  try {
    const currentLiquidity = Number(market.liquidity) || 0;
    const currentVolume = Number(market.volume) || 0;
    const currentVolume24hr = Number(market.volume24hr) || 0;

    await marketsPrisma.market.update({
      where: { id: market.id },
      data: {
        // P1: Update odds from live price (for display purposes)
        thisOdds: input.side === 'this' ? effectivePrice : (1 - effectivePrice),
        thatOdds: input.side === 'that' ? effectivePrice : (1 - effectivePrice),
        lastPriceUpdate: new Date(),
        // Update THISTHAT internal volume tracking
        liquidity: currentLiquidity + input.amount,
        volume: currentVolume + input.amount,
        volume24hr: currentVolume24hr + input.amount,
      },
    });

    console.log('[Betting] P1 Updated market volume:', {
      marketId: market.id,
      betAmount: input.amount,
      newLiquidity: currentLiquidity + input.amount,
      priceAtBet: effectivePrice,
    });
  } catch (error) {
    console.error('[Betting] Failed to update market:', error);
  }

  try {
    updateUserScoreInCache(
      userId,
      result.updatedPnL,
      result.updatedVolume
    ).catch(err => console.error('Failed to update leaderboard cache:', err));
  } catch (error) {
    console.error('[Betting] Failed to update leaderboard cache:', error);
  }

  const { updatedPnL, updatedVolume, ...response } = result;
  return response;
}

/**
 * Sell position early (before market resolution) - P1 Polymarket version
 * Credits received = shares * current price
 */
export async function sellPosition(
  userId: string,
  betId: string
): Promise<{
  creditsReceived: number;
  profit: number;
  priceImpact: number;
}> {
  // P1: Check if Polymarket price service is available
  if (!(await isPriceServiceAvailable())) {
    throw new Error('Polymarket is currently unavailable. Please try again later.');
  }

  // Get bet
  const bet = await usersPrisma.bet.findUnique({
    where: { id: betId },
  });

  if (!bet) {
    throw new Error('Bet not found');
  }

  if (bet.userId !== userId) {
    throw new Error('You do not own this bet');
  }

  if (bet.status !== 'pending') {
    throw new Error('Bet is already resolved or cancelled');
  }

  // Get market
  const market = await marketsPrisma.market.findUnique({
    where: { id: bet.marketId },
  });

  if (!market) {
    throw new Error('Market not found');
  }

  if (market.status === 'resolved') {
    throw new Error('Market is already resolved. Cannot sell position.');
  }

  const shares = Number(bet.sharesReceived);
  if (shares <= 0) {
    throw new Error('No shares to sell');
  }

  // P1: Get token ID for the bet's side
  const tokenId = bet.side === 'this' ? market.thisTokenId : market.thatTokenId;
  if (!tokenId) {
    throw new Error('Market is not properly configured. Missing Polymarket token ID.');
  }

  // P1: Fetch live price from Polymarket
  let livePrice: LivePrice;
  try {
    livePrice = await getPrice(tokenId);
  } catch (error: any) {
    console.error('[Betting] Failed to fetch Polymarket price for sell:', error.message);
    throw new Error('Failed to fetch live price from Polymarket. Please try again.');
  }

  if (!livePrice.isAvailable) {
    throw new Error('Polymarket price is currently unavailable. Please try again later.');
  }

  // P1: Calculate credits received = shares * current price
  const currentPrice = livePrice.midpoint;
  const creditsReceived = shares * currentPrice;
  const profit = creditsReceived - Number(bet.amount);
  const priceImpact = 0; // We don't affect Polymarket

  console.log('[Betting] P1 Sell calculation:', {
    side: bet.side,
    shares,
    currentPrice,
    creditsReceived,
    profit,
  });

  // Execute transaction
  const sellResult = await retryWithBackoff(
    async () => {
      return await usersPrisma.$transaction(async (tx) => {
        // Update user balance
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new Error('User not found');
        }

        // P5: Return credits to the wallet that funded the original bet
        const creditSource = bet.creditSource || 'free'; // Default for legacy bets

        // Check if this is a new biggest win (only if profit is positive)
        const currentBiggestWin = Number(user.biggestWin ?? 0);
        const shouldUpdateBiggestWin = profit > 0 && profit > currentBiggestWin;

        const walletUpdateData = creditSource === 'free'
          ? {
              freeCreditsBalance: { increment: creditsReceived },
              creditBalance: { increment: creditsReceived },
              availableCredits: { increment: creditsReceived },
              overallPnL: { increment: profit },
              ...(shouldUpdateBiggestWin && { biggestWin: profit }),
            }
          : {
              purchasedCreditsBalance: { increment: creditsReceived },
              creditBalance: { increment: creditsReceived },
              availableCredits: { increment: creditsReceived },
              overallPnL: { increment: profit },
              ...(shouldUpdateBiggestWin && { biggestWin: profit }),
            };

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: walletUpdateData,
          select: {
            overallPnL: true,
            totalVolume: true,
            freeCreditsBalance: true,
            purchasedCreditsBalance: true,
            creditBalance: true,
          },
        });

        const newBalance = creditSource === 'free'
          ? Number(updatedUser.freeCreditsBalance)
          : Number(updatedUser.purchasedCreditsBalance);

        console.log(`[AMM] Sell position - Returned ${creditsReceived} to ${creditSource} wallet for bet ${bet.id}`);

        // Update bet status
        await tx.bet.update({
          where: { id: betId },
          data: {
            status: 'cancelled', // Mark as cancelled (sold early)
            actualPayout: creditsReceived,
            resolvedAt: new Date(),
          },
        });

        // Create transaction record
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: creditsReceived,
            transactionType: 'position_sold',
            referenceId: betId,
            balanceAfter: newBalance,
          },
        });

        return {
          creditsReceived,
          profit,
          priceImpact,
          updatedPnL: Number(updatedUser.overallPnL),
          updatedVolume: Number(updatedUser.totalVolume),
        };
      }, {
        timeout: 10000,
        isolationLevel: 'ReadCommitted',
      });
    },
    {
      maxRetries: 2,
      initialDelayMs: 500,
      retryableErrors: (error: any) => {
        return error.code === 'P2034' ||
               error.code === 'P1008' ||
               error.message?.includes('timeout') ||
               error.message?.includes('deadlock');
      },
    }
  );

  // P1: Update market timestamp (no reserve updates - we don't affect Polymarket)
  try {
    await marketsPrisma.market.update({
      where: { id: market.id },
      data: {
        lastPriceUpdate: new Date(),
      },
    });
  } catch (error) {
    console.error('[Betting] Failed to update market after sell:', error);
  }

  // Update Redis sorted sets for leaderboard
  try {
    updateUserScoreInCache(
      userId,
      sellResult.updatedPnL,
      sellResult.updatedVolume
    ).catch(err => console.error('Failed to update leaderboard cache after sell:', err));
  } catch (error) {
    console.error('[Betting] Failed to update leaderboard cache after sell:', error);
  }

  const { updatedPnL, updatedVolume, ...response } = sellResult;
  return response;
}

/**
 * Get quote for a potential trade (without executing) - P1 Polymarket version
 */
export async function getTradeQuote(
  marketId: string,
  amount: number,
  side: 'this' | 'that'
): Promise<{
  sharesReceived: number;
  priceImpact: number;
  probabilityBefore: number;
  probabilityAfter: number;
  effectivePrice: number;
  requiresPurchasedCredits: boolean; // NEW: P5 warning
}> {
  // P1: Check if Polymarket price service is available
  if (!(await isPriceServiceAvailable())) {
    throw new Error('Polymarket is currently unavailable. Please try again later.');
  }

  const market = await marketsPrisma.market.findUnique({
    where: { id: marketId },
  });

  if (!market) {
    throw new Error('Market not found');
  }

  // P5: Check if this market requires purchased credits
  const requiresPurchasedCredits = isMarketEndingSoon(market.expiresAt);

  // P1: Get token ID for the selected side
  const tokenId = side === 'this' ? market.thisTokenId : market.thatTokenId;
  if (!tokenId) {
    throw new Error('Market is not properly configured. Missing Polymarket token ID.');
  }

  // P1: Fetch live price from Polymarket
  let livePrice: LivePrice;
  try {
    livePrice = await getPrice(tokenId);
  } catch (error: any) {
    console.error('[Betting] Failed to fetch Polymarket price for quote:', error.message);
    throw new Error('Failed to fetch live price from Polymarket.');
  }

  if (!livePrice.isAvailable) {
    throw new Error('Polymarket price is currently unavailable.');
  }

  const price = livePrice.midpoint;
  if (price <= 0 || price >= 1) {
    throw new Error(`Invalid market price: ${price}`);
  }

  // P1: Calculate shares based on live price
  const sharesReceived = calculateShares(amount, price);

  return {
    sharesReceived,
    priceImpact: 0, // We don't affect Polymarket
    probabilityBefore: price, // Current probability
    probabilityAfter: price, // Same - we don't affect Polymarket
    effectivePrice: price,
    requiresPurchasedCredits, // NEW: P5 warning
  };
}
