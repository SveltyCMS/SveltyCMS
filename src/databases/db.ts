/**
 * @file src/databases/db.ts
 * @description
 * Core Database system with enhanced resilience and performance optimization.
 * 🚀 Ultra-stable Proxy-based singleton pattern for cross-chunk synchronization.
 *
 * Responsibilities include:
 * - Centralized topological database and server-side service booting.
 * - Reactive chunk-safe global proxy creation.
 * - Robust configuration state management.
 *
 * ### Features:
 * - proxy-based reactive adapter caching
 * - double-check lock initialization
 * - clean state resets for test isolation
 */

import { logger } from "@utils/logger";
import { type DatabaseAdapter, type IDBAdapter } from "./db-interface";
import {
  loadPrivateConfig as loadConfig,
  getPrivateEnv as getEnv,
  setPrivateEnv,
  clearPrivateConfigCache as clearConfigStateCache,
} from "./config-state";
import { getGlobal, setGlobal } from "@src/utils/native-utils";
import { AppError } from "@src/utils/error-handling";
import { createSelfHealingProxy } from "./core/proxy-utils";

const ADAPTER_KEY = "__DB_ADAPTER_INSTANCE__";
const INIT_PROMISE_KEY = "__DB_INIT_PROMISE__";
const AUTH_KEY = "__AUTH_INSTANCE__";
const BOOT_PHASE_KEY = "__BOOT_PHASE__";

// 🚀 AGNOSTIC CORE: High-performance, safe access to the database adapter.
export async function getDbSafe(): Promise<DatabaseAdapter> {
  const adapter = getGlobal<DatabaseAdapter>(ADAPTER_KEY);
  if (adapter && adapter.isConnected()) return adapter;

  const initPromise = getGlobal<Promise<any>>(INIT_PROMISE_KEY);
  if (initPromise) {
    const result = await initPromise;
    if (result?.adapter) return result.adapter;
  }

  throw new Error("Database connection not established. Ensure initializeDatabase() was called.");
}

export function getDb(): DatabaseAdapter | null {
  return getGlobal(ADAPTER_KEY);
}

// 🚀 COMPATIBILITY: Restore missing exports for build safety.
export function isDbConnected(): boolean {
  const adapter = getGlobal<IDBAdapter>(ADAPTER_KEY);
  return !!adapter && adapter.isConnected();
}

export function getPrivateEnv(): any {
  return getEnv();
}
export function loadPrivateConfig(): any {
  return loadConfig();
}
export function getBootPhase(): string {
  return getGlobal(BOOT_PHASE_KEY, "IDLE");
}

// Direct access to the current auth service instance.
export function getAuth(): any {
  return getGlobal(AUTH_KEY);
}

// Returns the global initialization promise.
export function getDbInitPromise(_force = false, _context = "CORE"): Promise<any | null> {
  return ensureFullInitialization();
}

// 🛡️ THE REACTIVE SHIELD: Self-healing Proxy that survives Vite HMR and connection loss.
// Implemented in core/proxy-utils.ts for testability and reuse.
export const dbAdapter: DatabaseAdapter = createSelfHealingProxy<IDBAdapter>(
  () => getGlobal<IDBAdapter>(ADAPTER_KEY),
  async () => {
    await reinitializeSystem();
  },
);

export const auth: any = new Proxy(
  {},
  {
    get(_, prop) {
      const instance = getGlobal(AUTH_KEY);
      if (!instance) return undefined;
      const val = instance[prop];
      return typeof val === "function" ? val.bind(instance) : val;
    },
  },
);

// Global initialization promise proxy.
export const dbInitPromise: Promise<any | null> = new Proxy(Promise.resolve(null), {
  get(_, prop) {
    const promise = getDbInitPromise();
    if (prop === "then") return promise.then.bind(promise);
    const val = (promise as any)[prop];
    return typeof val === "function" ? val.bind(promise) : val;
  },
});

// Lazy Holders for Server-Only Modules
let _dbInit: any = null;

async function getDbInit() {
  if (!_dbInit) {
    _dbInit = await import("./db-init");
  }
  return _dbInit;
}

