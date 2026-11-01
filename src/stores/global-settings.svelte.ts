/**
 * @file src/stores/global-settings.svelte.ts
 * @description
 * **Public Environment Store**: The safe, reactive source for non-sensitive site settings.
 *
 * 🔒 SECURITY: This store ONLY handles public settings (Site Name, Themes, Versions).
 *
 * ### Responsibilities:
 * - Reactive state for public environment variables ($state).
 * - Validation of incoming settings against `publicConfigSchema`.
 * - Guarding against redundant environment re-initialization (Circuit Breaker).
 *
 * ### Next Steps & Options:
 * - Values here are used for UI customization (e.g. siteName in headers).
 * - Accessed globally via the `publicEnv` proxy.
 */

import { publicConfigSchema } from "../databases/public-config-schema";
// Universal Logger (safe for client and server)
import { logger } from "@utils/logger";
import { classifySseError, parseSseData } from "@utils/sse-client";
import type { InferOutput } from "valibot";

// Helper to safely get browser mode without crashing if $app/env is missing (e.g. in some Bun test contexts)
const isBrowser = (() => {
  try {
    return typeof window !== "undefined";
  } catch {
    return false;
  }
})();

type PublicEnv = InferOutput<typeof publicConfigSchema> & {
  PKG_VERSION?: string;
  FIRST_COLLECTION_REDIRECT_URL?: string;
  SETUP_COMPLETE?: boolean;
};

/**
 * Internal state using Svelte 5 runes.
 * Using a singleton pattern with lazy initialization to support Bun tests (hoisting safety).
 */
class GlobalStore {
  private static instance: GlobalStore;
  state = $state.raw<PublicEnv>({
    SETUP_COMPLETE:
      typeof (globalThis as any).__SVELTY_SETUP_COMPLETE__ !== "undefined"
        ? (globalThis as any).__SVELTY_SETUP_COMPLETE__
        : false,
  } as PublicEnv);
  isReady = $derived(Object.keys(this.state).length > 0);

  private constructor() {}

  public static getInstance(): GlobalStore {
    if (!GlobalStore.instance) {
      GlobalStore.instance = new GlobalStore();
    }
    return GlobalStore.instance;
  }

  update<K extends keyof PublicEnv>(key: K, value: PublicEnv[K]) {
    this.state = { ...this.state, [key]: value };
  }

  init(env: PublicEnv) {
    this.state = { ...this.state, ...env };
  }
}

// Helper to access the store singleton
const getStore = () => GlobalStore.getInstance();

let eventSource: EventSource | null = null;
/** Normal teardown (page navigation or `stopListening()`): errors from here on are expected. */
let tearingDown = false;
/** Consecutive errors since the last successful `onopen`. */
let consecutiveFailures = 0;
/** Pending reconnect, so a burst of errors cannot stack several connections. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Base delay between reconnect attempts after a real failure (grows with the attempt). */
const SSE_RECONNECT_BASE_MS = 5_000;

/**
 * Check if settings have been loaded on the client.
 */
export function isPublicEnvReady(): boolean {
  return getStore().isReady;
}

let lastEnvHash = "";

/**
 * Initialize the public environment settings from the server.
 */
export function initPublicEnv(env: PublicEnv) {
  if (!env || typeof env !== "object") {
    logger.warn("[GlobalSettings] Attempted to initialize with invalid environment object");
    return;
  }

  // Prevent redundant updates that trigger reactivity loops
  const currentHash = JSON.stringify(env);
  if (currentHash === lastEnvHash) return;
  lastEnvHash = currentHash;

  getStore().init(env);

  logger.debug("[GlobalSettings] Initialized public environment", {
    keys: Object.keys(env),
    version: env.PKG_VERSION,
  });

  if (isBrowser) {
    startListening();
  }
}

/**
 * Updates a specific public environment setting.
 */
