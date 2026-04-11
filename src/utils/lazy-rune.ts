/**
 * @file src/utils/lazy-rune.ts
 * @description Helper for lazy initialization of Svelte 5 runes to support Bun unit testing.
 */

/**
 * Creates a getter for a Svelte 5 $state rune.
 * This prevents ReferenceErrors in Bun tests where modules are imported before runes are mocked.
 */
export function lazyState<T>(initialValue: T): () => T {
  let state: T | undefined;
  return () => {
    if (state === undefined) {
      // @ts-ignore - $state is a magic keyword
      state = $state(initialValue);
    }
    return state as T;
  };
}

/**
 * Creates a getter for a Svelte 5 $derived rune.
 */
export function lazyDerived<T>(fn: () => T): () => T {
  let derived: T | undefined;
  return () => {
    if (derived === undefined) {
      // @ts-ignore - $derived is a magic keyword
      derived = $derived(fn());
    }
    return derived as T;
  };
}
