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
 * - settings-cache warming for API-only cold boots
 */

import { logger } from "@utils/logger";
import { type ConnectionPoolOptions, type DatabaseAdapter, type IDBAdapter } from "./db-interface";
import {
  parseDbReplicasEnv,
  type DbReplicaTarget,
  type ReadReplicaConfig,
  type ReplicaRouterAdapter,
  type ReplicaStats,
} from "./core/replica-router";
import {
  loadPrivateConfig as loadConfig,
  getPrivateEnv as getEnv,
  setPrivateEnv,
  clearPrivateConfigCache as clearConfigStateCache,
} from "./config-state";
import { getGlobal, setGlobal } from "@src/utils/native-utils";
import { AppError } from "@src/utils/error-handling";
import { createSelfHealingProxy } from "./core/proxy-utils";
import { setSystemState } from "@src/stores/system/state.svelte.ts";

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

const ADAPTER_KEY = "__DB_ADAPTER_INSTANCE__";
const INIT_PROMISE_KEY = "__DB_INIT_PROMISE__";
const AUTH_KEY = "__AUTH_INSTANCE__";
const BOOT_PHASE_KEY = "__BOOT_PHASE__";
const REPLICA_ROUTER_KEY = "__DB_REPLICA_ROUTER__";

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

/**
 * Active read-replica router adapter (Option 4), or null when `DB_REPLICAS` is
 * not configured. Consumers route reads through this adapter to benefit from
 * replica pooling + Read-Your-Writes consistency; mutations stay on the primary.
 */
export function getReplicaRouter(): ReplicaRouterAdapter | null {
  return getGlobal<ReplicaRouterAdapter | null>(REPLICA_ROUTER_KEY, null);
}

