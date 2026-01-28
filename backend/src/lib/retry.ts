/**
 * Retry utility with exponential backoff
 * 
 * Handles retries for external API calls with exponential backoff strategy.
 * Useful for Polymarket API calls that may fail due to rate limits or temporary issues.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableErrors: (error: any) => {
    // Retry on network errors, timeouts, and 5xx errors
    if (!error.response) return true; // Network error
    const status = error.response.status;
    return status >= 500 || status === 429; // Server error or rate limit
  },
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry (should return a Promise)
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => client.getMarkets(),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!config.retryableErrors(error)) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, config);
      console.log(
        `[Retry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed. Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry a function with exponential backoff (silent version)
 * Returns null on failure instead of throwing
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result or null if all retries fail
 */
export async function retryWithBackoffSilent<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T | null> {
  try {
    return await retryWithBackoff(fn, options);
  } catch (error: any) {
    console.error('[Retry] All retries exhausted:', error.message);
    return null;
  }
}

