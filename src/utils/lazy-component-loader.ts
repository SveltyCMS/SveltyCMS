/**
 * @file src/utils/lazy-component-loader.ts
 * @description Memoized lazy component loader for plugin/slot rendering.
 *
 * `{#await someComponentLoader()}` re-evaluates its expression on every parent
 * re-render. A raw dynamic-import loader returns a NEW promise each call, which
 * resets the await block and destroys + remounts the resolved component on
 * every unrelated parent re-render — a mount/destroy churn that ends in
 * `effect_update_depth_exceeded`. Wrapping the loader in `memoizeLazyLoader`
 * guarantees the same promise per component identity, so the await block only
 * transitions once.
 *
 * ### Features:
 * - returns the same promise for repeated calls (stable await input)
 * - drops the memo on rejection so a failed import can be retried
 * - exports the `LazyComponent` result type used by all loader call sites
 * - zero dependencies — usable in any .svelte or .ts module
 */

import type { ComponentType } from "svelte";

/**
 * What a lazy component loader resolves to: a module with `default`, or the
 * component itself. `{#await}` consumers narrow via `Component.default`.
 */
export type LazyComponent = { default: ComponentType } | ComponentType;

/** Wrap a lazy component loader so it returns a stable promise per call. */
export function memoizeLazyLoader<T = unknown>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    if (!promise) {
      promise = loader().catch((error: unknown) => {
        // Allow a later retry after a failed dynamic import.
        promise = null;
        throw error;
      });
    }
    return promise;
  };
}
