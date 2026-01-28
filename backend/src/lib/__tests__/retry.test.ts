import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, retryWithBackoffSilent } from '../retry.js';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, { maxRetries: 1, initialDelayMs: 100 });

    // Fast-forward time to skip delay
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const error = new Error('Persistent error');
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 100 });
    const rejection = expect(promise).rejects.toThrow('Persistent error');

    // Fast-forward time to cover all retries (100 + 200 + 400 = 700ms total)
    await vi.advanceTimersByTimeAsync(1000);

    // Await the expectation after timers complete to avoid unhandled rejections
    await rejection;
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should use exponential backoff', async () => {
    const error = new Error('Error');
    const fn = vi.fn().mockRejectedValue(error);
    
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      initialDelayMs: 100,
      backoffMultiplier: 2,
    });
    const rejection = expect(promise).rejects.toThrow('Error');

    // Advance timers to trigger retries (100 + 200 = 300ms total for 2 retries)
    await vi.advanceTimersByTimeAsync(500);

    await rejection;
    // Should have been called 3 times (initial + 2 retries)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const error = { response: { status: 404 } }; // 404 is not retryable
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('should retry on 5xx errors', async () => {
    const error = { response: { status: 500 } };
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, { maxRetries: 1, initialDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on rate limit (429)', async () => {
    const error = { response: { status: 429 } };
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, { maxRetries: 1, initialDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('retryWithBackoffSilent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return null on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Error'));

    const promise = retryWithBackoffSilent(fn, { maxRetries: 1, initialDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBeNull();
  });

  it('should return result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoffSilent(fn);
    expect(result).toBe('success');
  });
});

