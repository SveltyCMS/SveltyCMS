/**
 * @file src/databases/resilience-integration.ts
 * @description End-to-end wiring for DatabaseResilience — boot retries, adapter hooks, system status.
 *
 * ### Features:
 * - connectDatabaseWithResilience() for idempotent adapter.connect()
 * - bindAdapterResilienceHooks() for MongoDB / MariaDB / PostgreSQL disconnect events
 * - getSystemStatus() unified health + metrics surface
 * - debounced attemptReconnection() on connection loss
 */

import type { IDBAdapter } from "./db-interface";
import {
  getDatabaseResilience,
  notifyAdminsOfDatabaseFailure,
  type ConnectionPoolDiagnostics,
  type ResilienceMetrics,
} from "./database-resilience";
import { getSystemState, updateServiceHealth } from "@src/stores/system/state.svelte.ts";
import { logger } from "@utils/logger";

const boundAdapters = new WeakSet<object>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectInFlight = false;

export interface SystemStatus {
  health: {
    healthy: boolean;
    latency: number;
    message: string;
  };
  metrics: ResilienceMetrics;
  pool?: ConnectionPoolDiagnostics;
  system: ReturnType<typeof getSystemState>;
  database: {
    connected: boolean;
    type: string;
  };
  uptime: number;
  timestamp: number;
}

async function pingAdapter(adapter: IDBAdapter): Promise<number> {
  const start = performance.now();
  if (!adapter.isConnected()) {
    throw new Error("Database adapter is not connected");
  }

  const type = String((adapter as any).type || "").toLowerCase();

  if (type === "mongodb") {
    const conn = (adapter as any)._connection || (adapter as any).connection;
    if (conn?.db) await conn.db.admin().command({ ping: 1 });
  } else if (type === "postgresql" && (adapter as any).sql) {
    await (adapter as any).sql`SELECT 1`;
  } else if ((type === "mariadb" || type === "mysql") && (adapter as any).pool) {
    await (adapter as any).pool.query("SELECT 1");
  } else if (type === "sqlite" && (adapter as any)._sqlite) {
    (adapter as any)._sqlite.prepare("SELECT 1").get();
  }

  return Math.round(performance.now() - start);
}

/**
 * Connect adapter with retry + circuit breaker, then bind disconnect hooks.
 */
export async function connectDatabaseWithResilience(
  adapter: IDBAdapter,
  operationName = "Database Connection",
): Promise<{ success: boolean; message?: string }> {
  const resilience = getDatabaseResilience();

  try {
    await resilience.executeWithRetry(
      async () => {
        const result = await (adapter as any).connect();
        if (!result.success) {
          throw new Error(result.message || result.error?.message || "Database connection failed");
        }
      },
      operationName,
      undefined,
    );

    bindAdapterResilienceHooks(adapter);
    updateServiceHealth("database", "healthy", "Database connected");
    return { success: true };
  } catch (err: any) {
    const message = err?.message || "Database connection failed";
    updateServiceHealth("database", "unhealthy", message);
    return { success: false, message };
  }
}

/**
 * Debounced self-healing reconnection after adapter disconnect events.
 */
export function scheduleAdapterReconnection(adapter: IDBAdapter, reason: string): void {
  if (reconnectInFlight) return;

  (adapter as any).connected = false;
  updateServiceHealth("database", "unhealthy", reason);
  logger.warn(`[Resilience] Scheduling reconnection: ${reason}`);

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    void runAdapterReconnection(adapter, reason);
  }, 1500);
}

async function runAdapterReconnection(adapter: IDBAdapter, reason: string): Promise<void> {
  if (reconnectInFlight) return;
  reconnectInFlight = true;

  try {
    const resilience = getDatabaseResilience();
    const ok = await resilience.attemptReconnection(
      async () => {
        const result = await (adapter as any).connect();
        if (!result.success) {
          throw new Error(result.message || result.error?.message || "Reconnect failed");
        }
        bindAdapterResilienceHooks(adapter);
      },
      async (error) => notifyAdminsOfDatabaseFailure(error, resilience.getMetrics()),
    );

    if (ok) {
      logger.info(`[Resilience] Reconnected after: ${reason}`);
    }
  } finally {
    reconnectInFlight = false;
  }
}

/**
 * Attach engine-native disconnect / error listeners (idempotent per adapter instance).
 */
export function bindAdapterResilienceHooks(adapter: IDBAdapter): void {
  if (boundAdapters.has(adapter as object)) return;
  boundAdapters.add(adapter as object);

  const type = String((adapter as any).type || process.env.DB_TYPE || "").toLowerCase();

  if (type === "mongodb") {
    const conn = (adapter as any)._connection || (adapter as any).connection;
    if (conn?.on) {
      conn.on("disconnected", () => scheduleAdapterReconnection(adapter, "mongodb:disconnected"));
      conn.on("error", (err: Error) => {
        logger.warn("[Resilience] MongoDB connection error", {
          message: err.message,
        });
        if (!adapter.isConnected()) {
          scheduleAdapterReconnection(adapter, "mongodb:error");
        }
      });
      conn.on("connected", () => {
        updateServiceHealth("database", "healthy", "MongoDB connection restored");
      });
    }
    return;
  }

  if (type === "mariadb" || type === "mysql") {
    const pool = (adapter as any).pool;
    if (pool?.on) {
      pool.on("error", (err: Error) => {
        scheduleAdapterReconnection(adapter, `mariadb:pool-error:${err.message}`);
      });
    }
    return;
  }

  if (type === "postgresql") {
    // onclose is registered during connect() in postgres adapter-core
    return;
  }

  // SQLite: file-based — no persistent disconnect events; proxy + boot retry cover recovery
}

/** Callback ref for PostgreSQL postgres.js onclose (registered at connect time). */
export function createPostgresOnCloseHandler(adapter: IDBAdapter): () => void {
  return () => scheduleAdapterReconnection(adapter, "postgresql:connection-closed");
}

/**
 * Unified system status for dashboards, alerts, and `/api/database/status`.
 */
export async function getSystemStatus(adapter?: IDBAdapter | null): Promise<SystemStatus> {
  const resilience = getDatabaseResilience();
  const db = adapter ?? (await import("./db")).getDb();

  const health = await resilience.healthCheck(async () => {
    if (!db) throw new Error("Database adapter unavailable");
    return pingAdapter(db);
  });

  let pool: ConnectionPoolDiagnostics | undefined;
  try {
    pool = await resilience.getPoolDiagnostics();
  } catch {
    pool = undefined;
  }

  return {
    health,
    metrics: resilience.getMetrics(),
    pool,
    system: getSystemState(),
    database: {
      connected: !!db?.isConnected(),
      type: String((db as any)?.type || process.env.DB_TYPE || "unknown"),
    },
    uptime: process.uptime(),
    timestamp: Date.now(),
  };
}
