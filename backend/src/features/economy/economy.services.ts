import { usersPrisma as prisma } from '../../lib/database.js';
import { generateTransactionHash } from '../../lib/transaction-signer.js';
import type { BuyStockInput, SellStockInput } from './economy.models.js';

// ============================================================================
// Daily Credits Configuration (P3 - Beta Phase Structure)
// ============================================================================
// Day 1: 500 credits (first login/signup bonus ONLY)
// Day 2+: 100 base credits
// +50 bonus every 2 consecutive days
// Streak reset: back to 100 credits
// ============================================================================

const FIRST_LOGIN_BONUS = 500; // Day 1 signup bonus
const BASE_DAILY_CREDITS = 100; // Base daily credits (Day 2+)
const STREAK_BONUS_INCREMENT = 50; // +50 every 2 days
const STREAK_BONUS_INTERVAL = 2; // Bonus increases every 2 days
const MS_IN_DAY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Get UTC reset time (00:00 UTC) timestamp for a given date
 */
function getUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

/**
 * Get the next UTC reset time (00:00 UTC tomorrow)
 */
function getNextUtcMidnight(date: Date): Date {
  const now = new Date();
  const todayResetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  // If current time is before today's reset time, return today's reset time
  if (now.getTime() < todayResetTime.getTime()) {
    return todayResetTime;
  }

  // Otherwise return tomorrow's reset time
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/**
 * Calculate daily credit allocation based on consecutive days (P3 - Beta Phase)
 *
 * New Structure:
 * - Day 1: 500 credits (first login/signup bonus ONLY)
 * - Day 2-3: 100 credits (base daily reward)
 * - Day 4-5: 150 credits (+50 after 2-day streak)
 * - Day 6-7: 200 credits (+50 after another 2-day streak)
 * - Day 8-9: 250 credits
 * - ... continues: +50 every 2 days
 *
 * Formula for Day 2+: credits = 100 + (Math.floor((streak - 2) / 2) * 50)
 * Where streak is the consecutive days count (2, 3, 4, ...)
 *
 * Streak Reset: If you miss a day, start back at 100 credits (streak resets to 1)
 *
 * @param consecutiveDays - The current streak count (1 = first day/reset, 2+ = continuing streak)
 * @param isFirstEverClaim - Whether this is the user's very first claim ever
 */
export function calculateDailyCredits(consecutiveDays: number, isFirstEverClaim: boolean = false): number {
  // First ever login/signup gets 500 credits bonus
  if (isFirstEverClaim) {
    return FIRST_LOGIN_BONUS;
  }

  // Ensure minimum of 1 day
  const streak = Math.max(1, consecutiveDays);

  // Streak reset (day 1) or Day 2-3: base 100 credits
  if (streak <= 3) {
    return BASE_DAILY_CREDITS;
  }

  // Day 4+: Apply streak bonus
  // Formula: 100 + (Math.floor((streak - 2) / 2) * 50)
  // Day 4-5: 100 + floor((4-2)/2)*50 = 100 + 1*50 = 150
  // Day 6-7: 100 + floor((6-2)/2)*50 = 100 + 2*50 = 200
  // Day 8-9: 100 + floor((8-2)/2)*50 = 100 + 3*50 = 250
  const bonusMultiplier = Math.floor((streak - 2) / STREAK_BONUS_INTERVAL);
  const credits = BASE_DAILY_CREDITS + (bonusMultiplier * STREAK_BONUS_INCREMENT);

  return credits;
}

/**
 * Process daily credit allocation for a user
 * Updates consecutive days online and allocates credits
 */
export async function processDailyCreditAllocation(userId: string): Promise<{
  creditsAwarded: number;
  consecutiveDays: number;
  nextAvailableAt: Date;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const lastRewardAt = user.lastDailyRewardAt;

  // Check if this is the user's very first claim ever (for 500 credit bonus)
  const isFirstEverClaim = !lastRewardAt;

  // Check if user can claim daily reward (resets at 00:00 UTC)
  // PRD: Credit claim happens every 00:00 UTC
  if (lastRewardAt) {
    const nowMidnight = getUtcMidnight(now);
    const lastRewardMidnight = getUtcMidnight(lastRewardAt);

    if (nowMidnight === lastRewardMidnight) {
      const nextAvailable = getNextUtcMidnight(lastRewardAt);
      const hoursUntilNext = Math.ceil((nextAvailable.getTime() - now.getTime()) / (1000 * 60 * 60));
      throw new Error(`Daily credits already claimed. Next claim available in ${hoursUntilNext} hours.`);
    }
  }

  // Calculate consecutive days based on last rewarding day
  let consecutiveDays = 1;
  if (lastRewardAt) {
    const daysSinceLastReward = Math.floor(
      (getUtcMidnight(now) - getUtcMidnight(lastRewardAt)) / MS_IN_DAY
    );

    if (daysSinceLastReward === 1) {
      consecutiveDays = user.consecutiveDaysOnline + 1;
    } else if (daysSinceLastReward <= 0) {
      consecutiveDays = user.consecutiveDaysOnline || 1;
    } else {
      // Streak broken - reset to 1
      consecutiveDays = 1;
    }
  }

  // Calculate credits to award (pass isFirstEverClaim for 500 credit signup bonus)
  const creditsAwarded = calculateDailyCredits(consecutiveDays, isFirstEverClaim);

  // Update user and create transaction atomically
  await prisma.$transaction(async (tx) => {
    // Update user (daily rewards go to free credits)
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        creditBalance: {
          increment: creditsAwarded,
        },
        availableCredits: {
          increment: creditsAwarded,
        },
        consecutiveDaysOnline: consecutiveDays,
        lastDailyRewardAt: now,
        lastLoginAt: now,
      },
    });

    // Create credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: creditsAwarded,
        transactionType: 'daily_reward',
        balanceAfter: Number(updatedUser.creditBalance),
      },
    });

    // Create daily reward record
    await tx.dailyReward.create({
      data: {
        userId,
        creditsAwarded,
        claimedAt: now,
      },
    });
  });

  const nextAvailable = getNextUtcMidnight(now);

  return {
    creditsAwarded,
    consecutiveDays,
    nextAvailableAt: nextAvailable,
  };
}

