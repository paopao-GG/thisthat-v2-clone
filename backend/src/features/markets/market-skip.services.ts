/**
 * Market Skip Service
 *
 * Handles user skip interactions with markets
 */

import { usersPrisma } from '../../lib/database.js';

const SKIP_TTL_DAYS = 3;
const SKIP_TTL_MS = SKIP_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SkipMarketResult {
  success: boolean;
  expiresAt: Date;
}

/**
 * Record that a user skipped a market
 * Sets expiry to 3 days from now
 */
export async function skipMarket(userId: string, marketId: string): Promise<SkipMarketResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SKIP_TTL_MS);

  await usersPrisma.userMarketInteraction.upsert({
    where: {
      userId_marketId: {
        userId,
        marketId,
      },
    },
    create: {
      userId,
      marketId,
      action: 'skip',
      timestamp: now,
      expiresAt,
    },
    update: {
      action: 'skip',
      timestamp: now,
      expiresAt,
    },
  });

  return {
    success: true,
    expiresAt,
  };
}

/**
 * Get list of market IDs that user has skipped and haven't expired yet
 */
export async function getSkippedMarketIds(userId: string): Promise<string[]> {
  const now = new Date();

  const interactions = await usersPrisma.userMarketInteraction.findMany({
    where: {
      userId,
      action: 'skip',
      expiresAt: { gt: now }, // Not expired yet
    },
    select: {
      marketId: true,
    },
  });

  return interactions.map((i) => i.marketId);
}

/**
 * Remove skip for a specific market (e.g., when user bets on it)
 */
export async function removeSkip(userId: string, marketId: string): Promise<void> {
  await usersPrisma.userMarketInteraction.deleteMany({
    where: {
      userId,
      marketId,
      action: 'skip',
    },
  });
}

/**
 * Clean up expired skip records for all users
 * Called by janitor service
 */
export async function cleanupExpiredSkips(): Promise<number> {
  const now = new Date();

  const result = await usersPrisma.userMarketInteraction.deleteMany({
    where: {
      action: 'skip',
      expiresAt: { lte: now },
    },
  });

  return result.count;
}
