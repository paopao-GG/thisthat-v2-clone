/**
 * Market Ingestion Job
 * Periodically ingests fresh Polymarket markets directly into PostgreSQL.
 */

import cron from 'node-cron';
import { ingestMarketsFromPolymarket, updateMarketImagesFromEvents } from '../services/market-ingestion.service.js';
import { runJobWithLock } from './job-runner.js';

let ingestionTask: cron.ScheduledTask | null = null;
const isRunningRef = { value: false };

async function runIngestion(label: string) {
  return runJobWithLock(
    'Market Ingestion Job',
    'job:market-ingestion',
    isRunningRef,
    async () => {
      const result = await ingestMarketsFromPolymarket({
        limit: Number(process.env.MARKET_INGEST_LIMIT) || 1000,
        activeOnly: true,
      });
      console.log(
        `[Market Ingestion Job] Completed ${label}: ${result.created} created, ${result.updated} updated, ${result.errors} errors`
      );

      // Update market images from events
      console.log('[Market Ingestion Job] Updating market images from events...');
      const imageResult = await updateMarketImagesFromEvents();
      console.log(
        `[Market Ingestion Job] Image update complete: ${imageResult.marketsUpdated} markets updated`
      );

      return result;
    },
    label
  );
}

export function startMarketIngestionJob() {
  if (ingestionTask) {
    console.log('[Market Ingestion Job] Scheduler already running');
    return;
  }

  try {
    const cronExpression = process.env.MARKET_INGEST_CRON || '*/5 * * * *';
    ingestionTask = cron.schedule(cronExpression, () => runIngestion('scheduled'), {
      scheduled: true,
      timezone: 'UTC',
    });

    console.log(`[Market Ingestion Job] Scheduler started (cron: ${cronExpression}, timezone: UTC)`);
    // Kick off an immediate run so we have fresh data as soon as the server boots
    console.log('[Market Ingestion Job] Triggering startup ingestion...');
    runIngestion('startup').catch((error) => {
      console.error('[Market Ingestion Job] Startup run failed:', error?.message || error);
      if (error?.stack) {
        console.error('[Market Ingestion Job] Stack trace:', error.stack);
      }
    });
  } catch (error: any) {
    console.error('[Market Ingestion Job] Failed to start scheduler:', error?.message || error);
    if (error?.stack) {
      console.error('[Market Ingestion Job] Stack trace:', error.stack);
    }
  }
}

export function stopMarketIngestionJob() {
  if (ingestionTask) {
    ingestionTask.stop();
    ingestionTask = null;
    console.log('[Market Ingestion Job] Scheduler stopped');
  }
}


