/**
 * Prefetch Queue Service
 *
 * Lightweight message queue (Redis-backed with in-memory fallback) that
 * executes category prefetch tasks with automatic retries and dead-letter
 * handling. This ensures each category is continuously replenished even when
 * Polymarket or network conditions are unreliable.
 */

import { randomUUID } from 'node:crypto';
import redis from '../lib/redis.js';
import { prefetchCategoryMarkets } from './category-prefetch.service.js';

const PREFETCH_QUEUE_KEY = 'queue:prefetch:v1';
const PREFETCH_DLQ_KEY = 'queue:prefetch:dead-letter:v1';
const MAX_ATTEMPTS = Number(process.env.PREFETCH_QUEUE_MAX_ATTEMPTS) || 3;
const BASE_RETRY_DELAY_MS = Number(process.env.PREFETCH_QUEUE_RETRY_BASE_MS) || 30_000;
const RETRY_BACKOFF_MULTIPLIER = Number(process.env.PREFETCH_QUEUE_RETRY_BACKOFF_MULTIPLIER) || 2;
const WORKER_POLL_INTERVAL_MS = Number(process.env.PREFETCH_QUEUE_POLL_INTERVAL_MS) || 1_000;
const WORKER_CONCURRENCY = Math.max(1, Number(process.env.PREFETCH_QUEUE_CONCURRENCY) || 1);
const MANUAL_TIMEOUT_MS = Number(process.env.PREFETCH_QUEUE_MANUAL_TIMEOUT_MS) || 180_000;

interface PrefetchTask {
  id: string;
  category: string;
  amountToFetch: number;
  attempt: number;
  maxAttempts: number;
  enqueuedAt: string;
  reason?: string;
  lastError?: string | null;
}

export interface PrefetchTaskResult {
  id: string;
  category: string;
  status: 'completed' | 'failed';
  attempts: number;
  completedAt: string;
  error?: string;
}

interface EnqueueOptions {
  reason?: string;
  maxAttempts?: number;
  initialAttempt?: number;
  taskId?: string;
  delayMs?: number;
}

const inMemoryQueue: PrefetchTask[] = [];
const runningTasks = new Set<Promise<void>>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();
const taskListeners = new Map<string, Array<(result: PrefetchTaskResult) => void>>();
const taskResults = new Map<string, PrefetchTaskResult>();

let workerTimer: NodeJS.Timeout | null = null;
let isWorkerRunning = false;
let processingTick = false;

function log(message: string, ...args: any[]) {
  console.log(`[Prefetch Queue] ${message}`, ...args);
}

function warn(message: string, ...args: any[]) {
  console.warn(`[Prefetch Queue] ${message}`, ...args);
}

function error(message: string, ...args: any[]) {
  console.error(`[Prefetch Queue] ${message}`, ...args);
}

async function pushTask(task: PrefetchTask): Promise<void> {
  if (redis.isOpen) {
    try {
      await redis.rPush(PREFETCH_QUEUE_KEY, JSON.stringify(task));
      return;
    } catch (err: any) {
      warn(`Redis push failed (${err?.message}). Falling back to in-memory queue.`);
    }
  }
  inMemoryQueue.push(task);
}

async function popTask(): Promise<PrefetchTask | null> {
  if (redis.isOpen) {
    try {
      const payload = await redis.lPop(PREFETCH_QUEUE_KEY);
      if (payload) {
        return JSON.parse(payload) as PrefetchTask;
      }
    } catch (err: any) {
      warn(`Redis pop failed (${err?.message}). Falling back to in-memory queue.`);
    }
  }
  return inMemoryQueue.shift() ?? null;
}

function scheduleResultCleanup(taskId: string) {
  setTimeout(() => {
    taskResults.delete(taskId);
  }, 10 * 60 * 1000).unref?.();
}

function notifyTaskResult(result: PrefetchTaskResult) {
  taskResults.set(result.id, result);
  const listeners = taskListeners.get(result.id);
  if (listeners) {
    listeners.forEach((listener) => {
      try {
        listener(result);
      } catch (err) {
        error(`Listener for task ${result.id} threw an error:`, err);
      }
    });
    taskListeners.delete(result.id);
  }
  scheduleResultCleanup(result.id);
}

function addTaskListener(taskId: string, listener: (result: PrefetchTaskResult) => void) {
  const listeners = taskListeners.get(taskId) || [];
  listeners.push(listener);
  taskListeners.set(taskId, listeners);
}

function removeTaskListener(taskId: string, listener: (result: PrefetchTaskResult) => void) {
  const listeners = taskListeners.get(taskId);
  if (!listeners) {
    return;
  }
  taskListeners.set(
    taskId,
    listeners.filter((existing) => existing !== listener)
  );
  if (taskListeners.get(taskId)?.length === 0) {
    taskListeners.delete(taskId);
  }
}

function calculateRetryDelay(attempt: number): number {
  return BASE_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, Math.max(0, attempt - 1));
}

async function moveTaskToDeadLetter(task: PrefetchTask, errMessage: string) {
  const payload = JSON.stringify({
    ...task,
    failedAt: new Date().toISOString(),
    error: errMessage,
  });

  if (redis.isOpen) {
    try {
      await redis.rPush(PREFETCH_DLQ_KEY, payload);
      return;
    } catch (err: any) {
      warn(`Failed to push task ${task.id} to Redis dead-letter queue:`, err?.message);
    }
  }

  warn(`Dead-letter (in-memory) => ${task.category}: ${errMessage}`);
}