/**
 * Buy stocks with leverage
 */
export async function buyStock(
  userId: string,
  input: BuyStockInput
): Promise<{
  transaction: any;
  holding: any;
  newBalance: number;
}> {
  return await prisma.$transaction(async (tx) => {
    // Get user and stock
    const user = await tx.user.findUnique({ where: { id: userId } });
    const stock = await tx.stock.findUnique({ where: { id: input.stockId } });

    if (!user) throw new Error('User not found');
    if (!stock) throw new Error('Stock not found');
    if (stock.status !== 'active') throw new Error('Stock is not active');

    // Validate leverage
    if (input.leverage > Number(stock.maxLeverage)) {
      throw new Error(`Maximum leverage is ${stock.maxLeverage}x`);
    }

    // Calculate total cost (shares * price * leverage)
    const totalCost = Number(input.shares) * Number(stock.currentPrice) * input.leverage;

    // Check available credits
    if (Number(user.availableCredits) < totalCost) {
      throw new Error('Insufficient credits');
    }

    // Get or create holding
    let holding = await tx.stockHolding.findUnique({
      where: {
        userId_stockId: {
          userId,
          stockId: input.stockId,
        },
      },
    });

    const balanceBefore = Number(user.availableCredits);
    const balanceAfter = balanceBefore - totalCost;

    // Update or create holding
    if (holding) {
      // Update existing holding (calculate new average)
      const totalShares = Number(holding.shares) + Number(input.shares);
      const totalInvested = Number(holding.totalInvested) + totalCost;
      const newAveragePrice = totalInvested / totalShares;

      holding = await tx.stockHolding.update({
        where: { id: holding.id },
        data: {
          shares: totalShares,
          averageBuyPrice: newAveragePrice,
          totalInvested: totalInvested,
          leverage: input.leverage, // Update leverage
        },
      });
    } else {
      // Create new holding
      holding = await tx.stockHolding.create({
        data: {
          userId,
          stockId: input.stockId,
          shares: input.shares,
          averageBuyPrice: Number(stock.currentPrice),
          totalInvested: totalCost,
          leverage: input.leverage,
        },
      });
    }

    // Update user credits
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        availableCredits: balanceAfter,
        expendedCredits: {
          increment: totalCost,
        },
      },
    });

    // Update stock circulating supply and market cap
    const newCirculatingSupply = Number(stock.circulatingSupply) + Number(input.shares);
    const newMarketCap = Number(stock.currentPrice) * newCirculatingSupply;
    
    await tx.stock.update({
      where: { id: input.stockId },
      data: {
        circulatingSupply: newCirculatingSupply,
        marketCap: newMarketCap,
      },
    });

    // Generate transaction hash
    const transactionHash = generateTransactionHash(
      userId,
      input.stockId,
      'buy',
      Number(input.shares),
      Number(stock.currentPrice)
    );

    // Create transaction record
    const transaction = await tx.stockTransaction.create({
      data: {
        userId,
        stockId: input.stockId,
        type: 'buy',
        shares: input.shares,
        pricePerShare: stock.currentPrice,
        totalAmount: totalCost,
        leverage: input.leverage,
        transactionHash,
        balanceBefore,
        balanceAfter,
      },
    });

    // Create credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -totalCost, // Negative for debit
        transactionType: 'stock_purchase',
        referenceId: transaction.id,
        balanceAfter,
      },
    });

    return {
      transaction,
      holding,
      newBalance: balanceAfter,
    };
  });
}