/** Live replica-routing diagnostics, or null when the router is disabled. */
export function getReplicaStats(): ReplicaStats | null {
  return getReplicaRouter()?.getReplicaStats() ?? null;
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
    get(_target: any, prop: string) {
      const instance = getGlobal(AUTH_KEY);
      if (!instance) return undefined;
      const val = (instance as Record<string, any>)[prop];
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
let _resilienceIntegration: any = null;

// Demo cleanup interval reference (for shutdown)
let _demoCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the demo tenant cleanup scheduler.
 * Runs every 5 minutes, only when DEMO mode is enabled.
 */
function startDemoCleanupScheduler() {
  if (_demoCleanupInterval) return; // Already running

  const env = getEnv();
  const isDemoEnv = process.env.SVELTYCMS_DEMO === "true";
  const isDemo = isDemoEnv || env?.DEMO === true;

  if (!isDemo) {
    logger.debug("[Demo Cleanup] DEMO mode not enabled, skipping scheduler.");
    return;
  }

  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  logger.info("[Demo Cleanup] Starting cleanup scheduler (every 5 minutes).");

  _demoCleanupInterval = setInterval(async () => {
    try {
      const { cleanupExpiredDemoTenants } = await import("@src/utils/demo-cleanup");
      await cleanupExpiredDemoTenants();
    } catch (err) {
      logger.error("[Demo Cleanup] Scheduler error:", err);
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the event loop to exit (don't keep the process alive for cleanup alone)
  if (
    _demoCleanupInterval &&
    typeof _demoCleanupInterval === "object" &&
    "unref" in _demoCleanupInterval
  ) {
    _demoCleanupInterval.unref();
  }
}

/**
 * Stops the demo cleanup scheduler (called during shutdown).
 */
function stopDemoCleanupScheduler() {
  if (_demoCleanupInterval) {
    clearInterval(_demoCleanupInterval);
    _demoCleanupInterval = null;
    logger.debug("[Demo Cleanup] Scheduler stopped.");
  }
}

async function getDbInit() {
  if (!_dbInit) {
    _dbInit = await import("./db-init");
  }
  return _dbInit;
}

async function getResilienceIntegration() {
  if (!_resilienceIntegration) {
    _resilienceIntegration = await import("./resilience-integration");
  }
  return _resilienceIntegration;
}

/**
 * Fail-closed tenant isolation for a freshly constructed adapter (primary and
 * replicas): wraps crud (tenant guard + short-lived count cache) and the domain
 * namespaces so plugins/widgets cannot run unscoped. Replicas receive the same
 * guard as the primary so replica-routed reads stay tenant-scoped.
 */
async function applyTenantIsolationGuards(adapter: IDBAdapter): Promise<void> {
  try {
    const { createTenantGuardedCrud, createTenantGuardedNamespace } =
      await import("./crud-tenant-guard");
    const { createCountCachedCrud } = await import("./core/cache-module");
    const originalCrud = adapter.crud;
    // Tenant guard first (fail-closed), then short-lived count cache (equal on all DBs).
    (adapter as any).crud = createCountCachedCrud(createTenantGuardedCrud(originalCrud, "reject"));

    for (const ns of ["auth", "content", "media", "collection", "system"] as const) {
      const original = (adapter as any)[ns];
      if (original && typeof original === "object") {
        const guarded = createTenantGuardedNamespace(original, "reject", ns);
        // Some adapters define namespaces as getter-only properties.
        // Use defineProperty to handle both writable and getter-only cases.
        try {
          (adapter as any)[ns] = guarded;
        } catch {
          try {
            Object.defineProperty(adapter, ns, {
              value: guarded,
              writable: true,
              configurable: true,
              enumerable: true,
            });
          } catch {
            // Keep original; tenant guard won't wrap this namespace
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`[Boot] Tenant guard not applied (non-fatal): ${e}`);
  }
}

/** Subset of the private DB config the read-replica bootstrap consumes. */
export interface ReplicaBootConfig {
  DB_TYPE?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  replicaSettings?: ReadReplicaConfig;
}

/**
 * Option 4 boot wiring: constructs one tenant-guarded adapter per validated
 * `DB_REPLICAS` target, connects each to its own host:port, pre-warms its pool,
 * then wraps the already-connected primary in a ReplicaRouterAdapter (RYW
 * watermark + circuit breaker live in core/replica-router).
 *
 * Fails open: replicas that cannot be constructed or connected are skipped with
 * a warning; with zero healthy replicas no router is created and the primary
 * keeps serving all traffic. On success the router is exposed through the
 * REPLICA_ROUTER_KEY global (see getReplicaRouter()).
 */
export async function bootstrapReplicaRouter(
  primary: IDBAdapter,
  targets: DbReplicaTarget[],
  cfg: ReplicaBootConfig | null,
): Promise<ReplicaRouterAdapter | null> {
  const dbInit = await getDbInit();
  const { preWarmConnectionPool } = await import("@src/databases/database-resilience");

  const replicas: IDBAdapter[] = [];
  for (const target of targets) {
    const label = `${target.host}:${target.port}`;
    try {
      // Reuse the centralized adapter factory with the replica's host:port.
      // readReplicas: [] keeps the factory from recursing into DB_READ_REPLICAS.
      const replica = await dbInit.loadAdapters({
        ...cfg,
        host: target.host,
        port: target.port,
        DB_HOST: target.host,
        DB_PORT: target.port,
        readReplicas: [],
      });
      if (!replica) {
        throw new Error("adapter factory returned no instance");
      }

      await applyTenantIsolationGuards(replica);

      // Explicit connection options — the global connection string always points
      // at the primary, so each replica must receive its own host:port.
      const result = await replica.connect({
        host: target.host,
        port: target.port,
        user: cfg?.DB_USER,
        password: cfg?.DB_PASSWORD,
        database: cfg?.DB_NAME,
      } as unknown as ConnectionPoolOptions);
      if (!result.success) {
        throw new Error(result.message || "replica connection failed");
      }

      await preWarmConnectionPool(replica).catch((err) => {
        logger.debug(
          `[Boot] Read replica ${label} pool pre-warm non-fatal: ${(err as Error).message}`,
        );
      });

      replicas.push(replica);
      logger.info(`[Boot] Read replica connected: ${label}`);
    } catch (err) {
      logger.warn(`[Boot] Read replica ${label} unavailable — skipped: ${(err as Error).message}`);
    }
  }

  if (replicas.length === 0) {
    logger.warn(
      `[Boot] DB_REPLICAS listed ${targets.length} target(s) but none connected — read-replica routing stays disabled and the primary serves all traffic.`,
    );
    setGlobal(REPLICA_ROUTER_KEY, null);
    return null;
  }

  const { createReplicaRouterAdapter } = await import("./core/replica-router");
  const router = createReplicaRouterAdapter(primary, replicas, cfg?.replicaSettings);
  setGlobal(REPLICA_ROUTER_KEY, router);
  logger.info(
    `[Boot] Read-replica router enabled: ${replicas.length}/${targets.length} replica(s) serving reads.`,
  );
  return router as ReplicaRouterAdapter;
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

      // 🛡️ STATE VALIDATION (Pillar 1 Focus): Fail fast before loading adapters.
      // CORRUPT_CONFIG is a test/diagnostic gate for controlled MISSING_CONFIG.
      if (process.env.CORRUPT_CONFIG === "true") {
        throw new AppError(
          "Database configuration is corrupted or missing.",
          500,
          "MISSING_CONFIG",
        );
      }

      const dbInit = await getDbInit();
      let cfg = await loadConfig();
      setGlobal("__CACHED_CONFIG__", cfg);

      if (
        process.env.TEST_MODE === "true" ||
        process.env.VITEST === "true" ||
        process.env.BUN_TEST === "true"
      ) {
        const testEngine = process.env.DATABASE_ENGINE || process.env.DB_TYPE || "sqlite";
        logger.info(`[Boot] Test mode detected. Forcing engine: ${testEngine}`);

        // 🚀 INTEGRATION BRIDGE: Use physical file to share data between seeder and server
        const auditFile = "./config/test-database/integration_audit.sqlite";
        // Clone cfg so we can mutate it (config may be frozen/readonly)
        let mutableCfg: any = cfg ? Object.assign({}, cfg) : null;
        if (!cfg) {
          cfg = { DB_TYPE: testEngine, host: auditFile } as any;
          mutableCfg = cfg as any;
        } else {
          mutableCfg.DB_TYPE = testEngine;
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

      logger.info(
        cfg?.DB_TYPE
          ? `[Boot] Loading the ${cfg.DB_TYPE} adapter...`
          : "[Boot] No database configured yet — loading adapters in setup mode...",
      );
      let adapter = await dbInit.loadAdapters(cfg);
      if (!adapter) throw new Error("Failed to load database adapter");
      logger.info(`[Boot] Adapter loaded. Connecting...`);

      // 🛡️ Fail-closed tenant guard (MULTI_TENANT): never invent tenantId="global".
      // Wraps crud + domain namespaces so plugins/widgets cannot run unscoped.
      // Single-tenant / benchmarks: guard returns inner adapter directly (zero overhead).
      await applyTenantIsolationGuards(adapter);

      const { connectDatabaseWithResilience } = await getResilienceIntegration();
      const connectionResult = await connectDatabaseWithResilience(
        adapter,
        `Database Boot (${cfg?.DB_TYPE || "unknown"})`,
      );
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
            await getResilienceIntegration();
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

      // 🚀 Pre-warm the DB connection pool (networked adapters) so the first
      // request never pays cold connection setup. Awaited before system READY;
      // SQLite no-ops immediately. Non-fatal on timeout/error.
      await import("@src/databases/database-resilience")
        .then(({ preWarmConnectionPool }) => preWarmConnectionPool(adapter))
        .catch((err) => {
          logger.debug(
            `[Boot] Connection pool pre-warm non-fatal failure: ${(err as Error).message}`,
          );
        });

      // 🚀 Statement warm-up (PostgreSQL): cross the planner's custom-plan
      // window (5 executions) before traffic arrives so fresh pools and
      // post-idle reconnects serve generic plans from the first request.
      // Env-gated per adapter (SVELTY_PG_STATEMENT_WARMUP); non-fatal.
      if (
        typeof (adapter as { warmPreparedStatements?: () => Promise<void> })
          .warmPreparedStatements === "function"
      ) {
        await (adapter as { warmPreparedStatements: () => Promise<void> })
          .warmPreparedStatements()
          .catch((err) => {
            logger.debug(`[Boot] Statement warm-up non-fatal failure: ${(err as Error).message}`);
          });
      }

      const authInstance = (adapter as any).authService;
      setGlobal(AUTH_KEY, authInstance);

      // 🚀 READ-REPLICA ROUTER (Option 4): DB_REPLICAS="host:port,..." boot wiring.
      // Default-off: without DB_REPLICAS this block performs no work — the boot path
      // behaves exactly like a single-primary deployment (no router constructed, no
      // extra queries). With a non-empty parseable list, each target becomes a
      // tenant-guarded replica adapter connected to its own host:port; the
      // ReplicaRouterAdapter (RYW watermark + circuit breaker) wraps the connected
      // primary and is exposed via getReplicaRouter().
      const replicaTargets = parseDbReplicasEnv(process.env.DB_REPLICAS);
      if (replicaTargets.length > 0) {
        const engineType = String(
          (adapter as { type?: string }).type || cfg?.DB_TYPE || "sqlite",
        ).toLowerCase();
        if (engineType === "sqlite") {
          logger.warn(
            "[Boot] DB_REPLICAS is set but the active engine is SQLite — read replicas apply to networked databases; ignoring DB_REPLICAS.",
          );
        } else {
          await bootstrapReplicaRouter(
            adapter,
            replicaTargets,
            cfg as unknown as ReplicaBootConfig | null,
          );
        }
      }

      // 🚀 WARM SETTINGS CACHE (API-only cold boot): eagerly load the global
      // settings cache so synchronous getters (getPrivateSettingSync, e.g.
      // JWT_SECRET_KEY) return real values on the very first API request —
      // without waiting for a page load or WebSocket upgrade. Placed BEFORE
      // BOOT_PHASE becomes READY: loadSettingsCache re-enters
      // ensureFullInitialization internally, and the INITIALIZING fast-path
      // (deadlock protection) resolves immediately instead of awaiting this
      // in-flight promise. Dynamic import avoids a static db ↔ settings-service
      // cycle. Non-fatal on failure — the next settings load retries.
      await loadSettingsServiceModule()
        .then(({ loadSettingsCache }) => loadSettingsCache())
        .catch((err) => {
          logger.warn(`[Boot] Settings cache warm failed (non-fatal): ${(err as Error).message}`);
        });

      setGlobal(BOOT_PHASE_KEY, "READY");
      // Synchronize the reactive state machine so handleSystemState unblocks immediately
      setSystemState("READY");
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

      // Start demo tenant cleanup scheduler (fire-and-forget, only in DEMO mode)
      startDemoCleanupScheduler();

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

  // Stop demo cleanup scheduler
  stopDemoCleanupScheduler();

  // Stop the DatabaseResilience health monitor so its 30s poll can neither keep
  // the event loop alive on Ctrl+C nor hit a disconnected adapter during teardown.
  const { stopDatabaseResilienceMonitor } = await import("./database-resilience");
  stopDatabaseResilienceMonitor();

  // 🚀 HARDENING: Clear registries and promises
  const { dbPluginRegistry } = await import("./db-init");
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

  // The settings cache may hold a pre-setup snapshot (e.g. merged from the
  // config file before env overrides were applied). Drop it so the next read
  // rebuilds from the freshly reloaded config — otherwise sync getters such as
  // getPrivateSettingSync("PREVIEW_SECRET") keep serving stale empties.
  await loadSettingsServiceModule()
    .then(({ invalidateSettingsCache }) => invalidateSettingsCache())
    .catch(() => {});

  await shutdownSystem();
  const result = await ensureFullInitialization();

  // Eagerly rebuild the in-memory settings cache from the fresh config + DB
  // rows so synchronous getters (getPrivateSettingSync) see env-merged values
  // (e.g. PREVIEW_SECRET) immediately — without waiting for the next page load
  // to detect the config-stamp mismatch. Setup completion is the last moment
  // where the private config is replaced, so warm it before returning.
  await loadSettingsServiceModule()
    .then(({ loadSettingsCache }) => loadSettingsCache())
    .catch((err) => {
      logger.debug("Settings cache warm failed after reinit", { error: (err as Error).message });
    });

  return result;
}

export function clearPrivateConfigCache(keepPrivateEnv = false): void {
  setGlobal("__CACHED_CONFIG__", null);
  setGlobal("__SETTINGS_LOADED__", false);
  clearConfigStateCache(keepPrivateEnv);
}
