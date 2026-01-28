/**
 * Daily Credit Allocation Job
 * Runs every midnight (00:00 UTC) via cron, plus once on boot for fast feedback
 */

import cron from 'node-cron';
import { prisma } from '../lib/database.js';
import * as economyService from '../features/economy/economy.services.js';

let cronTask: cron.ScheduledTask | null = null;

/**
 * Process daily credits for all eligible users
 */
async function processDailyCreditsForAllUsers() {
  try {
    console.log('[Daily Credits Job] Starting daily credit allocation...');
    
    const now = new Date();
    const currentMidnightUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { lastDailyRewardAt: null }, // Never claimed
          { lastDailyRewardAt: { lt: currentMidnightUtc } }, // Not yet processed for the new UTC day
        ],
      },
    });

    console.log(`[Daily Credits Job] Found ${users.length} eligible users`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        await economyService.processDailyCreditAllocation(user.id);
        successCount++;
      } catch (error: any) {
        console.error(`[Daily Credits Job] Error processing user ${user.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[Daily Credits Job] Completed: ${successCount} successful, ${errorCount} errors`);
  } catch (error: any) {
    console.error('[Daily Credits Job] Fatal error:', error);
  }
}

/**
 * Start the daily credits job scheduler
 */
export function startDailyCreditsJob() {
  if (cronTask) {
    console.log('[Daily Credits Job] Job already running');
    return;
  }

  console.log('[Daily Credits Job] Starting scheduler (CRON 0 0 * * * UTC)...');

  // Run immediately on boot so devs don't wait until midnight
  processDailyCreditsForAllUsers();

  cronTask = cron.schedule(
    '0 0 * * *',
    () => {
      processDailyCreditsForAllUsers();
    },
    {
      timezone: 'UTC',
    }
  );

  console.log('[Daily Credits Job] Scheduler started (runs nightly at 00:00 UTC)');
}

/**
 * Stop the daily credits job scheduler
 */
export function stopDailyCreditsJob() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('[Daily Credits Job] Scheduler stopped');
  }
}

