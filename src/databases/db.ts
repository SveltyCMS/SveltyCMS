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

import { metricsService } from "@src/services/metrics-service";

// Global State
export let dbAdapter: DatabaseAdapter | null = null;
export let auth: AuthType | null = null;
export let isConnected = false;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Public getter for the current database adapter.
 */
export function getDb(): DatabaseAdapter | null {
  return dbAdapter;
}

/**
 * Public getter for the current authentication service.
 */
export function getAuth(): AuthType | null {
  return auth;
}

/**
 * Boot Phases for Intelligent Initialization
 * - SETUP: Database connection only (Wizard mode)
 * - CORE: Auth + Critical Settings (Login mode)
 * - FULL: Content + Widgets + Background Tasks (Dashboard mode)
 */
export type BootPhase = "SETUP" | "CORE" | "FULL";
let currentPhase: BootPhase | null = null;

/**
 * Public API to get the current boot phase.
 */
export function getBootPhase(): BootPhase | null {
  return currentPhase;
}

/**
 * Initialization entry point.
 */
export async function getDbInitPromise(
  forceInit = false,
  targetPhase: BootPhase = "FULL",
): Promise<void> {
  // If we are currently initializing, wait for it
  if (initializationPromise && !forceInit) {
    await initializationPromise;

    // Check if the completed initialization reached our target phase
    if (targetPhase === "SETUP" && currentPhase) return;
    if (targetPhase === "CORE" && (currentPhase === "CORE" || currentPhase === "FULL")) return;
    if (targetPhase === "FULL" && currentPhase === "FULL") return;

    // If not reached, fall through to trigger escalation
  }

  // If already initialized and phase reached, and not forcing, return
  if (isInitialized && !forceInit) {
    if (targetPhase === "SETUP" && currentPhase) return;
    if (targetPhase === "CORE" && (currentPhase === "CORE" || currentPhase === "FULL")) return;
    if (targetPhase === "FULL" && currentPhase === "FULL") return;
  }

  // Trigger or extend initialization
  initializationPromise = initializeSystem(forceInit, targetPhase);
  return initializationPromise;
}

export const dbInitPromise = getDbInitPromise();

/**
 * Core lazy-loader for system initialization.
 */
async function initializeSystem(
  forceReload = false,
  targetPhase: BootPhase = "FULL",
): Promise<void> {
  // Guard for non-server environments (build/check) or explicit skip
  const isChecking =
    typeof process !== "undefined" &&
    process.argv?.some((arg) => ["build", "check", "vp"].includes(arg.toLowerCase()));
  const isBuilding =
    typeof process !== "undefined" &&
    (process.env.BUILDING === "true" || process.env.VITE_BUILD === "true");
  const isExplicitSkip =
    typeof process !== "undefined" && process.env.SVELTYCMS_SKIP_INIT === "true";

  if (isExplicitSkip || isChecking || isBuilding) {
    return;
  }

  const start = performance.now();
  setSystemState("INITIALIZING", `Starting boot phase: ${targetPhase}`);

  try {
    const config = await loadPrivateConfig(forceReload);

    if (!config?.DB_TYPE) {
      logger.info("Database not configured - entering setup mode.");
      setSystemState("IDLE", "Awaiting configuration");
      currentPhase = "SETUP";
      return;
    }

    // Lazy load the heavy initialization logic
    const { loadAdapters, loadSettingsFromDB, initializeCriticalServices, runBackgroundTasks } =
      await import("./db-init");

    // PHASE 0: SETUP (Connection)
    if (!currentPhase || forceReload) {
      updateServiceHealth("database", "initializing", "Loading adapter...");
      dbAdapter = await loadAdapters(config);
      if (!dbAdapter) throw new Error("Failed to load database adapter");

      const connectionString = getDatabaseConnectionString();
      const connectionResult = await dbAdapter.connect(connectionString);
      if (!connectionResult.success) {
        updateServiceHealth("database", "unhealthy", connectionResult.error?.message);
        throw new Error(`Database connection failed: ${connectionResult.error?.message}`);
      }

      isConnected = true;
      currentPhase = "SETUP";
      updateServiceHealth("database", "healthy", "Database connected");
      metricsService.recordMetric("boot:phase:setup", performance.now() - start);
    }

    if (targetPhase === "SETUP") {
      setSystemState("SETUP", "Database connected (Setup Mode)");
      return;
    }

    // PHASE 1: CORE (Auth + Settings)
    if (currentPhase === "SETUP" || forceReload) {
      const phaseStart = performance.now();
      await loadSettingsFromDB(dbAdapter!, true);
      auth = await initializeCriticalServices(dbAdapter!);

      currentPhase = "CORE";
      metricsService.recordMetric("boot:phase:core", performance.now() - phaseStart);
    }

    if (targetPhase === "CORE") {
      isInitialized = true;
      setSystemState("READY", "Core services initialized (Login Mode)");
      return;
    }

    // PHASE 2: FULL (Content + Widgets + Background Tasks)
    if (currentPhase === "CORE" || forceReload) {
      const phaseStart = performance.now();
      // Non-blocking background tasks - now truly non-blocking for core ready
      void runBackgroundTasks(dbAdapter!);

      currentPhase = "FULL";
      isInitialized = true;
      metricsService.recordMetric("boot:phase:full", performance.now() - phaseStart);
    }

    setSystemState("WARMED", "Full system operational");
    logger.info(`✅ System ${targetPhase} ready in ${(performance.now() - start).toFixed(2)}ms`);
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
  if (force) {
    initializationPromise = null;
    isInitialized = false;
  }

  await getDbInitPromise(force);

  // Also reload settings from DB after initialization
  if (dbAdapter) {
    await loadSettingsFromDB(false);
  }

  return { status: "reinitialized" };
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
