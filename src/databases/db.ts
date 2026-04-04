/**
 * @file src/databases/db.ts
 * @description
 * High-performance lightweight entry point for SveltyCMS Database system.
 * Optimized for minimal module count and rapid cold-starts.
 */

import { logger } from "@utils/logger";
import { setSystemState, updateServiceHealth } from "@src/stores/system/state";
import {
  clearPrivateConfigCache,
  getDatabaseConnectionString,
  getPrivateEnv,
  loadPrivateConfig,
  privateEnv,
  setPrivateEnv,
} from "./config-state";

// Auth interface type (for lightweight export)
import type { Auth as AuthType } from "@src/databases/auth";
import type { DatabaseAdapter } from "./db-interface";

export {
  clearPrivateConfigCache,
  getDatabaseConnectionString,
  getPrivateEnv,
  loadPrivateConfig,
  privateEnv,
  setPrivateEnv,
};

// Global State
export let dbAdapter: DatabaseAdapter | null = null;
export let auth: AuthType | null = null;
export let isConnected = false;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Public API to get the database instance.
 */
export function getDb(): DatabaseAdapter | null {
  return dbAdapter;
}

/**
 * Public API to get the auth instance.
 */
export function getAuth(): AuthType | null {
  return auth;
}

/**
 * Public API to reset the database system (used in setup/tests).
 */
export function resetDbInitPromise() {
  logger.warn("Resetting DB initialization system...");
  initializationPromise = null;
  isInitialized = false;
  isConnected = false;
  dbAdapter = null;
  auth = null;
}

/**
 * Initialization entry point.
 */
export function getDbInitPromise(forceInit = false): Promise<void> {
  if (!initializationPromise || forceInit) {
    initializationPromise = initializeSystem(forceInit);
  }
  return initializationPromise;
}

export const dbInitPromise = getDbInitPromise();

/**
 * Core lazy-loader for system initialization.
 */
async function initializeSystem(forceReload = false): Promise<void> {
  // Guard for non-server environments (build/check) or explicit skip
  if (
    typeof process !== "undefined" &&
    (process.env.SVELTYCMS_SKIP_INIT === "true" ||
      process.argv?.some((arg) => ["build", "check", "vp"].includes(arg.toLowerCase())) ||
      process.env.VITE ||
      process.env.BUILDING)
  ) {
    return;
  }
  if (isInitialized && !forceReload) return;

  const start = performance.now();
  setSystemState("INITIALIZING", "Loading database configuration");

  try {
    const config = await loadPrivateConfig(forceReload);

    if (!config?.DB_TYPE) {
      logger.info("Database not configured - entering setup mode.");
      setSystemState("IDLE", "Awaiting configuration");
      return;
    }

    // Lazy load the heavy initialization logic
    const { loadAdapters, loadSettingsFromDB, initializeCriticalServices, runBackgroundTasks } =
      await import("./db-init");

    // 1. Load Adapters
    updateServiceHealth("database", "initializing", "Loading adapter...");
    dbAdapter = await loadAdapters(config);
    if (!dbAdapter) throw new Error("Failed to load database adapter");

    // 2. Connect
    const connectionString = getDatabaseConnectionString();
    const connectionResult = await dbAdapter.connect(connectionString);
    if (!connectionResult.success) {
      updateServiceHealth("database", "unhealthy", connectionResult.error?.message);
      throw new Error(`Database connection failed: ${connectionResult.error?.message}`);
    }

    isConnected = true;
    updateServiceHealth("database", "healthy", "Database connected");

    // 3. Critical Services (Auth, Settings)
    await loadSettingsFromDB(dbAdapter, true);
    auth = await initializeCriticalServices(dbAdapter);

    // 4. Mark Ready
    isInitialized = true;
    setSystemState("READY", "Core services initialized");

    logger.info(`✅ System core ready in ${(performance.now() - start).toFixed(2)}ms`);

    // 5. Background Tasks (Non-blocking)
    void runBackgroundTasks(dbAdapter);
  } catch (error) {
    isInitialized = false;
    isConnected = false;
    setSystemState(
      "FAILED",
      error instanceof Error ? error.message : "Database initialization error",
    );
    throw error;
  }
}

/**
 * Re-initializes the system with a specific configuration.
 */
export async function reinitializeSystem(force: boolean = true) {
  clearPrivateConfigCache();
  resetDbInitPromise();
  return getDbInitPromise(force);
}

/**
 * Legacy wrapper for Setup Wizard
 */
export async function initializeWithConfig(config: any) {
  setPrivateEnv(config);
  return getDbInitPromise(true);
}

/**
 * Legacy wrapper for settings load
 */
export async function loadSettingsFromDB(criticalOnly = false): Promise<boolean> {
  if (!dbAdapter) return false;
  const { loadSettingsFromDB: coreLoad } = await import("./db-init");
  return coreLoad(dbAdapter, criticalOnly);
}
