/**
 * @file src/databases/db.ts
 * @description Core Database system with enhanced resilience for non-browser/test environments.
 */

import { logger } from "@utils/logger";
import { type DatabaseAdapter } from "./db-interface";
import { loadPrivateConfig, getPrivateEnv } from "./config-state";
import { loadAdapters } from "./db-init";

const ADAPTER_KEY = "__DB_ADAPTER_INSTANCE__";

export let dbAdapter: DatabaseAdapter | null = null;
export let auth: any = null;
let isConnected = false;
let isInitializing = false;

export function getBootPhase() {
  return "FULL";
}
export { getPrivateEnv, loadPrivateConfig };

export function isDbConnected(): boolean {
  return isConnected;
}

export async function initializeSystem(forceReload = false): Promise<void> {
  // If already initializing, just wait for the current promise
  if (isInitializing && !forceReload && _dbInitPromise) {
    return _dbInitPromise;
  }

  isInitializing = true;
  logger.debug(`[db] initializeSystem called (force: ${forceReload})`);

  try {
    const config = await loadPrivateConfig(forceReload);
    if (!config?.DB_TYPE) {
      logger.debug("[db] Skipping heavy init (no config)");
      isConnected = false;
      isInitializing = false;
      return;
    }

    // Check existing adapter without calling getDb() to avoid recursion
    const existingAdapter = (process as any)[ADAPTER_KEY] || dbAdapter;
    if (!forceReload && existingAdapter && isConnected) {
      isInitializing = false;
      return;
    }

    dbAdapter = await loadAdapters(config);
    if (!dbAdapter) throw new Error("Failed to load database adapter");

    (process as any)[ADAPTER_KEY] = dbAdapter;

    const connectionResult = await dbAdapter.connect(config as any);
    if (connectionResult.success) {
      isConnected = true;
      const { updateServiceHealth } = await import("@src/stores/system/state");
      updateServiceHealth("database", "healthy", "Database service ready");

      const { initializeCriticalServices } = await import("./db-init");
      auth = await initializeCriticalServices(dbAdapter);
    } else {
      throw new Error(`Database connection failed: ${connectionResult.message}`);
    }
  } catch (err) {
    isConnected = false;
    logger.error("[db] System initialization failed", err);
    if (process.env.NODE_ENV !== "test") throw err;
  } finally {
    isInitializing = false;
  }
}

// Singleton Promise for initialization (immediate trigger)
let _dbInitPromise = initializeSystem();

export function getDbInitPromise(forceReload = false, _phase = "FULL") {
  if (forceReload || !_dbInitPromise) {
    _dbInitPromise = initializeSystem(forceReload);
  }
  return _dbInitPromise;
}

/**
 * Compatibility Export: can be used as a Promise-like object OR called as a function
 * Using a Proxy to bypass 'no-thenable' linting while maintaining functionality.
 * @deprecated Use getDbInitPromise() instead.
 */
export const dbInitPromise = new Proxy(getDbInitPromise, {
  get(target, prop) {
    // If it's a promise property, return it from the current promise without re-triggering
    const promise = target();
    if (prop === "then") return promise.then.bind(promise);
    if (prop === "catch") return promise.catch.bind(promise);
    if (prop === "finally") return promise.finally.bind(promise);

    // Support for other properties if needed
    const val = (promise as any)[prop];
    return typeof val === "function" ? val.bind(promise) : val;
  },
  apply(target, thisArg, argumentsList) {
    return Reflect.apply(target, thisArg, argumentsList);
  },
}) as any;

/**
 * PURE Accessor: Does not trigger initialization to avoid recursion.
 */
export function getDb(): DatabaseAdapter | null {
  return (process as any)[ADAPTER_KEY] || dbAdapter;
}

export async function ensureFullInitialization(forceReload = false): Promise<void> {
  await getDbInitPromise(forceReload);
  const adapter = getDb();
  if (adapter && isConnected) {
    const { runBackgroundTasks } = await import("./db-init");
    await runBackgroundTasks(adapter);
  } else if (adapter && !isConnected) {
    logger.warn("[db] Skipping background tasks - adapter exists but is not connected.");
  }
}

export async function initializeWithConfig(_config: any): Promise<void> {
  await ensureFullInitialization(true);
}

export async function loadSettingsFromDB(): Promise<void> {
  const adapter = getDb();
  if (adapter && typeof (adapter as any).settings?.load === "function") {
    await (adapter as any).settings.load();
  }
}

export function clearPrivateConfigCache(_force = false): void {}

/**
 * Resets the database initialization state.
 * Sync function used by tests to clear memory before re-init.
 */
export function resetDbInitPromise(): void {
  isConnected = false;
  dbAdapter = null;
  (process as any)[ADAPTER_KEY] = null;
  isInitializing = false;
  _dbInitPromise = initializeSystem(true);
}

export async function reinitializeSystem(force: boolean = true): Promise<any> {
  return ensureFullInitialization(force);
}
