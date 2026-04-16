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

export function getBootPhase() {
  return "FULL";
}
export { getPrivateEnv, loadPrivateConfig };

export function isDbConnected(): boolean {
  return isConnected;
}

export async function initializeSystem(forceReload = false): Promise<void> {
  try {
    const config = await loadPrivateConfig(forceReload);
    if (!config?.DB_TYPE) {
      logger.debug("[db] Skipping heavy init (no config)");
      return;
    }

    if (!forceReload && getDb() && isConnected) return;

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
    }
  } catch (err) {
    logger.error("[db] System initialization failed", err);
    if (process.env.NODE_ENV !== "test") throw err;
  }
}

// Singleton Promise for initialization
let _dbInitPromise = initializeSystem();

/**
 * Compatibility Export: can be used as a Promise OR called as a function
 */
export const dbInitPromise = Object.assign(
  (forceReload = false, _phase = "FULL") => {
    if (forceReload) _dbInitPromise = initializeSystem(true);
    return _dbInitPromise;
  },
  {
    then: (onfulfilled?: any, onrejected?: any) => _dbInitPromise.then(onfulfilled, onrejected),
    catch: (onrejected?: any) => _dbInitPromise.catch(onrejected),
    finally: (onfinally?: any) => _dbInitPromise.finally(onfinally),
  },
) as any;

export function getDbInitPromise(forceReload = false, phase = "FULL") {
  return dbInitPromise(forceReload, phase);
}

export function getDb(): DatabaseAdapter | null {
  const adapter = (process as any)[ADAPTER_KEY] || dbAdapter;

  if (!adapter && typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    // CRITICAL: If adapter is null in production, it might be a race or lost state.
    // Since initializeSystem uses a singleton promise, this is safe to call.
    initializeSystem(false);
  }

  return adapter;
}

export async function ensureFullInitialization(forceReload = false): Promise<void> {
  await getDbInitPromise(forceReload);
  const adapter = getDb();
  if (adapter) {
    const { runBackgroundTasks } = await import("./db-init");
    await runBackgroundTasks(adapter);
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
  _dbInitPromise = initializeSystem(true);
}

export async function reinitializeSystem(force: boolean = true): Promise<any> {
  return ensureFullInitialization(force);
}
