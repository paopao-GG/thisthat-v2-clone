import { checkAndResolveMarkets } from '../features/market-resolution/market-resolution.services.js';
import { runJobWithLock } from './job-runner.js';

let intervalId: NodeJS.Timeout | null = null;
const isRunningRef = { value: false };

/**
 * Run market resolution with distributed lock
 */
async function runResolution(label: string) {
  return runJobWithLock(
    'Market Resolution Job',
    'job:market-resolution',
    isRunningRef,
    async () => {
      const result = await checkAndResolveMarkets();
      console.log(
        `[Market Resolution Job] Completed ${label}: ${result.checked} checked, ${result.resolved} resolved, ${result.errors} errors`
      );
      return result;
    },
    label
  );
}

/**
 * Start the market resolution job
 * Runs every 1 minute to check for resolved markets
 */
export function startMarketResolutionJob() {
  if (intervalId) {
    console.log('⚠️  Market resolution job already running');
    return;
  }

  console.log('✅ Starting market resolution job (runs every 1 minute)');

  // Run immediately on start
  runResolution('startup').catch((error) => {
    console.error('❌ Error in market resolution job:', error);
  });

  // Then run every 1 minute
  intervalId = setInterval(() => {
    runResolution('scheduled').catch((error) => {
      console.error('❌ Error in market resolution job:', error);
    });
  }, 60 * 1000); // 1 minute
}

/**
 * Stop the market resolution job
 */
export function stopMarketResolutionJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Market resolution job stopped');
  }
}




