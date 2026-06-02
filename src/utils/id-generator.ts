/**
 * @file src/utils/id-generator.ts
 * @description Hydration-safe unique ID generator for DOM element identification.
 *
 * Uses a deterministic per-prefix counter instead of Math.random() to ensure
 * identical ID sequences during SSR and client-side hydration. This prevents
 * hydration mismatches where server-rendered `id` attributes differ from
 * client-rendered ones (e.g., `checkbox-a3x9f2` vs `checkbox-b7k1m4`).
 *
 * Features:
 * - deterministic counter-based generation (SSR/hydration-safe)
 * - per-prefix namespacing for organized DOM IDs
 * - reset capability for request-context isolation in SSR
 * - zero dependencies
 */

const counters = new Map<string, number>();

/**
 * Generates a deterministic, hydration-safe unique ID with an optional prefix.
 *
 * IDs are sequential per prefix, guaranteeing identical output during SSR
 * and client hydration as long as components mount in the same order.
 *
 * @param prefix - Optional namespace prefix (default: 'id'). Use component
 *   names like 'select', 'checkbox', 'combobox' for readable DOM IDs.
 * @returns A deterministic unique ID string (e.g., 'select-0', 'select-1').
 *
 * @example
 * ```ts
 * const fieldId = generateId('checkbox');  // 'checkbox-0'
 * const errorId = `${fieldId}-error`;      // 'checkbox-0-error'
 * ```
 */
export function generateId(prefix = "id"): string {
  const count = counters.get(prefix) ?? 0;
  counters.set(prefix, count + 1);
  return `${prefix}-${count}`;
}

/**
 * Resets all ID counters.
 *
 * Call this at the start of each SSR request context to guarantee
 * deterministic ID sequences per-request. Without reset, counters
 * would grow indefinitely across requests, causing mismatches when
 * components mount in different orders on different pages.
 *
 * @example
 * ```ts
 * // In hooks.server.ts or layout.server.ts:
 * import { resetIdCounters } from '@utils/id-generator';
 * export const handle = async ({ event, resolve }) => {
 *   resetIdCounters();
 *   return resolve(event);
 * };
 * ```
 */
export function resetIdCounters(): void {
  counters.clear();
}
