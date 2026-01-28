/**
 * Market Sync Job
 * Syncs markets from MongoDB to PostgreSQL every 5 minutes
 */

import * as syncService from '../features/sync/mongodb-to-postgres.sync.js';

let jobInterval: NodeJS.Timeout | null = null;

/**
 * Sync active markets from MongoDB to PostgreSQL
 */
async function syncActiveMarkets() {
  try {
    console.log('[Market Sync Job] Starting market sync...');
    
    const result = await syncService.syncActiveMarketsToPostgres();
    
    console.log(`[Market Sync Job] Completed: ${result.synced} synced, ${result.errors} errors, ${result.skipped} skipped`);
  } catch (error: any) {
    console.error('[Market Sync Job] Fatal error:', error);
  }
}

/**
 * Start the market sync job scheduler
 * Runs every 5 minutes
 */
export function startMarketSyncJob() {
  if (jobInterval) {
    console.log('[Market Sync Job] Job already running');
    return;
  }

  console.log('[Market Sync Job] Starting scheduler...');
  
  // Run immediately on start
  syncActiveMarkets();
  
  // Then run every 5 minutes
  jobInterval = setInterval(() => {
    syncActiveMarkets();
  }, 5 * 60 * 1000); // 5 minutes

  console.log('[Market Sync Job] Scheduler started (runs every 5 minutes)');
}

/**
 * Stop the market sync job scheduler
 */
export function stopMarketSyncJob() {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.log('[Market Sync Job] Scheduler stopped');
  }
}

