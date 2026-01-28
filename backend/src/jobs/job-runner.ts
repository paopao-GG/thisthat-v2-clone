import { withLock } from '../lib/distributed-lock.js';

export async function runJobWithLock<T>(
  jobName: string,
  lockKey: string,
  isRunningRef: { value: boolean },
  jobFn: () => Promise<T>,
  label: string
): Promise<T | null> {
  if (isRunningRef.value) {
    console.log(`[${jobName}] Skipping ${label} run (already in progress)`);
    return null;
  }

  const result = await withLock(
    lockKey,
    async () => {
      isRunningRef.value = true;
      try {
        console.log(`[${jobName}] Starting ${label} run...`);
        return await jobFn();
      } catch (error: any) {
        console.error(`[${jobName}] Fatal error:`, error?.message || error);
        if (error?.stack) {
          console.error(`[${jobName}] Stack trace:`, error.stack);
        }
        throw error;
      } finally {
        isRunningRef.value = false;
      }
    },
    { ttlMs: 600000, maxRetries: 0 } // 10 minute lock, don't retry
  );

  if (result === null) {
    console.log(`[${jobName}] Skipped ${label} run (another worker is processing)`);
  }

  return result;
}