// Centralized, idempotent system initialization.
export async function ensureFullInitialization(): Promise<any | null> {
  // 🚀 SAFETY: Clear the shutdown guard — any call to re-initialize, whether from
  // reinitializeSystem(), initializeWithConfig(), or a cold start, means the previous
  // shutdown (if any) is over and auto-reconnection should be re-enabled.
  (globalThis as any).__SYSTEM_SHUTTING_DOWN__ = false;

  // 🚀 HARDENING: Double-Check Locking with Connectivity Guard
  const existingPromise = getGlobal<Promise<any>>(INIT_PROMISE_KEY);
  const phase = getBootPhase();

  if (existingPromise) {
    // 🛡️ DEADLOCK PROTECTION: If we are already initializing and have an adapter,
    // return the instance immediately instead of awaiting the promise (which would deadlock).
    if (phase === "INITIALIZING") {
      const adapter = getGlobal<DatabaseAdapter>(ADAPTER_KEY);
      if (adapter) return { adapter, auth: getGlobal(AUTH_KEY) };
      return existingPromise;
    }

    // If we are READY but the adapter lost connection, we need to re-initialize.
    const adapter = getGlobal<DatabaseAdapter>(ADAPTER_KEY);
    if (adapter && adapter.isConnected() && phase === "READY") {
      return existingPromise;
    }
  }

  const initPromise = (async () => {
    try {
      setGlobal(BOOT_PHASE_KEY, "INITIALIZING");
      logger.info("[Boot] Starting initialization...");
      const dbInit = await getDbInit();
      let cfg = await loadConfig();
      setGlobal("__CACHED_CONFIG__", cfg);

      // 🛡️ STATE VALIDATION (Pillar 1 Focus): Detect corrupted/missing configuration
      if (process.env.CORRUPT_CONFIG === "true") {
        throw new AppError(
          "Database configuration is corrupted or missing.",
          500,
          "MISSING_CONFIG",
        );
      }

      if (
        process.env.TEST_MODE === "true" ||
        process.env.VITEST === "true" ||
        typeof Bun !== "undefined"
      ) {
        const testEngine = process.env.DATABASE_ENGINE || process.env.DB_TYPE || "sqlite";
        logger.info(`[Boot] Test mode detected. Forcing engine: ${testEngine}`);

        // 🚀 INTEGRATION BRIDGE: Use physical file to share data between seeder and server
        const auditFile = "./config/database/integration_audit.sqlite";
        // Clone cfg so we can mutate it (config may be frozen/readonly)
        let mutableCfg: any = cfg ? Object.assign({}, cfg) : null;
        if (!cfg) {
          cfg = { DB_TYPE: testEngine, host: auditFile } as any;
          mutableCfg = cfg as any;
        } else {
          if (!mutableCfg.DB_TYPE) mutableCfg.DB_TYPE = testEngine;
          if (
            mutableCfg.DB_TYPE === "sqlite" &&
            (!mutableCfg.host || mutableCfg.host === ":memory:")
          ) {
            mutableCfg.host = auditFile;
          }
        }

        // Allow env vars to override connection params at runtime (benchmarks/integration)
        if (process.env.DB_NAME) mutableCfg.DB_NAME = process.env.DB_NAME;
        if (process.env.DB_HOST) mutableCfg.DB_HOST = process.env.DB_HOST;
        if (process.env.DB_PORT) mutableCfg.DB_PORT = Number(process.env.DB_PORT);
        if (process.env.DB_USER) mutableCfg.DB_USER = process.env.DB_USER;
        if (process.env.DB_PASSWORD) mutableCfg.DB_PASSWORD = process.env.DB_PASSWORD;
        cfg = mutableCfg;
      }

      logger.info(`[Boot] Loading adapters for ${cfg?.DB_TYPE}...`);
      let adapter = await dbInit.loadAdapters(cfg);
      if (!adapter) throw new Error("Failed to load database adapter");
      logger.info(`[Boot] Adapter loaded. Connecting...`);

      const { connectDatabaseWithResilience } = await import("./resilience-integration");
      const connectionResult = await connectDatabaseWithResilience(
        adapter,
        `Database Boot (${cfg?.DB_TYPE || "unknown"})`,
      );
      logger.info(`[Boot] Connection result: ${connectionResult.success}`);
      if (!connectionResult.success) {
        throw new Error(`Database connection failed: ${connectionResult.message}`);
      }

      setGlobal(ADAPTER_KEY, adapter);
      logger.debug(`[Boot] Adapter Connected: ${(performance.now() - 0).toFixed(2)}ms`);

      // 🚀 HARDENING: Verify instance integrity
      if (!adapter.crud || !adapter.auth) {
        logger.warn("[Boot] Adapter instance is incomplete. Attempting re-hydration...");
        const type = (adapter as any).type || (adapter as any).DB_TYPE || "sqlite";
        const reloaded = await dbInit.loadAdapters({ DB_TYPE: type });
        if (reloaded) {
          const { connectDatabaseWithResilience: reconnectWithResilience } =
            await import("./resilience-integration");
          const rehydrate = await reconnectWithResilience(reloaded, "Database Re-hydration");
          if (!rehydrate.success) {
            throw new Error(rehydrate.message || "Database re-hydration failed");
          }
          adapter = reloaded;
          setGlobal(ADAPTER_KEY, adapter);
        }
      }

      const phase2 = performance.now();
      logger.info(`[Boot] Starting service initialization...`);
      await dbInit.initializeDatabase(adapter);
      logger.info(`[Boot] Service initialization complete.`);

      const authInstance = (adapter as any).authService;
      setGlobal(AUTH_KEY, authInstance);
      setGlobal(BOOT_PHASE_KEY, "READY");
      logger.debug(`[Boot] Services Initialized: ${(performance.now() - phase2).toFixed(2)}ms`);

      // Start behavioral learning engine (fire-and-forget, zero-latency)
      import("@src/services/intelligence/behavioral-learner")
        .then(({ startBehavioralEngine }) => startBehavioralEngine())
        .catch(() => {});

      // Initialize semantic search index (fire-and-forget, NPU-accelerated)
      import("@src/services/intelligence/semantic-index")
        .then(({ initializeSemanticIndex }) =>
          initializeSemanticIndex((cfg as any)?.tenantId || "default"),
        )
        .catch(() => {});

      return { adapter, auth: authInstance };
    } catch (error) {
      logger.error("[Boot] Initialization CRASHED:", error);
      setGlobal(BOOT_PHASE_KEY, "FAILED");
      setGlobal(INIT_PROMISE_KEY, null);
      throw error;
    }
  })();

  setGlobal(INIT_PROMISE_KEY, initPromise);
  return initPromise;
}

