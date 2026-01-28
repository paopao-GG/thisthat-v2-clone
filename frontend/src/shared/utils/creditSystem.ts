/**
 * Credit System Utilities
 * Handles daily claim calculations, streak management, and credit operations
 *
 * Daily credits reset at 00:00 UTC (8:00 AM PHT)
 * Users can claim once per UTC day
 *
 * P3 - Beta Phase Structure:
 * - Day 1: 500 credits (first login/signup bonus ONLY)
 * - Day 2-3: 100 credits (base daily reward)
 * - Day 4-5: 150 credits (+50 after 2-day streak)
 * - Day 6-7: 200 credits (+50 after another 2-day streak)
 * - ... continues: +50 every 2 days
 * - Streak reset: back to 100 credits
 */

// Configuration constants (must match backend)
const FIRST_LOGIN_BONUS = 500;
const BASE_DAILY_CREDITS = 100;
const STREAK_BONUS_INCREMENT = 50;
const STREAK_BONUS_INTERVAL = 2;

export interface CreditClaimInfo {
  dailyClaimAmount: number;
  streak: number;
  nextClaimAvailable: Date;
  isClaimAvailable: boolean;
  isFirstEverClaim: boolean;
}

/**
 * Calculate daily claim amount based on streak (P3 - Beta Phase)
 *
 * New Structure:
 * - Day 1 (first ever): 500 credits (signup bonus)
 * - Day 2-3: 100 credits (base)
 * - Day 4-5: 150 credits
 * - Day 6-7: 200 credits
 * - ... +50 every 2 days
 *
 * Formula for Day 2+: credits = 100 + (Math.floor((streak - 2) / 2) * 50)
 *
 * @param streak - Current streak count (1 = first claim or reset)
 * @param isFirstEverClaim - Whether this is the user's very first claim
 */
export function calculateDailyClaimAmount(streak: number, isFirstEverClaim: boolean = false): number {
  // First ever login gets 500 credits
  if (isFirstEverClaim) {
    return FIRST_LOGIN_BONUS;
  }

  // Ensure minimum streak of 1
  const currentStreak = Math.max(1, streak);

  // Streak 1-3: base 100 credits
  if (currentStreak <= 3) {
    return BASE_DAILY_CREDITS;
  }

  // Day 4+: Apply streak bonus
  // Formula: 100 + (Math.floor((streak - 2) / 2) * 50)
  const bonusMultiplier = Math.floor((currentStreak - 2) / STREAK_BONUS_INTERVAL);
  return BASE_DAILY_CREDITS + (bonusMultiplier * STREAK_BONUS_INCREMENT);
}

/**
 * Get UTC reset time (00:00 UTC) timestamp for a given date
 */
function getUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

/**
 * Get the next claim time based on last claim date
 * - If lastClaimDate is null: return current time (immediately available)
 * - If claim is available (different reset period): return current time (immediately available)
 * - If claim is NOT available (same reset period): return next reset time (00:00 UTC)
 */
export function getNextClaimTime(lastClaimDate: Date | null): Date {
  const now = new Date();

  // First-time user - claim is immediately available
  if (!lastClaimDate) {
    return now;
  }

  // Check if claim is available (different reset period)
  if (isClaimAvailable(lastClaimDate)) {
    return now;
  }

  // Already claimed - calculate next reset time (00:00 UTC)
  const todayResetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  // If current time is before today's reset time, return today's reset time
  if (now.getTime() < todayResetTime.getTime()) {
    return todayResetTime;
  }

  // Otherwise return tomorrow's reset time
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/**
 * Check if a claim is available (it's a different UTC day from last claim)
 * Matches backend logic exactly
 *
 * This compares UTC days, not time intervals:
 * - If last claim was on Dec 15, and now is Dec 16 (any time), claim is available
 * - If last claim was Dec 16 11:59 PM and now is Dec 17 00:00 AM, claim is available
 */
export function isClaimAvailable(lastClaimDate: Date | null): boolean {
  if (!lastClaimDate) return true;

  const now = new Date();
  const lastClaim = new Date(lastClaimDate);

  // Compare UTC days - if they're different, claim is available
  const nowMidnight = getUtcMidnight(now);
  const lastClaimMidnight = getUtcMidnight(lastClaim);

  return nowMidnight !== lastClaimMidnight;
}

/**
 * Calculate new streak after a successful claim
 * If claim is made on a new UTC day, check if consecutive
 * If claim is made on the same UTC day, return current streak
 */
export function calculateNewStreak(
  currentStreak: number,
  lastClaimDate: Date | null
): number {
  if (isClaimAvailable(lastClaimDate)) {
    // Check if last claim was yesterday (consecutive day)
    if (lastClaimDate) {
      const now = new Date();
      const lastClaim = new Date(lastClaimDate);

      const MS_IN_DAY = 24 * 60 * 60 * 1000;
      const nowMidnight = getUtcMidnight(now);
      const lastClaimMidnight = getUtcMidnight(lastClaim);

      // Calculate days difference using UTC midnights
      const daysDiff = Math.floor((nowMidnight - lastClaimMidnight) / MS_IN_DAY);

      if (daysDiff === 1) {
        // Consecutive day - increment streak
        return currentStreak + 1;
      } else if (daysDiff > 1) {
        // Streak broken - reset to 1
        return 1;
      }
    }
    // First claim ever
    return 1;
  }

  // Same day claim - no streak change
  return currentStreak;
}

/**
 * Get credit claim information
 * Note: dailyClaimAmount is calculated based on what the user WILL receive
 * (the next streak value after claiming), matching backend behavior
 */
export function getCreditClaimInfo(
  streak: number,
  lastClaimDate: Date | null
): CreditClaimInfo {
  const claimAvailable = isClaimAvailable(lastClaimDate);
  const nextClaimAvailable = getNextClaimTime(lastClaimDate);
  const isFirstEverClaim = !lastClaimDate;

  // Calculate the streak that will be used when claiming (matches backend logic)
  // Backend calculates consecutiveDays BEFORE awarding credits
  const nextStreak = claimAvailable ? calculateNewStreak(streak, lastClaimDate) : streak;
  const dailyClaimAmount = calculateDailyClaimAmount(nextStreak, isFirstEverClaim);

  return {
    dailyClaimAmount,
    streak,
    nextClaimAvailable,
    isClaimAvailable: claimAvailable,
    isFirstEverClaim,
  };
}
