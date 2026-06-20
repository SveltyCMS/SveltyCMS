/**
 * @file src/utils/lazy-rune.ts
 * @description Helper for lazy initialization of Svelte 5 runes to support Bun unit testing.
 *
 * IMPORTANT: $state() and $derived() are Svelte 5 compiler transforms — they only work
 * inside `.svelte` and `.svelte.ts` files where the Svelte compiler processes them.
 * These helpers add runtime guards to prevent crashes in non-Svelte contexts (Node.js, Bun).
 */

/** Module-level detection: true when running inside a Svelte-compiled context */
const IS_SVELTE_CONTEXT = typeof $state === "function";

/**
 * Creates a getter for a Svelte 5 $state rune.
 * This prevents ReferenceErrors in Bun tests where modules are imported before runes are mocked.
 *
 * ⚠️ Only works inside `.svelte` or `.svelte.ts` files. In non-Svelte contexts (Node.js, Bun),
 * returns a plain mutable value instead of a reactive rune.
 */
export function lazyState<T>(initialValue: T): () => T {
  // In non-Svelte contexts (Node.js, Bun, pure TS), return a plain getter
  if (!IS_SVELTE_CONTEXT) {
    let val = initialValue;
    return () => val;
  }

  let state: T | undefined;
  return () => {
    if (state === undefined) {
      // @ts-ignore - $state is a Svelte compiler transform
      state = $state(initialValue);
    }
    return state as T;
  };
}

/**
 * Creates a getter for a Svelte 5 $derived rune.
 *
 * ⚠️ Only works inside `.svelte` or `.svelte.ts` files. In non-Svelte contexts (Node.js, Bun),
 * returns the raw computation result without reactive tracking.
 */
export function lazyDerived<T>(fn: () => T): () => T {
  // In non-Svelte contexts, just call the fn directly — no reactive tracking
  if (!IS_SVELTE_CONTEXT) {
    let cached: T | undefined;
    let dirty = true;
    return () => {
      if (dirty) {
        cached = fn();
        dirty = false;
      }
      return cached as T;
    };
  }

  let derived: T | undefined;
  return () => {
    if (derived === undefined) {
      // @ts-ignore - $derived is a Svelte compiler transform
      derived = $derived(fn());
    }
    return derived as T;
  };
}
