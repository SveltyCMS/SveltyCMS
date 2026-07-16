/**
 * @file src/utils/retry-dynamic-import.ts
 * @description Robust retry wrapper for dynamic imports with exponential backoff
 * and request coalescing. Used by admin lazy-loaded components to recover from
 * transient chunk load failures.
 *
 * ### Hardening (audit 2026-07):
 * - Request coalescing: optional moduleId prevents duplicate retries for the same module
 * - Faster first retry: baseDelayMs reduced from 1000 → 500 (faster self-healing)
 * - Accurate error: tracks lastErr so final failure reports the actual breaking error
 * - Memory cleanup: inFlight entries removed via .finally() even on permanent failure
 *
 * ### Features:
 * - configurable max retries and base delay
 * - exponential backoff with jitter
 * - fallback value on permanent failure
 */

// Track in-flight retries to prevent duplicate network requests for the same module
const inFlight = new Map<string, Promise<any>>();

/**
 * Attempts a dynamic import with retry on failure.
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export async function retryDynamicImport<T>(
  importFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    fallback?: T;
    moduleId?: string; // Optional: Unique ID to coalesce concurrent requests
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, fallback, moduleId } = options;

  // If we have a unique ID and this module is already being retried, return the existing promise
  if (moduleId && inFlight.has(moduleId)) {
    return inFlight.get(moduleId);
  }

  const attemptImport = async (): Promise<T> => {
    let lastErr: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await importFn();
      } catch (err) {
        lastErr = err;

        if (attempt === maxRetries) break;

        // Exponential backoff: base * 2^attempt + jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (fallback !== undefined) return fallback;
    throw lastErr;
  };

  const promise = attemptImport();

  // Coalesce request if moduleId is provided
  if (moduleId) {
    inFlight.set(moduleId, promise);
    promise.finally(() => inFlight.delete(moduleId));
  }

  return promise;
}