export function updatePublicEnv<K extends keyof PublicEnv>(key: K, value: PublicEnv[K]) {
  getStore().update(key, value);
  logger.trace(`[GlobalSettings] Updated ${String(key)}`, { value });
}

/**
 * Starts listening for real-time settings changes via Server-Sent Events.
 */
function startListening() {
  if (!isBrowser || eventSource) {
    return;
  }

  if (window.location.pathname.includes("/login") || window.location.pathname.includes("/setup")) {
    return;
  }

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  try {
    tearingDown = false;
    eventSource = new EventSource("/api/content/events");

    eventSource.onopen = () => {
      consecutiveFailures = 0;
    };

    eventSource.addEventListener("settings:update", (event) => {
      // Tolerant parse: a comment line or a truncated/redacted document must not throw.
      const parsed = parseSseData(event.data);
      if (!parsed.ok) {
        if (parsed.reason === "invalid-json") {
          logger.debug("[GlobalSettings] Ignored unparseable real-time update");
        }
        return;
      }

      const data = parsed.value as { key?: keyof PublicEnv; value?: any } | null;
      if (data && data.key && "value" in data) {
        updatePublicEnv(data.key, data.value);
      }
    });

    eventSource.onerror = (err) => {
      consecutiveFailures++;
      const verdict = classifySseError({
        readyState: eventSource?.readyState ?? null,
        teardown: tearingDown,
        consecutiveFailures,
      });
      if (verdict.level === "silent") return;

      const message = "[GlobalSettings] SSE Connection error";
      // Recoverable stream interruption — warn, never error (the reconnect path
      // below is the real handling; the E2E console guard treats error as fatal).
      logger.warn(message, { attempt: consecutiveFailures, error: err });

      if (!verdict.reconnect) return;

      // The browser gave up (readyState CLOSED) or the reconnect kept failing.
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    };
  } catch (err) {
    logger.error("[GlobalSettings] Failed to initialize SSE", err);
  }
}

/**
 * Rebuilds the stream after a real failure, with growing backoff.
 * Never re-arms after a teardown, and never stacks a second timer.
 */
function scheduleReconnect() {
  if (!isBrowser || tearingDown || retryTimer) return;

  const delay = SSE_RECONNECT_BASE_MS * Math.min(consecutiveFailures, 5);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!tearingDown) startListening();
  }, delay);
}

/**
 * Stops listening without logging: an aborted stream on page teardown is expected, so it
 * must not be reported as a connection error. `startListening()` may run again afterwards.
 */
export function stopListening() {
  tearingDown = true;
  consecutiveFailures = 0;

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/**
 * Get a specific public environment setting.
 * @param key - The setting key
 * @param fallback - Optional fallback value
 */
export function getPublicSetting<K extends keyof PublicEnv>(
  key: K,
  fallback?: PublicEnv[K],
): PublicEnv[K] | undefined {
  return getStore().state[key] ?? fallback;
}

/**
 * Get the current public environment state.
 */
export function getPublicEnv(): PublicEnv {
  return getStore().state;
}

/**
 * Direct export of reactive state as publicEnv for backward compatibility.
 * NOTE: For Bun tests, we use a proxy to ensure the singleton is initialized on first access.
 */
export const publicEnv: PublicEnv = new Proxy({} as PublicEnv, {
  get: (_, prop) => {
    return (getStore().state as any)[prop];
  },
  set: (_, prop, value) => {
    getStore().update(prop as any, value);
    return true;
  },
  ownKeys: () => {
    return Reflect.ownKeys(getStore().state);
  },
  getOwnPropertyDescriptor: (_, prop) => {
    return Reflect.getOwnPropertyDescriptor(getStore().state, prop);
  },
});

// A navigation tears the page down while the stream is open. Flag it before the browser
// aborts the connection, so the resulting error is not reported as a failure.
if (isBrowser) {
  window.addEventListener("pagehide", () => stopListening());
  // Restored from the back/forward cache: resume listening without logging anything.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) startListening();
  });
}