async function handleTaskFailure(task: PrefetchTask, errMessage: string): Promise<void> {
  const nextAttempt = task.attempt + 1;
  if (nextAttempt >= task.maxAttempts) {
    await moveTaskToDeadLetter(task, errMessage);
    notifyTaskResult({
      id: task.id,
      category: task.category,
      status: 'failed',
      attempts: nextAttempt,
      completedAt: new Date().toISOString(),
      error: errMessage,
    });
    return;
  }

  const delayMs = calculateRetryDelay(nextAttempt);
  warn(
    `Task ${task.category} failed (attempt ${nextAttempt}/${task.maxAttempts}): ${errMessage}. Retrying in ${delayMs}ms`
  );

  await enqueuePrefetchTask(task.category, task.amountToFetch, {
    reason: `retry:${task.reason ?? 'scheduled'}`,
    maxAttempts: task.maxAttempts,
    initialAttempt: nextAttempt,
    taskId: task.id,
    delayMs,
  });
}

async function processTask(task: PrefetchTask) {
  log(
    `▶️  Processing ${task.category} (attempt ${task.attempt + 1}/${task.maxAttempts}, reason: ${
      task.reason ?? 'unspecified'
    })`
  );
  try {
    const result = await prefetchCategoryMarkets({
      category: task.category,
      amountToFetch: task.amountToFetch,
      reason: task.reason,
    });

    log(
      `✅ ${task.category} complete (${result.created} created, ${result.updated} updated, ${result.cached} cached)`
    );

    notifyTaskResult({
      id: task.id,
      category: task.category,
      status: 'completed',
      attempts: task.attempt + 1,
      completedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const errMessage = err?.message || 'Unknown error';
    error(`❌ ${task.category} failed: ${errMessage}`);
    await handleTaskFailure(
      {
        ...task,
        lastError: errMessage,
      },
      errMessage
    );
  }
}

async function processQueueTick() {
  if (!isWorkerRunning || processingTick) {
    return;
  }

  processingTick = true;
  try {
    while (runningTasks.size < WORKER_CONCURRENCY) {
      const task = await popTask();
      if (!task) {
        break;
      }

      const taskPromise = processTask(task)
        .catch((err) => {
          error(`Unexpected worker failure:`, err);
        })
        .finally(() => {
          runningTasks.delete(taskPromise);
        });

      runningTasks.add(taskPromise);
    }
  } finally {
    processingTick = false;
  }
}

export async function enqueuePrefetchTask(
  category: string,
  amountToFetch: number,
  options?: EnqueueOptions
): Promise<PrefetchTask> {
  const task: PrefetchTask = {
    id: options?.taskId ?? randomUUID(),
    category: category.toLowerCase(),
    amountToFetch,
    attempt: options?.initialAttempt ?? 0,
    maxAttempts: options?.maxAttempts ?? MAX_ATTEMPTS,
    enqueuedAt: new Date().toISOString(),
    reason: options?.reason ?? 'scheduled',
    lastError: null,
  };

  const push = async () => {
    await pushTask(task);
    startPrefetchQueueWorker();
    setImmediate(() => {
      processQueueTick().catch((err) => error('Process tick failed:', err));
    });
  };

  if (options?.delayMs && options.delayMs > 0) {
    const timer = setTimeout(() => {
      retryTimeouts.delete(task.id);
      push().catch((err) => error('Failed to enqueue delayed task:', err));
    }, options.delayMs);
    retryTimeouts.set(task.id, timer);
  } else {
    await push();
  }

  return task;
}

export function startPrefetchQueueWorker() {
  if (isWorkerRunning) {
    return;
  }

  isWorkerRunning = true;
  workerTimer = setInterval(() => {
    processQueueTick().catch((err) => error('Worker tick failed:', err));
  }, WORKER_POLL_INTERVAL_MS);
  workerTimer.unref?.();
  log(`Worker started (interval=${WORKER_POLL_INTERVAL_MS}ms, concurrency=${WORKER_CONCURRENCY})`);
}

export function stopPrefetchQueueWorker() {
  if (!isWorkerRunning) {
    return;
  }

  isWorkerRunning = false;
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  retryTimeouts.forEach((timer) => clearTimeout(timer));
  retryTimeouts.clear();
  log('Worker stopped');
}

function waitForTaskCompletion(taskId: string, timeoutMs: number): Promise<void> {
  const existing = taskResults.get(taskId);
  if (existing) {
    if (existing.status === 'failed') {
      return Promise.reject(
        new Error(existing.error || `Prefetch task ${taskId} failed before wait started`)
      );
    }
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      removeTaskListener(taskId, listener);
      reject(new Error(`Timed out waiting for prefetch task ${taskId}`));
    }, timeoutMs);

    const listener = (result: PrefetchTaskResult) => {
      if (result.status === 'failed') {
        clearTimeout(timeout);
        removeTaskListener(taskId, listener);
        reject(new Error(result.error || `Prefetch task ${taskId} failed`));
        return;
      }

      clearTimeout(timeout);
      removeTaskListener(taskId, listener);
      resolve();
    };

    addTaskListener(taskId, listener);
  });
}

export async function waitForPrefetchTasks(
  taskIds: string[],
  timeoutMs: number = MANUAL_TIMEOUT_MS
): Promise<void> {
  await Promise.all(taskIds.map((taskId) => waitForTaskCompletion(taskId, timeoutMs)));
}

