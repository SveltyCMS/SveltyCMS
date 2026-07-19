/**
 * @file src/utils/lazy-rune.ts
 * @description Helper for lazy initialization of Svelte 5 runes to support Bun unit testing.
 *
 * ### Hardening (audit 2026-07):
 * - Fixed Svelte 5 compiler errors: uses compliant `let x = $state(val)` pattern inside try/catch
 * - Fixed read-only state bug: adds .set(val) and .update(fn) for test environment mutations
 * - Fixed stale $derived mock: evaluates fn() fresh on every call (no permanent caching)
 * - Removed module-level IS_SVELTE_CONTEXT check (fails in Svelte 5)
 *
 * IMPORTANT: $state() and $derived() are Svelte 5 compiler transforms — they only work
 * inside `.svelte` and `.svelte.ts` files where the Svelte compiler processes them.
 * These helpers add runtime guards to prevent crashes in non-Svelte contexts (Node.js, Bun).
 */

export interface LazyState<T> {
  (): T;
  set(val: T): void;
  update(fn: (prev: T) => T): void;
}

/**
 * Creates a getter/setter for a Svelte 5 $state rune.
 * Prevents ReferenceErrors in Bun tests where modules are imported before runes are transformed.
 */
export function lazyState<T>(initialValue: T): LazyState<T> {
  try {
    // Svelte 5 requires $state as a variable declaration initializer — the compiler
    // transforms this in production. Uncompiled environments throw ReferenceError.
    let state = $state(initialValue);

    const getter = () => state;
    getter.set = (v: T) => {
      state = v;
    };
    getter.update = (fn: (prev: T) => T) => {
      state = fn(state);
    };

    return getter as LazyState<T>;
  } catch (err: unknown) {
    if (
      err instanceof ReferenceError &&
      (err.message.includes("$state is not defined") ||
        err.message.includes("Can't find variable: $state"))
    ) {
      let val = initialValue;

      const getter = () => val;
      getter.set = (v: T) => {
        val = v;
      };
      getter.update = (fn: (prev: T) => T) => {
        val = fn(val);
      };

      return getter as LazyState<T>;
    }

    throw err;
  }
}

/**
 * Creates a getter for a Svelte 5 $derived rune.
 * Prevents ReferenceErrors in Bun tests where modules are imported before runes are transformed.
 */
export function lazyDerived<T>(fn: () => T): () => T {
  try {
    let derived = $derived(fn());

    return () => derived;
  } catch (err: unknown) {
    if (
      err instanceof ReferenceError &&
      (err.message.includes("$derived is not defined") ||
        err.message.includes("Can't find variable: $derived"))
    ) {
      // In non-reactive test environments, evaluate fn() fresh on every call
      // so tests can simulate state mutations and verify derived reactions.
      return () => fn();
    }

    throw err;
  }
}
