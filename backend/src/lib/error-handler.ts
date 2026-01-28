/**
 * Comprehensive Error Handling & Failover Utilities
 * 
 * Provides:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for external APIs
 * - Graceful degradation
 * - Structured error responses
 */

import { retryWithBackoff, retryWithBackoffSilent, type RetryOptions } from './retry.js';

/**
 * Error types for better error handling
 */
export enum ErrorType {
  NETWORK = 'NETWORK_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  VALIDATION = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  MARKET_CLOSED = 'MARKET_CLOSED',
  DATABASE = 'DATABASE_ERROR',
  EXTERNAL_API = 'EXTERNAL_API_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR',
}

/**
 * Structured error response
 */
export interface StructuredError {
  type: ErrorType;
  message: string;
  code: string;
  retryable: boolean;
  retryAfter?: number; // seconds
  details?: any;
}

/**
 * Classify error type from error object
 */
export function classifyError(error: any): ErrorType {
  // Network errors
  if (!error.response && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND')) {
    return ErrorType.NETWORK;
  }

  // Rate limit errors
  if (error.response?.status === 429) {
    return ErrorType.RATE_LIMIT;
  }

  // Not found errors
  if (error.response?.status === 404 || error.message?.includes('not found')) {
    return ErrorType.NOT_FOUND;
  }

  // Validation errors
  if (error.name === 'ZodError' || error.response?.status === 400) {
    return ErrorType.VALIDATION;
  }

  // Database errors
  if (error.code?.startsWith('P') || error.message?.includes('database') || error.message?.includes('prisma')) {
    return ErrorType.DATABASE;
  }

  // External API errors
  if (error.response?.status >= 500 || error.message?.includes('Polymarket') || error.message?.includes('API')) {
    return ErrorType.EXTERNAL_API;
  }

  // Business logic errors
  if (error.message?.includes('Insufficient credits') || error.message?.includes('balance')) {
    return ErrorType.INSUFFICIENT_BALANCE;
  }

  if (error.message?.includes('not open') || error.message?.includes('closed') || error.message?.includes('expired')) {
    return ErrorType.MARKET_CLOSED;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const type = classifyError(error);
  
  // Retryable errors
  const retryableTypes = [
    ErrorType.NETWORK,
    ErrorType.RATE_LIMIT,
    ErrorType.EXTERNAL_API,
    ErrorType.DATABASE,
  ];

  return retryableTypes.includes(type);
}

/**
 * Create structured error response
 */
export function createStructuredError(error: any): StructuredError {
  const type = classifyError(error);
  const retryable = isRetryableError(error);
  
  // Extract retry-after from rate limit errors
  let retryAfter: number | undefined;
  if (type === ErrorType.RATE_LIMIT) {
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    if (retryAfterHeader) {
      retryAfter = parseInt(retryAfterHeader, 10);
    }
  }

  return {
    type,
    message: error.message || 'An unexpected error occurred',
    code: error.code || type,
    retryable,
    retryAfter,
    details: error.response?.data || error.details,
  };
}

/**
 * Enhanced retry with error classification
 */
export async function retryWithErrorHandling<T>(
  fn: () => Promise<T>,
  options: RetryOptions & {
    onRetry?: (error: any, attempt: number) => void;
    onFailure?: (error: any) => void;
  } = {}
): Promise<T> {
  const { onRetry, onFailure, ...retryOptions } = options;

  try {
    return await retryWithBackoff(fn, {
      ...retryOptions,
      retryableErrors: (error) => {
        const isRetryable = retryOptions.retryableErrors 
          ? retryOptions.retryableErrors(error)
          : isRetryableError(error);
        
        if (isRetryable && onRetry) {
          onRetry(error, 0); // Will be called in retry loop
        }
        
        return isRetryable;
      },
    });
  } catch (error: any) {
    if (onFailure) {
      onFailure(error);
    }
    throw error;
  }
}

/**
 * Circuit Breaker State
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests immediately
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold: number; // Open circuit after N failures
  successThreshold: number; // Close circuit after N successes (half-open state)
  timeout: number; // Time in ms before trying half-open
  resetTimeout: number; // Time in ms before resetting failure count
}

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  resetTimeout: 300000, // 5 minutes
};

/**
 * Circuit Breaker for external API calls
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastStateChangeTime = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition
    this.updateState();

    // If circuit is open, reject immediately
    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - this.lastStateChangeTime;
      if (timeSinceOpen < this.options.timeout) {
        throw new Error(
          `Circuit breaker is OPEN. Service unavailable. Retry after ${Math.ceil((this.options.timeout - timeSinceOpen) / 1000)}s`
        );
      }
      // Timeout expired, try half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      this.lastStateChangeTime = Date.now();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private updateState(): void {
    const now = Date.now();

    // Reset failure count if reset timeout expired
    if (this.state === CircuitState.CLOSED && now - this.lastFailureTime > this.options.resetTimeout) {
      this.failureCount = 0;
    }

    // Transition from half-open to closed if success threshold met
    if (this.state === CircuitState.HALF_OPEN && this.successCount >= this.options.successThreshold) {
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
      this.lastStateChangeTime = now;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.lastStateChangeTime = Date.now();
      this.successCount = 0;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker (for testing/manual recovery)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.lastStateChangeTime = Date.now();
  }
}

/**
 * Global circuit breakers for different services
 */
export const circuitBreakers = {
  polymarket: new CircuitBreaker({
    failureThreshold: 5,
    timeout: 60000, // 1 minute
  }),
  database: new CircuitBreaker({
    failureThreshold: 10,
    timeout: 30000, // 30 seconds
  }),
};

/**
 * Execute with circuit breaker and retry
 */
export async function executeWithFailover<T>(
  fn: () => Promise<T>,
  options: {
    circuitBreaker?: CircuitBreaker;
    retryOptions?: RetryOptions;
    fallback?: () => Promise<T | null>;
    serviceName?: string;
  } = {}
): Promise<T | null> {
  const { circuitBreaker, retryOptions, fallback, serviceName } = options;

  try {
    // Use circuit breaker if provided
    if (circuitBreaker) {
      return await circuitBreaker.execute(async () => {
        return await retryWithErrorHandling(fn, retryOptions);
      });
    }

    // Otherwise just retry
    return await retryWithErrorHandling(fn, retryOptions);
  } catch (error: any) {
    console.error(`[Failover] ${serviceName || 'Operation'} failed:`, error.message);

    // Try fallback if provided
    if (fallback) {
      console.log(`[Failover] Attempting fallback for ${serviceName || 'operation'}...`);
      try {
        return await fallback();
      } catch (fallbackError: any) {
        console.error(`[Failover] Fallback also failed:`, fallbackError.message);
      }
    }

    return null;
  }
}

