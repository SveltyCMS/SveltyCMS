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
import type { InferOutput } from "valibot";

// Helper to safely get browser mode without crashing if $app/environment is missing (e.g. in some Bun test contexts)
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
};

/**
 * Internal state using Svelte 5 runes.
 * Using a singleton pattern with lazy initialization to support Bun tests (hoisting safety).
 */
class GlobalStore {
  private static instance: GlobalStore;
  state = $state<PublicEnv>({} as PublicEnv);
  isReady = $derived(Object.keys(this.state).length > 0);

  private constructor() {}

  public static getInstance(): GlobalStore {
    if (!GlobalStore.instance) {
      GlobalStore.instance = new GlobalStore();
    }
    return GlobalStore.instance;
  }

  update<K extends keyof PublicEnv>(key: K, value: PublicEnv[K]) {
    this.state[key] = value;
  }

  init(env: PublicEnv) {
    Object.assign(this.state, env);
  }
}

// Helper to access the store singleton
const getStore = () => GlobalStore.getInstance();

let eventSource: EventSource | null = null;

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

  try {
    eventSource = new EventSource("/api/content/events");

    eventSource.addEventListener("settings:update", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.key && "value" in data) {
          updatePublicEnv(data.key as keyof PublicEnv, data.value);
        }
      } catch (err) {
        logger.error("[GlobalSettings] Error parsing real-time update", err);
      }
    });

    eventSource.onerror = (err) => {
      logger.error("[GlobalSettings] SSE Connection error", err);
      eventSource?.close();
      eventSource = null;
      setTimeout(startListening, 5000);
    };
  } catch (err) {
    logger.error("[GlobalSettings] Failed to initialize SSE", err);
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
    (getStore().state as any)[prop] = value;
    return true;
  },
  ownKeys: () => {
    return Reflect.ownKeys(getStore().state);
  },
  getOwnPropertyDescriptor: (_, prop) => {
    return Reflect.getOwnPropertyDescriptor(getStore().state, prop);
  },
});
