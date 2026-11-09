/**
 * @file src/utils/id-generator.ts
 * @description Hydration-safe unique ID generator for DOM element identification.
 *
 * ### Hardening (audit 2026-07):
 * - SSR concurrency fix: Svelte Context isolation replaces global reset (prevents
 *   cross-request ID collisions under concurrent requests)
 * - context-less SSR (async re-entry) never throws: the global map restarts so
 *   `label[for]` / `aria-describedby` still match after hydration
 * - HMR survival: fallback map on `globalThis` survives Vite hot reload
 * - HTML/CSS safety: sanitizes prefixes for valid selectors (no spaces, no leading digits)
 * - Graceful fallback: try/catch around context lookup for event handler usage
 */

import { logger } from "@utils/logger";
import { getContext, setContext, hasContext } from "svelte";

const isServer = typeof window === "undefined";
const ID_CONTEXT_KEY = Symbol.for("svelty-id-generator");

// HMR-safe fallback: persists across Vite hot reloads on the client
const _global = globalThis as any;
_global.__ID_GLOBAL_MAP ??= new Map<string, number>();

/** Suppress SSR warnings under vitest / quiet unit runs (still warn in real SSR). */
function isIdGeneratorQuiet(): boolean {
  if (_global.__SVELTY_QUIET__ === true) return true;
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return false;
  return (
    (env.VITEST != null && env.VITEST !== "" && env.VITEST !== "false" && env.VITEST !== "0") ||
    env.TEST_MODE === "true" ||
    env.NODE_ENV === "test"
  );
}

/**
 * Initializes a request-scoped ID generator.
 *
 * Call this ONCE in the `<script>` block of your root `+layout.svelte`.
 * This eliminates cross-request ID pollution during concurrent SSR requests.
 *
 * Never throws: async/concurrent SSR can re-enter the layout without an active
 * Svelte component context (`lifecycle_outside_component`), which used to turn
 * every page into a 500 the moment it happened. In that case the process-global
 * map is restarted so the render still counts from zero, exactly like the
 * hydrating client does.
 */
export function initIdGenerator(): void {
  try {
    setContext(ID_CONTEXT_KEY, new Map<string, number>());
  } catch {
    if (isServer) {
      _global.__ID_GLOBAL_MAP.clear();
    }
  }
}

/** Matches any character that is not valid in an HTML id (replaced with "-"). */
const INVALID_ID_CHARS_REGEX = /[^a-zA-Z0-9_-]/g;
/** A leading digit or dash is not a valid CSS identifier start. */
const INVALID_ID_START_REGEX = /^[0-9-]/;

/**
 * True when `prefix` is already a valid HTML/CSS id prefix: non-empty, starts
 * with a letter/underscore, and contains only `[a-zA-Z0-9_-]`. Lets the common
 * render path skip `trim()` + `replace()` + the leading-char regex.
 */
function isSafeIdPrefix(prefix: string): boolean {
  if (prefix.length === 0) return false;
  const first = prefix.charCodeAt(0);
  if ((first >= 48 && first <= 57) || first === 45) return false; // digit or '-'
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    const ok =
      (c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 95 || // _
      c === 45; // -
    if (!ok) return false;
  }
  return true;
}

/**
 * Generates a deterministic, hydration-safe unique HTML ID.
 *
 * @param prefix - Optional namespace prefix (default: 'id').
 * @returns A deterministic unique ID string (e.g., 'select-0', 'select-1').
 */
export function generateId(prefix = "id"): string {
  // 1. Sanitize HTML ID (must not contain spaces, must start with a letter).
  //    The fast path avoids `trim`/`replace` for the common already-safe prefix.
  let safePrefix: string;
  if (isSafeIdPrefix(prefix)) {
    safePrefix = prefix;
  } else {
    safePrefix = prefix.trim().replace(INVALID_ID_CHARS_REGEX, "-") || "id";
    if (INVALID_ID_START_REGEX.test(safePrefix)) {
      safePrefix = `el-${safePrefix}`;
    }
  }

  let mapToUse: Map<string, number> = _global.__ID_GLOBAL_MAP;

  // 2. Attempt to use request-isolated Svelte Context
  try {
    if (hasContext(ID_CONTEXT_KEY)) {
      mapToUse = getContext<Map<string, number>>(ID_CONTEXT_KEY);
    } else if (isServer && !isIdGeneratorQuiet()) {
      logger.warn(
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
