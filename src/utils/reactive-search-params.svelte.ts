/**
 * @file src/utils/reactive-search-params.svelte.ts
 * @description Type-safe, reactive URL search params with debounced history sync.
 *
 * ### Hardening (audit 2026-07):
 * - Instance-based (not singleton): each call creates a fresh instance, no page collisions
 * - Debounced sync: 150ms batch prevents browser history spam from rapid mutations
 * - SvelteKit-native: uses goto() + page.url instead of raw history API
 * - Simplified API: removed unused methods, kept core get/set/delete/clear/entries
 *
 * ### Why this over raw url.searchParams:
 * - Reactive: table re-renders instantly when filter changes (no SSR round-trip)
 * - Type-safe: get() returns parsed values (number, boolean, string), not just strings
 * - Behavioral: records which filters/columns editors use most (feeds behavioral learner)
 * - URL-synced: params always reflected in the browser URL bar (bookmarkable, shareable)
 *
 * ### Usage in a table component:
 * ```svelte
 * <script lang="ts">
 *   const params = useReactiveSearchParams();
 *   // Read: const page = params.get('page', 1);
 *   // Write: params.set('sort', 'title');
 *   // Delete: params.delete('filter');
 * </script>
 * ```
 */

import { SvelteURLSearchParams } from "svelte/reactivity";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";

type ParsedValue = string | number | boolean;

/**
 * Creates a reactive search param instance bound to the current page state.
 * No longer a singleton, allowing multiple distinct table instances.
 */
export function useReactiveSearchParams() {
  // 🚀 Bind directly to SvelteKit's reactive page state
  const params = new SvelteURLSearchParams(browser ? page.url.searchParams : "");

  /** Debounced history update to prevent browser history spam */
  let timeout: ReturnType<typeof setTimeout>;
  function scheduleSync(replace = true) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      goto(`?${params.toString()}`, {
        replaceState: replace,
        keepFocus: true,
        noScroll: true,
      });
    }, 150);
  }

  function parseValue(value: string): ParsedValue {
    if (value === "true") return true;
    if (value === "false") return false;
    const n = Number(value);
    return !Number.isNaN(n) && value !== "" ? n : value;
  }

  return {
    get<T extends ParsedValue = string>(key: string, defaultValue?: T): T {
      const raw = params.get(key);
      return raw === null ? (defaultValue as T) : (parseValue(raw) as T);
    },

    set(key: string, value: ParsedValue, replace = true) {
      params.set(key, String(value));
      scheduleSync(replace);
      this.recordUsage(key);
    },

    delete(key: string, replace = true) {
      params.delete(key);
      scheduleSync(replace);
    },

    clear(replace = true) {
      for (const key of Array.from(params.keys())) params.delete(key);
      scheduleSync(replace);
    },

    recordUsage(key: string) {
      if (!browser) return;
      // Dynamic import keeps main bundle lean
      import("@src/services/intelligence/behavioral-learner")
        .then(({ recordCollectionAccess }) => recordCollectionAccess("global", `table:${key}`))
        .catch(() => {});
    },

    // Expose the raw reactive object for direct iteration in templates
    get entries() {
      return Array.from(params.entries()).map(([k, v]) => [k, parseValue(v)] as const);
    },
  };
}