/**
 * Sell stocks
 */
export async function sellStock(
  userId: string,
  input: SellStockInput
): Promise<{
  transaction: any;
  holding: any;
  newBalance: number;
  profit: number;
}> {
  return await prisma.$transaction(async (tx) => {
    // Get user and stock
    const user = await tx.user.findUnique({ where: { id: userId } });
    const stock = await tx.stock.findUnique({ where: { id: input.stockId } });

    if (!user) throw new Error('User not found');
    if (!stock) throw new Error('Stock not found');
    if (stock.status !== 'active') throw new Error('Stock is not active');

    // Get holding
    const holding = await tx.stockHolding.findUnique({
      where: {
        userId_stockId: {
          userId,
          stockId: input.stockId,
        },
      },
    });

    if (!holding) throw new Error('No stock holding found');
    if (Number(holding.shares) < Number(input.shares)) {
      throw new Error('Insufficient shares');
    }

    // Calculate sale proceeds
    const saleProceeds = Number(input.shares) * Number(stock.currentPrice);
    const costBasis = Number(input.shares) * Number(holding.averageBuyPrice);
    const profit = saleProceeds - costBasis;

    const balanceBefore = Number(user.availableCredits);
    const balanceAfter = balanceBefore + saleProceeds;

    // Update holding
    const remainingShares = Number(holding.shares) - Number(input.shares);
    let updatedHolding;
    
    if (remainingShares > 0) {
      // Update holding with remaining shares
      updatedHolding = await tx.stockHolding.update({
        where: { id: holding.id },
        data: {
          shares: remainingShares,
          totalInvested: Number(holding.totalInvested) - costBasis,
        },
      });
    } else {
      // Delete holding if all shares sold
      await tx.stockHolding.delete({
        where: { id: holding.id },
      });
      updatedHolding = null;
    }

    // Update user credits
    await tx.user.update({
      where: { id: userId },
      data: {
        availableCredits: balanceAfter,
        overallPnL: {
          increment: profit,
        },
      },
    });

    // Update stock circulating supply and market cap
    const newCirculatingSupply = Number(stock.circulatingSupply) - Number(input.shares);
    const newMarketCap = Number(stock.currentPrice) * newCirculatingSupply;
    
    await tx.stock.update({
      where: { id: input.stockId },
      data: {
        circulatingSupply: newCirculatingSupply,
        marketCap: newMarketCap,
      },
    });

    // Generate transaction hash
    const transactionHash = generateTransactionHash(
      userId,
      input.stockId,
      'sell',
      Number(input.shares),
      Number(stock.currentPrice)
    );

    // Create transaction record
    const transaction = await tx.stockTransaction.create({
      data: {
        userId,
        stockId: input.stockId,
        type: 'sell',
        shares: input.shares,
        pricePerShare: stock.currentPrice,
        totalAmount: saleProceeds,
        leverage: holding.leverage,
        transactionHash,
        balanceBefore,
        balanceAfter,
      },
    });

    // Create credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: saleProceeds, // Positive for credit
        transactionType: 'stock_sale',
        referenceId: transaction.id,
        balanceAfter,
      },
    });

    return {
      transaction,
      holding: updatedHolding,
      newBalance: balanceAfter,
      profit,
    };
  });
}

/**
 * Get user's stock portfolio
 */
export async function getUserPortfolio(userId: string) {
  const holdings = await prisma.stockHolding.findMany({
    where: { userId },
    include: {
      stock: true,
    },
  });

  return holdings.map((holding) => {
    const currentValue = Number(holding.shares) * Number(holding.stock.currentPrice);
    const costBasis = Number(holding.totalInvested);
    const profit = currentValue - costBasis;
    const profitPercent = costBasis > 0 ? (profit / costBasis) * 100 : 0;

    return {
      ...holding,
      currentValue,
      profit,
      profitPercent,
    };
  });
}

