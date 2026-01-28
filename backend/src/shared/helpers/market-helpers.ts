/**
 * Shared market helper functions
 * Used across betting, resolution, and market services
 */

/** 3 days in milliseconds - threshold for "Ending Soon" markets */
export const ENDING_SOON_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Check if a market is "Ending Soon" (< 3 days to expiry)
 * Used for P5 dual wallet credit source selection
 */
export function isMarketEndingSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const now = new Date();
  const threshold = new Date(now.getTime() + ENDING_SOON_THRESHOLD_MS);
  return expiresAt <= threshold && expiresAt > now;
}

/**
 * P5: Determine which credit wallet to use for a bet
 *
 * Rules:
 * 1. "Ending Soon" markets (< 3 days to expiry) = purchased credits ONLY
 * 2. Normal markets = free credits ONLY (no fallback to purchased)
 *
 * @returns { source: 'free' | 'purchased', error?: string }
 */
export function determineCreditSource(
  market: { expiresAt: Date | null },
  user: { freeCreditsBalance: number; purchasedCreditsBalance: number },
  betAmount: number
): { source: 'free' | 'purchased'; error?: string } {
  // Round bet amount upfront to avoid decimal confusion
  const roundedBetAmount = Math.ceil(betAmount);

  // Validate inputs
  if (roundedBetAmount <= 0) {
    return {
      source: 'free',
      error: 'Bet amount must be greater than zero.',
    };
  }

  const freeCredits = user.freeCreditsBalance;
  const purchasedCredits = user.purchasedCreditsBalance;

  // Validate balance data integrity
  if (isNaN(freeCredits) || isNaN(purchasedCredits) || freeCredits < 0 || purchasedCredits < 0) {
    return {
      source: 'free',
      error: 'Invalid account balance. Please refresh and try again.',
    };
  }

  const isEndingSoon = isMarketEndingSoon(market.expiresAt);

  if (isEndingSoon) {
    // Ending Soon markets require purchased credits ONLY
    if (purchasedCredits >= roundedBetAmount) {
      return { source: 'purchased' };
    }
    return {
      source: 'purchased',
      error: `This market ends soon. You need ${roundedBetAmount} purchased credits but only have ${Math.ceil(purchasedCredits)}.`,
    };
  }

  // Normal markets: ONLY free credits allowed (no fallback to purchased)
  if (freeCredits >= roundedBetAmount) {
    return { source: 'free' };
  }

  // Not enough free credits for normal market
  return {
    source: 'free',
    error: `Not enough free credits. You need ${roundedBetAmount} but only have ${Math.ceil(freeCredits)}. Reduce your bet amount or wait for daily credit refill.`,
  };
}
