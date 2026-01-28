// backend/src/lib/distributed-lock.ts
import redis from './redis.js';

// Generate unique worker ID for lock ownership
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

export interface DistributedLockOptions {
  ttlMs?: number; // Lock expiration time (prevents stuck locks)
  retryDelayMs?: number; // Delay between retry attempts
  maxRetries?: number; // Maximum number of retry attempts
}

const DEFAULT_OPTIONS: Required<DistributedLockOptions> = {
  ttlMs: 300000, // 5 minutes default TTL
  retryDelayMs: 1000, // 1 second between retries
  maxRetries: 0, // Don't retry by default
};

/**
 * Acquire a distributed lock using Redis
 * Returns true if lock acquired, false if already locked or Redis unavailable
 */
export async function acquireLock(
  lockKey: string,
  options: DistributedLockOptions = {}
): Promise<boolean> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Check if Redis is connected
  if (!redis.isOpen) {
    console.warn(`[DistributedLock] Redis not connected, cannot acquire lock ${lockKey}`);
    return false;
  }

  try {
    // SET key value NX PX milliseconds
    // NX: Only set if key doesn't exist
    // PX: Set expiry in milliseconds
    const result = await redis.set(lockKey, WORKER_ID, {
      NX: true,
      PX: config.ttlMs,
    });

    return result === 'OK';
  } catch (error) {
    console.error(`[DistributedLock] Error acquiring lock ${lockKey}:`, error);
    return false;
  }
}

/**
 * Release a distributed lock
 */
export async function releaseLock(lockKey: string): Promise<void> {
  // Check if Redis is connected
  if (!redis.isOpen) {
    console.warn(`[DistributedLock] Redis not connected, cannot release lock ${lockKey}`);
    return;
  }

  try {
    // Use Lua script for atomic compare-and-delete (only delete if we own the lock)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, {
      keys: [lockKey],
      arguments: [WORKER_ID],
    }) as number;

    if (result === 0) {
      console.warn(`[DistributedLock] Lock ${lockKey} not owned by this worker, skipping release`);
    }
  } catch (error) {
    console.error(`[DistributedLock] Error releasing lock ${lockKey}:`, error);
  }
}

/**
 * Acquire lock with retries
 */
export async function acquireLockWithRetry(
  lockKey: string,
  options: DistributedLockOptions = {}
): Promise<boolean> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const acquired = await acquireLock(lockKey, { ttlMs: config.ttlMs });

    if (acquired) {
      return true;
    }

    // If not the last attempt, wait before retrying
    if (attempt < config.maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs));
    }
  }

  return false;
}

/**
 * Execute a function with a distributed lock
 * Automatically acquires and releases the lock
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: DistributedLockOptions = {}
): Promise<T | null> {
  const acquired = await acquireLockWithRetry(lockKey, options);

  if (!acquired) {
    console.warn(`[DistributedLock] Failed to acquire lock: ${lockKey}`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(lockKey);
  }
}