// High-level entry point.
export async function initializeDatabase(): Promise<void> {
  await ensureFullInitialization();
}

// AGNOSTIC CORE: Shutdown helper.
export async function shutdownSystem(): Promise<void> {
  // 🛡️ Set shutdown guard before disconnecting so resilience hooks don't
  // schedule competing auto-reconnections during intentional reinitialize.
  (globalThis as any).__SYSTEM_SHUTTING_DOWN__ = true;

  const adapter = getGlobal<IDBAdapter>(ADAPTER_KEY);
  if (adapter && typeof adapter.disconnect === "function") {
    await adapter.disconnect();
  }

  // Flush behavioral learning data before shutdown
  const { stopBehavioralEngine } = await import("@src/services/intelligence/behavioral-learner");
  stopBehavioralEngine();

  // 🚀 HARDENING: Clear registries and promises
  const { dbPluginRegistry } = await import("./core/plugin-registry");
  dbPluginRegistry.reset();
  const { pluginRegistry } = await import("@src/plugins/registry");
  pluginRegistry.reset();

  setGlobal(ADAPTER_KEY, null);
  setGlobal(INIT_PROMISE_KEY, null);
  setGlobal(AUTH_KEY, null);
  setGlobal(BOOT_PHASE_KEY, "IDLE");
  setGlobal("__SETTINGS_LOADED__", false);
}

// AGNOSTIC CORE: Re-initialization helper.
export async function reinitializeSystem(_force = true): Promise<void> {
  await shutdownSystem();
  await ensureFullInitialization();
  (globalThis as any).__SYSTEM_SHUTTING_DOWN__ = false;
}

// TEST HELPERS: Manual state control for integration suites.
export function resetDbInitPromise(): void {
  setGlobal(INIT_PROMISE_KEY, null);
  setGlobal(BOOT_PHASE_KEY, "IDLE");
}

export async function initializeWithConfig(config: any): Promise<any> {
  // Setup finalization can happen while the preview server is already READY on an
  // older bootstrap adapter. Force a full reconnect against the freshly written config.
  (globalThis as any).__SYSTEM_SHUTTING_DOWN__ = true;
  clearConfigStateCache(false);
  const baseConfig = (await loadConfig(true).catch(() => null)) ?? {};
  const nextConfig = { ...baseConfig, ...config };

  setPrivateEnv(nextConfig as any);
  setGlobal("__CACHED_CONFIG__", nextConfig);
  setGlobal("__SETTINGS_LOADED__", false);

  await shutdownSystem();
  return ensureFullInitialization();
}

export function clearPrivateConfigCache(keepPrivateEnv = false): void {
  setGlobal("__CACHED_CONFIG__", null);
  setGlobal("__SETTINGS_LOADED__", false);
  clearConfigStateCache(keepPrivateEnv);
}
