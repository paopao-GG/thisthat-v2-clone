/**
 * Unit tests for Credit System Utilities
 * Tests daily claim calculations, streak management, and UTC reset logic
 *
 * P3 - Beta Phase Structure:
 * - Day 1: 500 credits (first login/signup bonus ONLY)
 * - Day 2-3: 100 credits (base daily reward)
 * - Day 4-5: 150 credits (+50 after 2-day streak)
 * - Day 6-7: 200 credits (+50 after another 2-day streak)
 * - ... continues: +50 every 2 days
 * - Streak reset: back to 100 credits
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateDailyClaimAmount,
  getNextClaimTime,
  isClaimAvailable,
  getCreditClaimInfo,
  calculateNewStreak,
} from '../creditSystem';

describe('Credit System Utilities (P3 - Beta Phase)', () => {
  // Mock Date.now() for consistent testing
  const mockDate = (dateString: string) => {
    const date = new Date(dateString);
    vi.setSystemTime(date);
    return date;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateDailyClaimAmount', () => {
    describe('First ever claim (signup bonus)', () => {
      it('should return 500 for first ever claim', () => {
        expect(calculateDailyClaimAmount(1, true)).toBe(500);
        expect(calculateDailyClaimAmount(0, true)).toBe(500);
      });
    });

    describe('Regular daily claims (not first ever)', () => {
      it('should return 100 for streak 0 or negative (streak reset)', () => {
        expect(calculateDailyClaimAmount(0, false)).toBe(100);
        expect(calculateDailyClaimAmount(-1, false)).toBe(100);
      });

      it('should return 100 for streak 1 (streak reset)', () => {
        expect(calculateDailyClaimAmount(1, false)).toBe(100);
      });

      it('should return 100 for streak 2 (day 2)', () => {
        expect(calculateDailyClaimAmount(2, false)).toBe(100);
      });

      it('should return 100 for streak 3 (day 3)', () => {
        expect(calculateDailyClaimAmount(3, false)).toBe(100);
      });

      it('should return 150 for streak 4 (first bonus tier)', () => {
        expect(calculateDailyClaimAmount(4, false)).toBe(150);
      });

      it('should return 150 for streak 5', () => {
        expect(calculateDailyClaimAmount(5, false)).toBe(150);
      });

      it('should return 200 for streak 6-7', () => {
        expect(calculateDailyClaimAmount(6, false)).toBe(200);
        expect(calculateDailyClaimAmount(7, false)).toBe(200);
      });

      it('should return 250 for streak 8-9', () => {
        expect(calculateDailyClaimAmount(8, false)).toBe(250);
        expect(calculateDailyClaimAmount(9, false)).toBe(250);
      });

      it('should follow the formula: 100 + (Math.floor((streak - 2) / 2) * 50) for streak 4+', () => {
        // Day 4-5: 100 + floor((4-2)/2)*50 = 100 + 1*50 = 150
        expect(calculateDailyClaimAmount(4, false)).toBe(150);
        expect(calculateDailyClaimAmount(5, false)).toBe(150);
        // Day 6-7: 100 + floor((6-2)/2)*50 = 100 + 2*50 = 200
        expect(calculateDailyClaimAmount(6, false)).toBe(200);
        expect(calculateDailyClaimAmount(7, false)).toBe(200);
        // Day 8-9: 100 + floor((8-2)/2)*50 = 100 + 3*50 = 250
        expect(calculateDailyClaimAmount(8, false)).toBe(250);
        expect(calculateDailyClaimAmount(9, false)).toBe(250);
        // Day 10-11: 100 + floor((10-2)/2)*50 = 100 + 4*50 = 300
        expect(calculateDailyClaimAmount(10, false)).toBe(300);
        expect(calculateDailyClaimAmount(11, false)).toBe(300);
      });

      it('should continue increasing for higher streaks', () => {
        // Day 20-21: 100 + floor((20-2)/2)*50 = 100 + 9*50 = 550
        expect(calculateDailyClaimAmount(20, false)).toBe(550);
        // Day 30-31: 100 + floor((30-2)/2)*50 = 100 + 14*50 = 800
        expect(calculateDailyClaimAmount(30, false)).toBe(800);
      });
    });
  });

  describe('isClaimAvailable', () => {
    it('should return true if lastClaimDate is null (first-time user)', () => {
      expect(isClaimAvailable(null)).toBe(true);
    });

    it('should return true if last claim was on a different UTC day', () => {
      const lastClaim = new Date('2024-12-15T23:59:59Z');
      mockDate('2024-12-16T00:00:00Z');
      expect(isClaimAvailable(lastClaim)).toBe(true);
    });

    it('should return false if last claim was on the same UTC day', () => {
      const lastClaim = new Date('2024-12-16T10:00:00Z');
      mockDate('2024-12-16T15:00:00Z');
      expect(isClaimAvailable(lastClaim)).toBe(false);
    });

    it('should return false if last claim was at midnight UTC today', () => {
      const lastClaim = new Date('2024-12-16T00:00:00Z');
      mockDate('2024-12-16T12:00:00Z');
      expect(isClaimAvailable(lastClaim)).toBe(false);
    });

    it('should return true if last claim was yesterday at 23:59 UTC and now is today 00:00 UTC', () => {
      const lastClaim = new Date('2024-12-15T23:59:59Z');
      mockDate('2024-12-16T00:00:01Z');
      expect(isClaimAvailable(lastClaim)).toBe(true);
    });

    it('should handle timezone differences correctly (uses UTC)', () => {
      const lastClaim = new Date('2024-12-16T00:00:00Z');
      mockDate('2024-12-16T07:59:59Z');
      expect(isClaimAvailable(lastClaim)).toBe(false);

      mockDate('2024-12-16T16:00:00Z');
      expect(isClaimAvailable(lastClaim)).toBe(false);

      mockDate('2024-12-17T00:00:00Z');
      expect(isClaimAvailable(lastClaim)).toBe(true);
    });
  });

  describe('getNextClaimTime', () => {
    it('should return current time if lastClaimDate is null (first-time user)', () => {
      const now = mockDate('2024-12-16T12:00:00Z');
      const result = getNextClaimTime(null);
      expect(result.getTime()).toBe(now.getTime());
    });

    it('should return current time if claim is available (different UTC day)', () => {
      const lastClaim = new Date('2024-12-15T10:00:00Z');
      const now = mockDate('2024-12-16T12:00:00Z');
      const result = getNextClaimTime(lastClaim);
      expect(result.getTime()).toBe(now.getTime());
    });

    it('should return tomorrow\'s reset time if already claimed today', () => {
      const lastClaim = new Date('2024-12-16T00:00:00Z');
      mockDate('2024-12-16T00:30:00Z');
      const result = getNextClaimTime(lastClaim);
      const expectedReset = new Date('2024-12-17T00:00:00Z');
      expect(result.getTime()).toBe(expectedReset.getTime());
    });

    it('should return tomorrow\'s reset time at midnight UTC', () => {
      const lastClaim = new Date('2024-12-16T12:00:00Z');
      mockDate('2024-12-16T18:00:00Z');
      const result = getNextClaimTime(lastClaim);

      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(11);
      expect(result.getUTCDate()).toBe(17);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });
  });

  describe('getCreditClaimInfo', () => {
    it('should return correct info for first-time user (500 signup bonus)', () => {
      mockDate('2024-12-16T12:00:00Z');
      const result = getCreditClaimInfo(0, null);

      expect(result.dailyClaimAmount).toBe(500); // First ever claim = 500
      expect(result.streak).toBe(0);
      expect(result.isClaimAvailable).toBe(true);
      expect(result.isFirstEverClaim).toBe(true);
      expect(result.nextClaimAvailable).toBeInstanceOf(Date);
    });

    it('should return correct info for user with streak 1 (after first claim)', () => {
      mockDate('2024-12-16T12:00:00Z');
      const lastClaim = new Date('2024-12-15T10:00:00Z');
      const result = getCreditClaimInfo(1, lastClaim);

      expect(result.dailyClaimAmount).toBe(100); // Not first ever, streak 2 = 100
      expect(result.streak).toBe(1);
      expect(result.isClaimAvailable).toBe(true);
      expect(result.isFirstEverClaim).toBe(false);
    });

    it('should return correct info for user with streak 5', () => {
      mockDate('2024-12-16T12:00:00Z');
      const lastClaim = new Date('2024-12-15T10:00:00Z');
      const result = getCreditClaimInfo(5, lastClaim);

      expect(result.dailyClaimAmount).toBe(200); // Streak 6 = 200
      expect(result.streak).toBe(5);
      expect(result.isClaimAvailable).toBe(true);
      expect(result.isFirstEverClaim).toBe(false);
    });

    it('should return isClaimAvailable false if already claimed today', () => {
      mockDate('2024-12-16T15:00:00Z');
      const lastClaim = new Date('2024-12-16T10:00:00Z');
      const result = getCreditClaimInfo(5, lastClaim);

      expect(result.isClaimAvailable).toBe(false);
      expect(result.nextClaimAvailable.getTime()).toBeGreaterThan(new Date().getTime());
    });

    it('should return correct nextClaimAvailable time when not available', () => {
      mockDate('2024-12-16T15:00:00Z');
      const lastClaim = new Date('2024-12-16T10:00:00Z');
      const result = getCreditClaimInfo(5, lastClaim);

      const expectedNext = new Date('2024-12-17T00:00:00Z');
      expect(result.nextClaimAvailable.getTime()).toBe(expectedNext.getTime());
    });
  });

  describe('calculateNewStreak', () => {
    it('should return 1 for first claim ever (lastClaimDate is null)', () => {
      expect(calculateNewStreak(0, null)).toBe(1);
      expect(calculateNewStreak(5, null)).toBe(1);
    });

    it('should return current streak if claim is not available (same day)', () => {
      const lastClaim = new Date('2024-12-16T10:00:00Z');
      mockDate('2024-12-16T15:00:00Z');

      expect(calculateNewStreak(5, lastClaim)).toBe(5);
      expect(calculateNewStreak(10, lastClaim)).toBe(10);
    });

    it('should increment streak by 1 if last claim was yesterday (consecutive day)', () => {
      const lastClaim = new Date('2024-12-15T10:00:00Z');
      mockDate('2024-12-16T12:00:00Z');

      expect(calculateNewStreak(1, lastClaim)).toBe(2);
      expect(calculateNewStreak(5, lastClaim)).toBe(6);
      expect(calculateNewStreak(17, lastClaim)).toBe(18);
    });

    it('should reset streak to 1 if last claim was more than 1 day ago (streak broken)', () => {
      const lastClaim = new Date('2024-12-14T10:00:00Z');
      mockDate('2024-12-16T12:00:00Z');

      expect(calculateNewStreak(5, lastClaim)).toBe(1);
      expect(calculateNewStreak(10, lastClaim)).toBe(1);
    });

    it('should handle edge case: last claim at 23:59 UTC, current at 00:00 UTC next day', () => {
      const lastClaim = new Date('2024-12-15T23:59:59Z');
      mockDate('2024-12-16T00:00:01Z');

      expect(calculateNewStreak(5, lastClaim)).toBe(6);
    });

    it('should handle edge case: last claim at 00:00 UTC, current at 23:59 UTC same day', () => {
      const lastClaim = new Date('2024-12-16T00:00:00Z');
      mockDate('2024-12-16T23:59:59Z');

      expect(calculateNewStreak(5, lastClaim)).toBe(5);
    });
  });

  describe('Integration Tests', () => {
    it('should work correctly for a complete daily claim cycle (P3 structure)', () => {
      // Day 1: First claim - 500 credits (signup bonus)
      mockDate('2024-12-15T12:00:00Z');
      let info = getCreditClaimInfo(0, null);
      expect(info.isClaimAvailable).toBe(true);
      expect(info.dailyClaimAmount).toBe(500); // First ever claim
      expect(info.isFirstEverClaim).toBe(true);

      let newStreak = calculateNewStreak(0, null);
      expect(newStreak).toBe(1);

      // Day 2: Second claim (consecutive) - 100 credits
      mockDate('2024-12-16T12:00:00Z');
      const lastClaim1 = new Date('2024-12-15T12:00:00Z');
      info = getCreditClaimInfo(newStreak, lastClaim1);
      expect(info.isClaimAvailable).toBe(true);
      expect(info.dailyClaimAmount).toBe(100); // Streak 2 = 100
      expect(info.isFirstEverClaim).toBe(false);

      newStreak = calculateNewStreak(newStreak, lastClaim1);
      expect(newStreak).toBe(2);

      // Day 3: Third claim (consecutive) - 100 credits
      mockDate('2024-12-17T12:00:00Z');
      const lastClaim2 = new Date('2024-12-16T12:00:00Z');
      info = getCreditClaimInfo(newStreak, lastClaim2);
      expect(info.dailyClaimAmount).toBe(100); // Streak 3 = 100

      newStreak = calculateNewStreak(newStreak, lastClaim2);
      expect(newStreak).toBe(3);

      // Day 4: Fourth claim (consecutive) - 150 credits (first bonus!)
      mockDate('2024-12-18T12:00:00Z');
      const lastClaim3 = new Date('2024-12-17T12:00:00Z');
      info = getCreditClaimInfo(newStreak, lastClaim3);
      expect(info.dailyClaimAmount).toBe(150); // Streak 4 = 150

      newStreak = calculateNewStreak(newStreak, lastClaim3);
      expect(newStreak).toBe(4);
    });

    it('should handle streak break correctly (reset to 100 credits)', () => {
      // Day 1-5: Building streak
      mockDate('2024-12-15T12:00:00Z');
      let streak = 1;
      let lastClaim = new Date('2024-12-14T12:00:00Z');

      for (let day = 15; day <= 19; day++) {
        mockDate(`2024-12-${day}T12:00:00Z`);
        lastClaim = new Date(`2024-12-${day - 1}T12:00:00Z`);
        streak = calculateNewStreak(streak, lastClaim);
      }
      expect(streak).toBe(6); // Streak of 6 days

      // Miss a day (streak broken)
      mockDate('2024-12-21T12:00:00Z'); // 2 days later
      lastClaim = new Date('2024-12-19T12:00:00Z');
      streak = calculateNewStreak(streak, lastClaim);
      expect(streak).toBe(1); // Reset to 1

      // Next claim should be 100 credits (not 500, since it's not first ever)
      const info = getCreditClaimInfo(streak, lastClaim);
      expect(info.dailyClaimAmount).toBe(100); // Streak reset = 100
      expect(info.isFirstEverClaim).toBe(false);
    });

    it('should calculate credits correctly for various streak levels', () => {
      mockDate('2024-12-16T12:00:00Z');
      const lastClaim = new Date('2024-12-15T12:00:00Z');

      // Streak 4 → next streak 5 → 150 credits
      let info = getCreditClaimInfo(4, lastClaim);
      expect(info.dailyClaimAmount).toBe(150);

      // Streak 6 → next streak 7 → 200 credits
      info = getCreditClaimInfo(6, lastClaim);
      expect(info.dailyClaimAmount).toBe(200);

      // Streak 10 → next streak 11 → 300 credits
      info = getCreditClaimInfo(10, lastClaim);
      expect(info.dailyClaimAmount).toBe(300);
    });
  });
});
