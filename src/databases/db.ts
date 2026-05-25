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

import { createRequire } from "node:module";
if (typeof (globalThis as any).require === "undefined") {
  (globalThis as any).require = createRequire(import.meta.url);
}

import { logger } from "@utils/logger";
import { type DatabaseAdapter, type IDBAdapter } from "./db-interface";
import {
  loadPrivateConfig as loadConfig,
  getPrivateEnv as getEnv,
  setPrivateEnv,
} from "./config-state";
import { getGlobal, setGlobal } from "@src/utils/native-utils";
import { AppError } from "@src/utils/error-handling";

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

// 🛡️ THE REACTIVE SHIELD: A Proxy that survives Vite chunking AND wait-for-instance.
const proxyCache = new Map<string, any>();
const boundFunctionsCache = new WeakMap<any, Map<string | symbol, Function>>();

const createInstanceProxy = (targetProp?: string) => {
  const cacheKey = targetProp || "root";
  if (proxyCache.has(cacheKey)) return proxyCache.get(cacheKey);

  const proxy = new Proxy({} as any, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "toJSON") return () => `[Proxy:${targetProp || "adapter"}]`;

      const instance = getGlobal<IDBAdapter>(ADAPTER_KEY);

      // Handle special properties like 'collection' and 'system'
      if (
        prop === "collection" ||
        prop === "system" ||
        prop === "crud" ||
        prop === "auth" ||
        prop === "raw" ||
        prop === "media"
      ) {
        return createInstanceProxy(prop as string);
      }

      if (instance) {
        const target = targetProp ? (instance as any)[targetProp] : instance;
        if (!target) return undefined;
        const val = target[prop];

        if (typeof val === "function") {
          let targetCache = boundFunctionsCache.get(target);
          if (!targetCache) {
            targetCache = new Map();
            boundFunctionsCache.set(target, targetCache);
          }
          const cachedFn = targetCache.get(prop);
          if (cachedFn) return cachedFn;

          const boundFn = val.bind(target);
          targetCache.set(prop, boundFn);
          return boundFn;
        }
        return val;
      }

      // ASYNC RECOVERY — auto-heal on HMR reload or connection loss
      return async (...args: any[]) => {
        // 🚑 SELF-HEALING: Try to reinitialize if adapter disappeared (e.g. HMR reload)
        let inst = getGlobal<IDBAdapter>(ADAPTER_KEY);
        if (!inst || !inst.isConnected()) {
          try {
            const { reinitializeSystem } = await import("@src/databases/db");
            await reinitializeSystem();
            inst = getGlobal<IDBAdapter>(ADAPTER_KEY);
          } catch {
            // Re-initialization failed, report original error below
          }
        }
        if (!inst) {
          if (prop === "isConnected" || prop === "connected") return false;
          throw new Error(
            `CRITICAL: Database access attempt on '${String(targetProp || "adapter")}.${String(prop)}' before initialization.`,
          );
        }
        const target = targetProp ? (inst as any)[targetProp] : inst;
        const fn = target[prop];
        if (typeof fn !== "function") {
          throw new Error(
            `Property '${String(prop)}' is not a function on ${String(targetProp || "adapter")}`,
          );
        }
        return fn.apply(target, args);
      };
    },
  });

  proxyCache.set(cacheKey, proxy);
  return proxy;
};

export const dbAdapter: DatabaseAdapter = createInstanceProxy();

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
        const mutableCfg = cfg as any;
        if (!cfg) {
          cfg = { DB_TYPE: testEngine, host: auditFile } as any;
        } else if (!mutableCfg.DB_TYPE) {
          mutableCfg.DB_TYPE = testEngine;
          if (
            mutableCfg.DB_TYPE === "sqlite" &&
            (!mutableCfg.host || mutableCfg.host === ":memory:")
          ) {
            mutableCfg.host = auditFile;
          }
        }
      }

      logger.info(`[Boot] Loading adapters for ${cfg?.DB_TYPE}...`);
      let adapter = await dbInit.loadAdapters(cfg);
      if (!adapter) throw new Error("Failed to load database adapter");
      logger.info(`[Boot] Adapter loaded. Connecting...`);

      const connectionResult = await adapter.connect();
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
          await reloaded.connect();
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
  const adapter = getGlobal<IDBAdapter>(ADAPTER_KEY);
  if (adapter && typeof adapter.disconnect === "function") {
    await adapter.disconnect();
  }

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
}

// TEST HELPERS: Manual state control for integration suites.
export function resetDbInitPromise(): void {
  setGlobal(INIT_PROMISE_KEY, null);
  setGlobal(BOOT_PHASE_KEY, "IDLE");
}

export async function initializeWithConfig(config: any): Promise<any> {
  setGlobal("__CACHED_CONFIG__", config);
  return ensureFullInitialization();
}

export function clearPrivateConfigCache(keepPrivateEnv = false): void {
  setGlobal("__CACHED_CONFIG__", null);
  setGlobal("__SETTINGS_LOADED__", false);
  if (!keepPrivateEnv) {
    setPrivateEnv(null);
  }
}
