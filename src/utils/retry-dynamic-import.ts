/**
 * @file src/utils/retry-dynamic-import.ts
 * @description Retry wrapper for dynamic imports with exponential backoff.
 * Used by admin lazy-loaded components to recover from transient chunk load failures.
 *
 * ### Features:
 * - configurable max retries and base delay
 * - exponential backoff with jitter
 * - fallback value on permanent failure
 */

/**
 * Attempts a dynamic import with retry on failure.
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export async function retryDynamicImport<T>(
  importFn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; fallback?: T } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, fallback } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await importFn();
    } catch (err) {
      if (attempt === maxRetries) {
        if (fallback !== undefined) return fallback;
        throw err;
      }
      // Exponential backoff with jitter: baseDelay * 2^attempt + random(0, 200)
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
