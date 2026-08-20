/**
 * @file src/utils/lazy-module.ts
 * @description
 * Generic lazy module singleton helper for hot paths.
 *
 * Dynamic `import()` of an already-resolved module still costs tens of
 * microseconds per call on some runtimes. Wrap the import once and return the
 * memoized promise so every subsequent hot-path call becomes a promise
 * resolve instead of a module-resolution round trip.
 *
 * ### Features:
 * - memoized resolution: the loader runs at most once per success
 * - self-healing: a rejected load clears the memo so the next call retries
 * - fully generic: infers the resolved module type from the loader
 */

/**
 * Create a memoized lazy resolver.
 * The loader is invoked on first call; subsequent calls return the same
 * promise. A rejected promise is NOT memoized — the next call retries.
 */
export function lazyModule<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) {
      cached = loader().catch((err: unknown) => {
        cached = null;
        throw err;
      });
    }
    return cached;
  };
}
