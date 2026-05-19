/**
 * @file src/databases/sqlite/adapter/adapter-core.ts
 * @description Core functionality for SQLite adapter, optimized for performance and Windows resilience.
 */

import { logger } from "@utils/logger";
import { BaseSqlAdapter } from "../core/base-sql-adapter";
import {
  type BaseEntity,
  type BaseQueryOptions,
  type DatabaseCapabilities,
  type DatabaseResult,
} from "../db-interface";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";
import { sql, type SQL } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import * as utils from "../core/relational-utils";
import { SQLiteQueryBuilder } from "./sq-lite-query-builder";
import { TransactionModule } from "./transaction-module";

// --- Types ---
export type SQLiteConfig = { connectionString?: string; readonly?: boolean };
export type SQLiteClient = any; // Union of bun:sqlite Database, better-sqlite3 Database, node:sqlite DatabaseSync
export type SQLiteDB = any; // Drizzle instance

// Isolation for multi-threaded testing
const testWorkerContext = new AsyncLocalStorage<string>();

/**
 * 🚀 PERFORMANCE: Lightweight Re-entrant Mutex for serializing database writes.
 * Uses AsyncLocalStorage to allow the same execution context to re-acquire the lock.
 */
class Mutex {
  private queue: Promise<void> = Promise.resolve();
  private storage = new AsyncLocalStorage<boolean>();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    // If we already hold the lock in this context, just execute
    if (this.storage.getStore()) {
      return await fn();
    }

    const current = this.queue;
    let resolveNext: () => void;
    this.queue = new Promise((res) => {
      resolveNext = res;
    });

    try {
      await current;
      return await this.storage.run(true, fn);
    } finally {
      resolveNext!();
    }
  }
}

