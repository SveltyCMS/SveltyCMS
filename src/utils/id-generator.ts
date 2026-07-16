/**
 * @file src/utils/id-generator.ts
 * @description Hydration-safe unique ID generator for DOM element identification.
 *
 * ### Hardening (audit 2026-07):
 * - SSR concurrency fix: Svelte Context isolation replaces global reset (prevents
 *   cross-request ID collisions under concurrent requests)
 * - HMR survival: fallback map on `globalThis` survives Vite hot reload
 * - HTML/CSS safety: sanitizes prefixes for valid selectors (no spaces, no leading digits)
 * - Graceful fallback: try/catch around context lookup for event handler usage
 */

import { getContext, setContext, hasContext } from "svelte";

const isServer = typeof window === "undefined";
const ID_CONTEXT_KEY = Symbol.for("svelty-id-generator");

// HMR-safe fallback: persists across Vite hot reloads on the client
const _global = globalThis as any;
_global.__ID_GLOBAL_MAP ??= new Map<string, number>();

/**
 * Initializes a request-scoped ID generator.
 *
 * Call this ONCE in the `<script>` block of your root `+layout.svelte`.
 * This eliminates cross-request ID pollution during concurrent SSR requests.
 */
export function initIdGenerator(): void {
  setContext(ID_CONTEXT_KEY, new Map<string, number>());
}

/**
 * Generates a deterministic, hydration-safe unique HTML ID.
 *
 * @param prefix - Optional namespace prefix (default: 'id').
 * @returns A deterministic unique ID string (e.g., 'select-0', 'select-1').
 */
export function generateId(prefix = "id"): string {
  // 1. Sanitize HTML ID (must not contain spaces, must start with a letter)
  let safePrefix = prefix.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || "id";
  if (/^[0-9-]/.test(safePrefix)) {
    safePrefix = `el-${safePrefix}`;
  }

  let mapToUse: Map<string, number> = _global.__ID_GLOBAL_MAP;

  // 2. Attempt to use request-isolated Svelte Context
  try {
    if (hasContext(ID_CONTEXT_KEY)) {
      mapToUse = getContext<Map<string, number>>(ID_CONTEXT_KEY);
    } else if (isServer) {
      console.warn(
        `[id-generator] generateId('${prefix}') called during SSR without initIdGenerator(). ` +
          `Concurrent requests may experience hydration mismatches. Add initIdGenerator() to root +layout.svelte.`,
      );
    }
  } catch {
    // Normal: called outside component init (onMount, click handlers). Falls back to global map.
  }

  // 3. Increment with overflow guard
  const count = mapToUse.get(safePrefix) ?? 0;
  const nextCount = count >= Number.MAX_SAFE_INTEGER ? 0 : count + 1;
  mapToUse.set(safePrefix, nextCount);

  return `${safePrefix}-${count}`;
}

/**
 * Resets the global ID counters.
 * @deprecated Use initIdGenerator() in +layout.svelte instead for true SSR request isolation.
 */
export function resetIdCounters(): void {
  _global.__ID_GLOBAL_MAP.clear();
}
