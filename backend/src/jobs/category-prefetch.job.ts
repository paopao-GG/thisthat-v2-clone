/**
 * Category Prefetch Job
 *
 * Intelligent prefetching system that monitors category levels and automatically
 * fetches markets when categories are running low.
 *
 * Features:
 * - Runs every 5 minutes to check category levels
 * - Prefetches 1000 markets per category when below minimum threshold
 * - Respects maximum limit of 10,000 markets per category
 * - Prevents concurrent runs
 * - Logs detailed statistics
 */

import cron from 'node-cron';
import {
  getAllCategoryStats as getOriginalCategoryStats,
  getCategoriesNeedingPrefetch,
  calculatePrefetchAmount,
  getSystemStats,
  CATEGORIES,
} from '../services/category-monitor.service.js';
import {
  enqueuePrefetchTask,
  startPrefetchQueueWorker,
  stopPrefetchQueueWorker,
  waitForPrefetchTasks,
} from '../services/prefetch-queue.service.js';
// NEW: Import enhanced category monitor
import { monitorAndRefillCategories, getAllCategoryStats as getEnhancedCategoryStats } from '../services/category-monitor-enhanced.service.js';
import { runJobWithLock } from './job-runner.js';

let prefetchTask: cron.ScheduledTask | null = null;
const isRunningRef = { value: false };

/**
 * Run prefetch for categories that need it
 * NEW: Uses enhanced category monitor with smart refill logic
 */
async function runCategoryPrefetch(label: string, options?: { awaitCompletion?: boolean; useEnhanced?: boolean }) {
  return runJobWithLock(
    'Category Prefetch Job',
    'job:category-prefetch',
    isRunningRef,
    async () => {
      const startTime = Date.now();

      console.log(`\n[Category Prefetch Job] ========== ${label.toUpperCase()} RUN ==========`);
      console.log(`[Category Prefetch Job] Using enhanced category monitor`);

      // Get enhanced stats to display status
      const enhancedStats = await getEnhancedCategoryStats();
      console.log(`\n[Category Prefetch Job] Category Status:`);
      enhancedStats.forEach((stat) => {
        const status = stat.isBackedOff
          ? '⏸️  BACKED OFF'
          : stat.needsRefill
          ? '🔴 NEEDS REFILL'
          : '🟢 HEALTHY';
        const backoffInfo = stat.isBackedOff ? ` (${stat.backoffDays} days)` : '';
        console.log(
          `  ${status} ${stat.category.padEnd(15)} ${stat.count.toString().padStart(5)} markets${backoffInfo}`
        );
      });

      // Run enhanced monitor (handles refilling automatically)
      await monitorAndRefillCategories();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n[Category Prefetch Job] ========== SUMMARY ==========`);
      console.log(`  - Duration: ${duration}s`);
      console.log(`[Category Prefetch Job] ========== COMPLETE ==========\n`);

      return { success: true, duration };
    },
    label
  );
}

/**
 * Start the category prefetch job
 */
export function startCategoryPrefetchJob() {
  if (prefetchTask) {
    console.log('[Category Prefetch Job] Scheduler already running');
    return;
  }

  try {
    startPrefetchQueueWorker();
    // Run every 5 minutes
    const cronExpression = process.env.CATEGORY_PREFETCH_CRON || '*/5 * * * *';
    prefetchTask = cron.schedule(cronExpression, () => runCategoryPrefetch('scheduled'), {
      scheduled: true,
      timezone: 'UTC',
    });

    console.log(
      `[Category Prefetch Job] ✅ Scheduler started (cron: ${cronExpression}, timezone: UTC)`
    );
    console.log(
      `[Category Prefetch Job] Will check categories every 5 minutes and prefetch when needed`
    );

    // Run immediately on startup
    console.log('[Category Prefetch Job] Triggering startup check...');
    runCategoryPrefetch('startup').catch((error) => {
      console.error('[Category Prefetch Job] Startup run failed:', error?.message || error);
    });
  } catch (error: any) {
    console.error('[Category Prefetch Job] Failed to start scheduler:', error?.message || error);
    if (error?.stack) {
      console.error('[Category Prefetch Job] Stack trace:', error.stack);
    }
  }
}

/**
 * Stop the category prefetch job
 */
export function stopCategoryPrefetchJob() {
  if (prefetchTask) {
    prefetchTask.stop();
    prefetchTask = null;
    console.log('[Category Prefetch Job] Scheduler stopped');
  }
  stopPrefetchQueueWorker();
}

/**
 * Manually trigger prefetch (for testing/admin use)
 */
export async function triggerManualPrefetch(): Promise<void> {
  await runCategoryPrefetch('manual', { awaitCompletion: true });
}