export abstract class SQLiteAdapterCore extends BaseSqlAdapter {
  public static readonly writeMutex = new Mutex();
  public readonly schema = schema;

  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: false,
    supportsAggregation: true,
    supportsStreaming: false,
    supportsPartitioning: false,
    maxBatchSize: 100,
    maxQueryComplexity: 50,
  };

  // 🚀 AGNOSTIC CORE: SQLite implementation of JSON field extraction.
  public getJsonField(field: string): SQL {
    // Correct SQLite JSON path syntax: '$."field"'
    // We explicitly quote the field inside the path to handle keywords.
    return sql`json_extract(data, '$."' || ${field} || '"')`;
  }

  // 🚀 AGNOSTIC CORE: Reports the current connection state and checks if the SQLite client is responsive.
  public async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
  > {
    const start = performance.now();
    try {
      if (!this._sqlite) {
        return {
          success: true,
          data: { healthy: false, latency: 0, activeConnections: 0 },
        };
      }

      // 🚀  Advanced PRAGMAs for benchmark stability and performance
      this.applyPragmas(this._sqlite);

      // Ping check
      if (this._sqlite.query) {
        this._sqlite.query("SELECT 1").get();
      } else if (this._sqlite.prepare) {
        this._sqlite.prepare("SELECT 1").get();
      } else if (typeof this._sqlite.exec === "function") {
        this._sqlite.exec("SELECT 1");
      }

      return {
        success: true,
        data: {
          healthy: true,
          latency: performance.now() - start,
          activeConnections: 1,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message,
        error: utils.createDatabaseError("HEALTH_CHECK_FAILED", e.message, e),
      };
    }
  }

  public override async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    options?: any,
  ): Promise<DatabaseResult<T>> {
    // 🚀 SERIALIZE: SQLite is a single-writer database.
    // If this is a write operation and not already in a transaction (which has its own mutex),
    // we MUST use the global write mutex to prevent 'database is locked' errors.
    if (options?.isWrite && !options?.transaction) {
      return SQLiteAdapterCore.writeMutex.runExclusive(() =>
        super.wrap(fn, code, message, options),
      );
    }
    return super.wrap(fn, code, message, options);
  }

  // 🚀 AGNOSTIC CORE: Resolves a collection name to its Drizzle schema object.
  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;

    // 1. O(1) Centralized Resolution (gets physical name like 'workflow_definitions')
    const physicalName = this.resolveSystemTableName(collection);

    // 2. Direct physical name check
    if (schemaAny[physicalName]) return schemaAny[physicalName];

    // 3. Normalized CamelCase check (e.g. 'workflow_definitions' -> 'workflowDefinitions')
    // This is where most system tables live in the Drizzle schema export
    const camelName = physicalName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    if (schemaAny[camelName]) return schemaAny[camelName];

    // 🛡️ HARDENING: Explicit fallback for workflow tables if naming normalization fails
    if (physicalName.includes("workflow_definitions") && schemaAny.workflowDefinitions)
      return schemaAny.workflowDefinitions;
    if (physicalName.includes("workflow_instances") && schemaAny.workflowInstances)
      return schemaAny.workflowInstances;

    // 4. Final fallback: try raw collection name
    if (schemaAny[collection]) return schemaAny[collection];

    return null;
  }

  protected getDrizzleInstance(_options?: BaseQueryOptions): SQLiteDB {
    return this._db!;
  }

  public createDynamicTableDefinition(name: string) {
    // 🚀 HARDENING: Standardize dynamic columns to ensure text columns like '_id'
    // are physically selectable in all drivers (especially Bun).
    const columns = {
      _id: text("_id").primaryKey().notNull(),
      tenantId: text("tenantId"),
      data: text("data").notNull().default("{}"),
      status: text("status").notNull().default("draft"),
      isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
      createdAt: integer("createdAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)`),
      updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)`),
    };

    return sqliteTable(name, columns, (t) => ({
      tenantIdx: index(`${name}_tenant_idx`).on(t.tenantId),
      statusIdx: index(`${name}_status_idx`).on(t.status),
      updatedIdx: index(`${name}_updated_idx`).on(t.updatedAt),
    }));
  }

  protected _sqlite: SQLiteClient | null = null;
  protected _db: SQLiteDB | null = null;
  protected connections = new Map<
    string,
    { sqlite: SQLiteClient; db: SQLiteDB; statementCache: Map<string, any> }
  >();
  protected _statementCache = new Map<string, any>();

  protected state: "idle" | "connecting" | "connected" | "closing" | "closed" = "idle";
  protected config: string | SQLiteConfig = "";

  public get sqlite(): SQLiteClient {
    if (!this._sqlite) {
      throw new Error(`[SQLite] Database client not initialized (state: ${this.state})`);
    }
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(worker);
      if (conn) return conn.sqlite;
    }
    return this._sqlite;
  }

  // 🚀 AGNOSTIC CORE: Returns the raw database client.
  public getClient(): SQLiteClient {
    return this.sqlite;
  }

  public get db(): SQLiteDB {
    if (!this.isConnected()) {
      const worker = testWorkerContext.getStore();
      if (!(worker && process.env.TEST_MODE === "true")) {
        throw new Error(`[SQLite] Database connection not established (state: ${this.state})`);
      }
    }
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(worker);
      if (conn) return conn.db;

      // 🛡️ RACE CONDITION GUARD: If worker is set but connection not yet initialized,
      // fallback to main DB but warn. This prevents hard crashes during rapid test re-seeds.
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.warn(
          `[SQLite] Test worker ${worker} requested DB but connection not ready. Falling back.`,
        );
      }
      return this._db!;
    }
    return this._db!;
  }

  /* ------------------------------------------------ */
  /* CONNECT                                          */
  /* ------------------------------------------------ */

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(
    config?: string | SQLiteConfig | import("../db-interface").ConnectionPoolOptions,
    _options?: any,
  ): Promise<DatabaseResult<void>> {
    let finalConfig = config;

    if (!finalConfig) {
      const { getDatabaseConnectionString } = await import("../config-state");
      finalConfig = getDatabaseConnectionString() as string;
    }

    if (this.state === "connected") {
      // Robust check: if path changed, we should reconnect
      const currentPath = await this.resolvePath(this.config as any);
      const newPath = await this.resolvePath(finalConfig as any);
      if (currentPath === newPath) {
        return { success: true, data: undefined };
      }
      await this.disconnect();
    }

    this.state = "connecting";

    try {
      this.config = finalConfig as any;
      const dbPath = await this.resolvePath(finalConfig as any);
      const { sqlite, db } = await this.createDriver(dbPath);

      this._sqlite = sqlite;
      this._db = db;

      // 🚀 Performance: Apply pragmas immediately to the raw client
      this.applyPragmas(sqlite);
      this._statementCache.clear();

      this.state = "connected";
      this.metrics.queryCount = 0; // Reset metrics on new connection
      this.metrics.errorCount = 0;

      // Silent connection by default in core
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info(`[SQLite] Connected -> ${dbPath}`);
      }
      this.connected = true;
      return { success: true, data: undefined };
    } catch (error) {
      this.state = "idle";
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  /* ------------------------------------------------ */
  /* PROVISIONING (Standalone Mode Support)           */
  /* ------------------------------------------------ */

  protected _provisioned = false;
  protected _provisionPromise: Promise<void> | null = null;

  public override async provision() {
    if (this._provisioned) return;
    if (this._provisionPromise) return this._provisionPromise;

    this._provisionPromise = (async () => {
      try {
        // @ts-ignore - Dynamic import to avoid circular dependency
        const { runMigrations } = await import("./migrations");
        await runMigrations(this._sqlite);
        this._provisioned = true;
      } catch (err: any) {
        logger.error(`[SQLite] Provisioning failed: ${err.message}`);
        this._provisionPromise = null; // Allow retry on failure
        throw err;
      }
    })();

    return this._provisionPromise;
  }

  public async ensureAuth() {
    await this.provision();
  }
  public async ensureSystem() {
    await this.provision();
  }
  public async ensureMedia() {
    await this.provision();
  }
  public async ensureContent() {
    await this.provision();
  }
  public async ensureMonitoring() {
    await this.provision();
  }
  public async ensureCollections() {
    await this.provision();
  }

  public async waitForConnection(): Promise<void> {
    if (this.isConnected()) return;
    // Simple polling wait for connection
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.isConnected() || Date.now() - start > 10000) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  public queryBuilder<_T extends BaseEntity>(collection: string): any {
    return new SQLiteQueryBuilder(this as any, collection);
  }

  public async transaction<T>(
    fn: (transaction: import("../db-interface").DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string },
  ): Promise<DatabaseResult<T>> {
    const module = new TransactionModule(this as any);
    return module.execute(fn, options as any);
  }

  /* ------------------------------------------------ */
  /* DISCONNECT                                       */
  /* ------------------------------------------------ */

  public async disconnect(): Promise<DatabaseResult<void>> {
    try {
      this.state = "closing";
      this._statementCache.clear();
      this._sqlite?.close();

      for (const conn of this.connections.values()) {
        conn.statementCache.clear();
        conn.sqlite.close();
      }

      this.connections.clear();
      this.state = "closed";
      if (this.connected) {
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info("[SQLite] Disconnected");
        }
        this.connected = false;
      }
      return { success: true, data: undefined };
    } catch (error) {
      return this.handleError(error, "DISCONNECT_FAILED");
    }
  }

  /* ------------------------------------------------ */
  /* WORKER TEST CONNECTION                           */
  /* ------------------------------------------------ */

  public async initWorkerConnection(index: string): Promise<void> {
    if (this.connections.has(index)) return;

    const path = await import("node:path");
    const base = await this.resolvePath(this.config);
    const ext = path.extname(base);
    const workerPath = base.replace(ext, `_test_${index}${ext}`);

    const { sqlite, db } = await this.createDriver(workerPath);
    this.applyPragmas(sqlite);
    this.connections.set(index, { sqlite, db, statementCache: new Map() });
  }

  public runInWorkerContext<T>(index: string, fn: () => T): T {
    return testWorkerContext.run(index, fn);
  }

  /* ------------------------------------------------ */
  /* CAPABILITIES                                     */
  /* ------------------------------------------------ */

  public isConnected(): boolean {
    return this.connected && this._sqlite !== null;
  }

  public async isEmpty(): Promise<DatabaseResult<boolean>> {
    return this.wrap(async () => {
      const tables = this.prepareAndExecute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        "all",
      );
      return tables.length === 0;
    }, "CHECK_EMPTY_FAILED");
  }

  public async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      const row = this.prepareAndExecute("SELECT sqlite_version() as version", "get");
      return row.version as string;
    }, "GET_VERSION_FAILED");
  }

  /* ------------------------------------------------ */
  /* INTERNALS                                        */
  /* ------------------------------------------------ */

  // High-performance execution helper that abstracts away driver differences.
  protected prepareAndExecute(
    sqlText: string,
    method: "all" | "get" | "run" | "values" = "all",
    ...params: any[]
  ): any {
    const client = this.sqlite;

    // 🚀 Performance: Prepared Statement Caching
    let stmt = this._statementCache.get(sqlText);
    if (!stmt) {
      stmt = client.prepare(sqlText);
      // Cap cache size to 1000 to prevent memory exhaustion
      if (this._statementCache.size < 1000) {
        this._statementCache.set(sqlText, stmt);
      }
    }

    // 🚀 Metrics
    this.metrics.queryCount++;

    // Driver-specific execution
    try {
      if (method === "all") return stmt.all(...params);
      if (method === "get") return stmt.get(...params);
      if (method === "run") return stmt.run(...params);
      if (method === "values") return stmt.values(...params);
      return stmt.all(...params);
    } catch (err: any) {
      logger.error(`[SQLite] Execution error: ${sqlText}`, err);
      throw err;
    }
  }

  private async createDriver(dbPath: string) {
    const versions = (process as any)?.versions || {};
    const isBun = typeof Bun !== "undefined";
    const nodeVersion = versions.node;

    // 🚀 WINDOWS OPTIMIZATION: bun:sqlite on Windows can fail with SQLITE_MISUSE (21)
    // if given absolute paths with drive letters in certain formats.
    // Converting to a relative path or ensuring forward slashes fixes this.
    let normalizedPath = dbPath.replace(/\\/g, "/");
    if (process.platform === "win32") {
      const root = process.cwd().replace(/\\/g, "/").toLowerCase();
      const normLower = normalizedPath.toLowerCase();

      if (normLower.startsWith(root)) {
        normalizedPath = normalizedPath.substring(root.length).replace(/^\//, "");
      } else if (normalizedPath.includes(":/") && !normalizedPath.startsWith("file:")) {
        // Absolute path on Windows but not in CWD, use file URI
        normalizedPath = `file:///${normalizedPath}`;
      }
    }

    // ALWAYS log this to server-debug.log for diagnosis
    logger.info(`[SQLite] Opening database at: ${normalizedPath} (Original: ${dbPath})`);

    const readonly = (this.config as SQLiteConfig)?.readonly || dbPath.includes("mode=ro") || false;
    const options = readonly ? { readonly } : {};

    // 🚀 If in Bun, use Bun's native driver exclusively.
    if (isBun) {
      try {
        const driverName = "bun" + ":sqlite";
        const { Database } = await import(/* @vite-ignore */ driverName);
        logger.debug(`[SQLite] Bun detected. Attempting to use native 'bun:sqlite'...`);

        // 🚀 WINDOWS RESILIENCE: Retry on "SQLITE_MISUSE" or "busy" which often indicates
        // a transient file lock or path access issue on Windows.
        let sqlite: any;
        let lastErr: any;
        for (let i = 0; i < 10; i++) {
          try {
            // On Windows, sometimes file:/// is needed, sometimes not.
            // We'll try the normalizedPath first, then raw dbPath.
            const target = i >= 3 ? dbPath.replace(/\\/g, "/") : normalizedPath;

            if (Object.keys(options).length > 0) {
              sqlite = new Database(target, options);
            } else {
              sqlite = new Database(target);
            }
            break;
          } catch (e: any) {
            lastErr = e;
            const isRetryable =
              e.message?.includes("misuse") ||
              e.message?.includes("busy") ||
              e.code === "SQLITE_MISUSE" ||
              e.errno === 21;

            if (process.platform === "win32" && isRetryable) {
              await new Promise((r) => setTimeout(r, 250 * (i + 1)));
              continue;
            }
            throw e;
          }
        }
        if (!sqlite) throw lastErr;

        const { drizzle } = await import(/* @vite-ignore */ "drizzle-orm/bun-sqlite");
        const db = drizzle(sqlite as any, { schema }) as SQLiteDB;

        // 🚀 AGNOSTIC SILENCE: Only log success once per process to keep benchmarks clean
        if (!(globalThis as any).__SQLITE_DRIVER_LOGGED__) {
          logger.info(`[SQLite] 🚀 SUCCESS: Using high-performance 'bun:sqlite' driver.`);
          (globalThis as any).__SQLITE_DRIVER_LOGGED__ = true;
        }

        return { sqlite, db };
      } catch (e: any) {
        logger.warn(`[SQLite] ⚠️ Bun driver probe failed: ${e.message}. Falling back...`);

        // 🚀 WINDOWS OPTIMIZATION: On Windows Bun, if bun:sqlite fails,
        // we likely have a serious environment issue. better-sqlite3 is
        // even more likely to fail due to native bindings.
        if (process.platform === "win32") {
          const isMisuse =
            e.message?.includes("misuse") || e.code === "SQLITE_MISUSE" || e.errno === 21;

          if (isMisuse && process.env.BENCHMARK_DEBUG !== "true") {
            // Silently continue to fallbacks if misuse (expected in some path formats)
          } else {
            logger.error(`[SQLite] Native 'bun:sqlite' failed on Windows: ${e.message}`);
          }

          // Don't fall through to better-sqlite3 on Windows Bun to avoid extreme noise
          // unless explicitly requested via an environment variable.
          if (process.env.FORCE_SQLITE_FALLBACK !== "true") throw e;
        }
      }
    }

    try {
      // 🔌 NODE FALLBACK 1: Try better-sqlite3 (Legacy Node)
      const req = await getRequire();
      if (req) {
        // Suppress noisy binding errors on Windows if we're just checking drivers
        try {
          const sqlite = req("better-sqlite3")(normalizedPath, options);
          const { drizzle } = await import("drizzle-orm/better-sqlite3");
          const db = drizzle(sqlite, { schema });
          logger.info(`[SQLite] Using 'better-sqlite3' driver.`);
          return { sqlite, db };
        } catch (bindingError: any) {
          if (process.platform === "win32" && bindingError.message.includes("bindings")) {
            throw new Error("BETTER_SQLITE3_BINDINGS_MISSING");
          }
          throw bindingError;
        }
      } else {
        throw new Error("requireFunc not available for better-sqlite3");
      }
    } catch (e: any) {
      // If we're on Windows and it's just missing bindings, log a concise warning instead of a stack trace
      if (e.message === "BETTER_SQLITE3_BINDINGS_MISSING") {
        logger.debug(
          "[SQLite] better-sqlite3 bindings missing (Expected on Windows without build tools).",
        );
      } else {
        logger.debug(`[SQLite] better-sqlite3 fallback failed: ${e.message}`);
      }

      // 🔌 NODE FALLBACK 2: Try native node:sqlite (Node 22.5+) via shim
      if (nodeVersion) {
        const v = nodeVersion.replace("v", "");
        const [major, minor] = v.split(".").map(Number);

        if (major > 22 || (major === 22 && minor >= 5)) {
          try {
            const req = await getRequire();
            if (!req) throw new Error("requireFunc not available for node:sqlite");
            const { DatabaseSync } = req("node:sqlite");
            // 🚀 WINDOWS HARDENING: Use normalized path (absolute/file URI) for native driver
            const sqlite = new DatabaseSync(normalizedPath);

            // 🚀 PERFORMANCE: Apply all pragmas (including mmap_size for Windows) to the proxy driver
            this.applyPragmas({
              exec: (cmd: string) => sqlite.exec(cmd),
            });

            // 🚀 Shim node:sqlite using drizzle-orm/sqlite-proxy
            const { drizzle: proxyDrizzle } = await import("drizzle-orm/sqlite-proxy");

            const db = proxyDrizzle(
              async (sqlText, params = [], method) => {
                const serializedParams = (params || []).map((p) => {
                  if (typeof p === "boolean") return p ? 1 : 0;
                  return p !== null && typeof p === "object" ? JSON.stringify(p) : p;
                });

                // 🚀 HARDENING: Detect transactions as writes to prevent mutex deadlocks
                const isWrite =
                  /^\s*(insert|update|delete|create|drop|alter|replace|begin|commit|rollback|savepoint)/i.test(
                    sqlText,
                  );

                const execute = async () => {
                  const stmt = sqlite.prepare(sqlText);

                  try {
                    if (method === "all") {
                      const result = stmt.all(...serializedParams);
                      const rows = (result || []).map((row: any) => Object.values(row));
                      return { rows };
                    } else if (method === "get") {
                      const result = stmt.get(...serializedParams);
                      const rows = result ? Object.values(result) : undefined;
                      return { rows };
                    } else if (method === "run") {
                      const result = stmt.run(...serializedParams);
                      return {
                        rows: [],
                        lastInsertRowid: result.lastInsertRowid,
                        changes: result.changes,
                      };
                    } else if (method === "values") {
                      const result = stmt.all(...serializedParams);
                      const rows = (result || []).map((row: any) => Object.values(row));
                      return { rows };
                    } else {
                      const result = stmt.run(...serializedParams);
                      return {
                        rows: [],
                        lastInsertRowid: result.lastInsertRowid,
                        changes: result.changes,
                      };
                    }
                  } catch (execErr: any) {
                    logger.error(
                      `[SQLite Proxy] Execution failed for ${method}: ${sqlText}`,
                      execErr,
                    );
                    throw execErr;
                  }
                };

                if (isWrite) {
                  return SQLiteAdapterCore.writeMutex.runExclusive(execute);
                }
                return execute();
              },
              { schema },
            );

            logger.info(`[SQLite] Using native 'node:sqlite' driver (Shimmed).`);
            return { sqlite: sqlite as any, db };
          } catch (nodeSqliteErr: any) {
            logger.error(`[SQLite] node:sqlite fallback failed: ${nodeSqliteErr.message}`);
          }
        }
      }

      throw new Error(
        `No compatible SQLite driver found. Tried bun:sqlite, better-sqlite3, and node:sqlite. Error: ${e.message}`,
      );
    }
  }

  private applyPragmas(client: SQLiteClient) {
    // Tuning - wrapped in try-catch to be safe
    const safeExec = (cmd: string) => {
      try {
        client.exec(cmd);
      } catch {
        // Only log on critical error
      }
    };

    safeExec("PRAGMA journal_mode=WAL");
    safeExec("PRAGMA synchronous=NORMAL");
    safeExec("PRAGMA foreign_keys=ON");
    safeExec("PRAGMA page_size=8192");
    safeExec("PRAGMA busy_timeout=30000");
    safeExec("PRAGMA temp_store=MEMORY");
    safeExec("PRAGMA mmap_size=536870912"); // Increased to 512MB for heavy sorts
    safeExec("PRAGMA cache_size=-128000"); // 128MB RAM cache
    safeExec("PRAGMA wal_autocheckpoint=1000");
  }

  public override get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        return this.prepareAndExecute(sqlText, "all", ...params);
      },
      client: this.sqlite,
    };
  }

  private async resolvePath(config: string | SQLiteConfig): Promise<string> {
    const path = await import("node:path");
    const fs = await import("node:fs");

    let dbPath = typeof config === "string" ? config : config.connectionString;

    if (!dbPath) {
      const { isSetupComplete } = await import("@utils/setup-check-fast");
      dbPath = process.env.DB_PATH || (isSetupComplete() ? "content/data.db" : ":memory:");
    }

    // 🚀 HARDENING: Don't treat URIs as local paths
    if (dbPath.includes("://")) {
      throw new Error(
        `Invalid SQLite path: '${dbPath}' looks like a URI. Check your DB configuration.`,
      );
    }

    // Handle standard relative paths
    if (dbPath !== ":memory:" && !path.isAbsolute(dbPath) && !dbPath.startsWith("file:")) {
      dbPath = path.resolve(process.cwd(), dbPath);
    }

    // Ensure directory exists
    const dir = path.dirname(dbPath.replace("file:///", ""));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dbPath;
  }
}

async function getRequire() {
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url);
  } catch {
    return null;
  }
}
