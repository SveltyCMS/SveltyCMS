/**
 * @file src/utils/reactive-search-params.svelte.ts
 * @description Reactive URL search params for client-side filtering, sorting, and
 * pagination — without full page reloads. Wraps Svelte 5's SvelteURLSearchParams
 * with type-safe getters/setters and integration with the behavioral learner.
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

// ─── Types ────────────────────────────────────────────────────────────────

type ParsedValue = string | number | boolean;

interface SearchParamOptions {
  /** Use replaceState instead of pushState (default: true for filters) */
  replace?: boolean;
}

// ─── Instance ──────────────────────────────────────────────────────────────

let _instance: ReturnType<typeof createReactiveSearchParams> | null = null;

function syncUrl(params: SvelteURLSearchParams, options: SearchParamOptions = {}): void {
  if (!browser) return;
  const url = new URL(location.toString());
  const str = params.toString();
  url.search = str ? `?${str}` : "";
  history[options.replace !== false ? "replaceState" : "pushState"]({}, "", url);
}

function parseValue(value: string): ParsedValue {
  if (value === "true") return true;
  if (value === "false") return false;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

function createReactiveSearchParams() {
  const params = new SvelteURLSearchParams(browser ? location.search : "");

  /** Record behavioral data when a search param is set (feeds behavioral learner) */
  function recordParamUsage(key: string): void {
    if (!browser) return;
    import("@src/services/intelligence/behavioral-learner")
      .then(({ recordCollectionAccess }) => {
        // Record which table/filter column the editor is using
        recordCollectionAccess("global", `table:${key}`);
      })
      .catch(() => {});
  }

  return {
    /** Get a typed value from search params, with default fallback */
    get<T extends ParsedValue = string>(key: string, defaultValue?: T): T {
      const raw = params.get(key);
      if (raw === null) return defaultValue as T;
      return parseValue(raw) as T;
    },

    /** Get all values for a key (for multi-select filters) */
    getAll(key: string): ParsedValue[] {
      return params.getAll(key).map(parseValue);
    },

    /** Set a search param value */
    set(key: string, value: ParsedValue, options?: SearchParamOptions): void {
      params.set(key, String(value));
      syncUrl(params, options);
      recordParamUsage(key);
    },

    /** Append a value (for multi-select) */
    append(key: string, value: ParsedValue, options?: SearchParamOptions): void {
      params.append(key, String(value));
      syncUrl(params, options);
      recordParamUsage(key);
    },

    /** Delete a search param */
    delete(key: string, options?: SearchParamOptions): void {
      params.delete(key);
      syncUrl(params, options);
    },

    /** Check if a param exists */
    has(key: string): boolean {
      return params.has(key);
    },

    /** Get all param keys */
    keys(): string[] {
      return [...params.keys()];
    },

    /** Get all params as entries */
    entries(): Array<[string, ParsedValue]> {
      return [...params.entries()].map(([k, v]) => [k, parseValue(v)]);
    },

    /** Number of params */
    get size(): number {
      return params.size;
    },

    /** Reset all params */
    clear(options?: SearchParamOptions): void {
      for (const key of params.keys()) params.delete(key);
      syncUrl(params, options);
    },

    /** Bulk set from an object */
    setAll(record: Record<string, ParsedValue>, options?: SearchParamOptions): void {
      for (const [key, value] of Object.entries(record)) {
        params.set(key, String(value));
      }
      syncUrl(params, options);
    },

    /** Get the raw URLSearchParams string (for server-side serialization) */
    toString(): string {
      return params.toString();
    },

    /** Convert to plain URLSearchParams (for fetch calls) */
    toURLSearchParams(): URLSearchParams {
      return new URLSearchParams(params.toString());
    },
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get or create the singleton reactive search params instance.
 * Use in any client-side component for URL-synced reactive state.
 */
export function useReactiveSearchParams() {
  if (!_instance) _instance = createReactiveSearchParams();
  return _instance;
}

/**
 * Sync internal state with browser URL (call after popstate events).
 */
export function syncReactiveSearchParams(search: string): void {
  const inst = _instance;
  if (!inst) return;
  // Rebuild from URL string
  const newParams = new URLSearchParams(search);
  for (const key of inst.keys()) {
    if (!newParams.has(key)) inst.delete(key, { replace: true });
  }
  for (const [key, value] of newParams.entries()) {
    inst.set(key, value, { replace: true });
  }
}
