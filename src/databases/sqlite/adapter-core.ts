/**
 * @file src/databases/sqlite/adapter/adapter-core.ts
 * @description SQLite Adapter Core
 *
 * Provides a high-performance core for SQLite operations, supporting Bun/Node
 * with statement caching, WAL tuning, and robust connection management.
 */

import { logger } from "@src/utils/logger";
import { testWorkerContext } from "@src/utils/test-worker-context";
import { sql } from "drizzle-orm";
import { Mutex } from "@src/utils/mutex";

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { DatabaseCapabilities, DatabaseResult } from "../db-interface";

import { BaseSqlAdapter } from "./base-sql-adapter";
import * as schema from "./schema";

/** 🚀 Helper to handle dynamic requires in ESM */
let _require: any = null;
async function getRequire() {
  if (_require) return _require;
  if (typeof require !== "undefined") {
    _require = require;
    return _require;
  }
  try {
    const { createRequire } = await import("module");
    _require = createRequire(import.meta.url);
    return _require;
  } catch {
    return null;
  }
}

type SQLiteDB = BaseSQLiteDatabase<"sync", unknown, typeof schema>;
type AdapterState = "idle" | "connecting" | "connected" | "closing" | "closed";

interface SQLiteConfig {
  connectionString?: string;
  filename?: string;
  DB_NAME?: string;
  DB_HOST?: string;
  readonly?: boolean;
}

interface SQLiteStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): unknown;
}

interface SQLiteClient {
  close(): void;
  exec(sql: string): void;
  query?(sql: string): SQLiteStatement;
  prepare?(sql: string): SQLiteStatement;
}

interface WorkerConnection {
  db: SQLiteDB;
  sqlite: SQLiteClient;
  statementCache: Map<string, SQLiteStatement>;
}

export abstract class AdapterCore extends BaseSqlAdapter {
  private _db!: SQLiteDB;
  private _sqlite!: SQLiteClient;
  private state: AdapterState = "idle";
  private config!: string | SQLiteConfig;
  private readonly connections = new Map<string, WorkerConnection>();

  protected _transactionModule?: import("./transaction-module").TransactionModule;

  //  Statement Cache (LRU-ish)
  private _statementCache = new Map<string, SQLiteStatement>();
  private readonly MAX_CACHE_SIZE = 200;
  private readonly columnNamesCache = new Map<string, Set<string>>();

  /**
   * 🛡️ WRITE SERIALIZATION (Mutex)
   * SQLite with a single connection (especially in Bun) performs best when writes
   * are serialized to avoid 'database is locked' errors and WAL contention.
   */
  public readonly writeMutex = new Mutex();

  protected metrics = {
    connectCount: 0,
    errorCount: 0,
    queryCount: 0,
    slowQueryCount: 0,
    lastLatency: 0,
    lastConnectedAt: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  /* ------------------------------------------------ */
  /* ACTIVE CONNECTION GETTERS                        */
  /* ------------------------------------------------ */

  public get db(): SQLiteDB {
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
      return this._db;
    }
    return this._db;
  }

  public get sqlite(): SQLiteClient {
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      return this.connections.get(worker)?.sqlite ?? this._sqlite;
    }
    return this._sqlite;
  }

  /**
   * Required for collection-module and migrations
   */
  public getClient(): SQLiteClient {
    return this.sqlite;
  }

  private getActiveStatementCache(): Map<string, SQLiteStatement> {
    const worker = testWorkerContext.getStore();
    if (worker && process.env.TEST_MODE === "true") {
      return this.connections.get(worker)?.statementCache ?? this._statementCache;
    }
    return this._statementCache;
  }

  public readonly schema = schema;

  public isConnected(): boolean {
    return this.state === "connected";
  }

  /* ------------------------------------------------ */
  /* CONNECT                                          */
  /* ------------------------------------------------ */

  public async connect(config: string | SQLiteConfig): Promise<DatabaseResult<void>> {
    if (this.state === "connected") {
      // Robust check: if path changed, we should reconnect
      const currentPath = await this.resolvePath(this.config);
      const newPath = await this.resolvePath(config);
      if (currentPath === newPath) {
        return { success: true, data: undefined };
      }
      await this.disconnect();
    }

    this.state = "connecting";

    try {
      this.config = config;
      const dbPath = await this.resolvePath(config);
      const { sqlite, db } = await this.createDriver(dbPath);

      this._sqlite = sqlite;
      this._db = db;

      // Modules are now lazy-loaded via getters in the final adapter class

      this.applyPragmas(sqlite);
      this._statementCache.clear();

      this.state = "connected";
      this.metrics.connectCount++;
      this.metrics.lastConnectedAt = Date.now();

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
    const name = base.slice(0, -ext.length);
    const workerFile = `${name}_worker${index}${ext}`;

    const { sqlite, db } = await this.createDriver(workerFile);
    this.applyPragmas(sqlite);

    this.connections.set(index, {
      sqlite,
      db,
      statementCache: new Map<string, SQLiteStatement>(),
    });

    logger.info(`[SQLite] Worker DB ready ${workerFile}`);
  }

  /* ------------------------------------------------ */
  /* HEALTH & MONITORING                              */
  /* ------------------------------------------------ */

  public async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
      dbSize?: number;
      pageCount?: number;
      freelistCount?: number;
      journalMode?: string;
    }>
  > {
    try {
      const start = performance.now();

      // Probe
      this.prepareAndExecute("SELECT 1", "get");

      const latency = performance.now() - start;

      //  Metrics
      const pageCountRes = this.prepareAndExecute("PRAGMA page_count", "get") as any;
      const pageCount = Number(pageCountRes?.["page_count"] ?? pageCountRes ?? 0);

      const pageSizeRes = this.prepareAndExecute("PRAGMA page_size", "get") as any;
      const pageSize = Number(pageSizeRes?.["page_size"] ?? pageSizeRes ?? 4096);

      const freelistCountRes = this.prepareAndExecute("PRAGMA freelist_count", "get") as any;
      const freelistCount = Number(freelistCountRes?.["freelist_count"] ?? freelistCountRes ?? 0);

      const journalModeRes = this.prepareAndExecute("PRAGMA journal_mode", "get") as any;
      const journalMode = String(journalModeRes?.["journal_mode"] ?? journalModeRes ?? "unknown");

      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: 1 + this.connections.size,
          dbSize: pageCount * pageSize,
          pageCount,
          freelistCount,
          journalMode,
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_FAILED");
    }
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    try {
      const res = this.prepareAndExecute(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        "get",
      ) as any;
      const count = Number(res?.count ?? res ?? 0);
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  /**
   *  Database Maintenance
   */
  public async optimize(): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      const client = this.sqlite;
      client.exec("PRAGMA optimize;");
      client.exec("VACUUM;");
      client.exec("ANALYZE;");
      logger.info("[SQLite] Optimization completed (VACUUM/ANALYZE)");
    }, "OPTIMIZE_FAILED");
  }

  public override async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    options?: { isWrite?: boolean; transaction?: any },
  ): Promise<DatabaseResult<T>> {
    // 🚀 SERIALIZE WRITES: If it's a write and NOT already in a transaction, use the mutex.
    // Re-entrance check: if options.transaction is set, we assume the caller (e.g. TransactionModule)
    // already holds the mutex or handles serialization.
    if (options?.isWrite && !options?.transaction) {
      return this.writeMutex.runExclusive(() => super.wrap(fn, code, message, options));
    }
    return super.wrap(fn, code, message, options);
  }

  public async transaction<T>(
    fn: (transaction: any) => Promise<DatabaseResult<T>>,
    options?: {
      timeout?: number;
      isolationLevel?: "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
    },
  ): Promise<DatabaseResult<T>> {
    if (!this._transactionModule) {
      const { TransactionModule } = await import("./transaction-module");
      this._transactionModule = new TransactionModule(this);
    }
    return this._transactionModule.execute(fn, options);
  }

  /* ------------------------------------------------ */
  /* STATEMENT CACHE HELPER                           */
  /* ------------------------------------------------ */

  private prepareAndExecute(sql: string, method: "get" | "all" | "run", ...args: unknown[]): any {
    const cache = this.getActiveStatementCache();
    let stmt = cache.get(sql);

    if (stmt) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
      const client = this.sqlite;

      // Support both Bun (query) and Node (prepare)
      stmt = (client.prepare ? client.prepare(sql) : client.query?.(sql)) as SQLiteStatement;

      if (!stmt) {
        throw new Error(`Failed to prepare statement: ${sql}`);
      }

      if (cache.size >= this.MAX_CACHE_SIZE) {
        // Simple eviction: clear oldest
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(sql, stmt);
    }

    let attempts = 0;
    const maxAttempts = 5;
    const baseDelay = 50;

    while (attempts < maxAttempts) {
      try {
        return stmt[method](...args);
      } catch (err: any) {
        attempts++;
        const isBusy =
          err.code === "SQLITE_BUSY" ||
          err.message?.includes("busy") ||
          err.message?.includes("locked");

        if (isBusy && attempts < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempts - 1);
          logger.warn(
            `[SQLite] Database busy/locked, retrying in ${delay}ms (Attempt ${attempts}/${maxAttempts})`,
          );

          // Use sync sleep if we are in a sync context (bun:sqlite is sync)
          const start = Date.now();
          while (Date.now() - start < delay) {
            // spin
          }
          continue;
        }

        if (isBusy) {
          logger.error(`[SQLite] Database remains busy after ${maxAttempts} attempts.`);
        }
        throw err;
      }
    }
  }

  /**
   * High-performance raw query execution with automatic retries and statement caching.
   */
  public queryRaw<T = any>(sql: string, params: Record<string, any> = {}): T[] {
    return this.prepareAndExecute(sql, "all", params);
  }

  /* ------------------------------------------------ */
  /* CAPABILITIES                                     */
  /* ------------------------------------------------ */

  public getCapabilities(): DatabaseCapabilities {
    return {
      supportsTransactions: true,
      supportsIndexing: true,
      supportsFullTextSearch: true,
      supportsAggregation: true,
      supportsStreaming: true,
      supportsPartitioning: false,
      maxBatchSize: 1000,
      maxQueryComplexity: 100,
      nativeUpsert: true,
      supportsConflictTargets: true,
    };
  }

  /* ------------------------------------------------ */
  /* DYNAMIC TABLES                                   */
  /* ------------------------------------------------ */

  public override getTable(name: string) {
    return super.getTable(name);
  }

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
    if (this._statementCache.size > 0) this._statementCache.clear();
    for (const conn of this.connections.values()) {
      conn.statementCache.clear();
    }
    this.columnNamesCache.clear();
  }

  /**
   * 🚀 OPTIMIZATION: Gets cached column names for a table to speed up hybrid CRUD.
   */
  public getColumnNames(tableName: string): Set<string> {
    if (this.columnNamesCache.has(tableName)) {
      return this.columnNamesCache.get(tableName)!;
    }
    const table = this.getTable(tableName);
    const names = new Set(Object.keys(table));
    this.columnNamesCache.set(tableName, names);
    return names;
  }

  public createDynamicTableDefinition(name: string) {
    return sqliteTable(
      name,
      {
        _id: text("_id", { length: 36 }).primaryKey(),
        tenantId: text("tenantId", { length: 36 }),
        data: text("data", { mode: "json" }).notNull().default("{}"),
        status: text("status", { length: 50 }).notNull().default("draft"),
        isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
        createdAt: integer("createdAt", { mode: "timestamp_ms" })
          .notNull()
          .default(sql`(strftime('%s','now')*1000)`),
        updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
          .notNull()
          .default(sql`(strftime('%s','now')*1000)`),
      },
      (t) => ({
        tenantIdx: index(`${name}_tenant_idx`).on(t.tenantId),
        statusIdx: index(`${name}_status_idx`).on(t.status),
      }),
    );
  }

  /* ------------------------------------------------ */
  /* INTERNALS                                        */
  /* ------------------------------------------------ */
  private async createDriver(dbPath: string) {
    const versions = (process as any)?.versions || {};
    const isBun = typeof Bun !== "undefined";
    const nodeVersion = versions.node;

    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(`[SQLite] createDriver: isBun=${isBun}, node=${nodeVersion}`);
    }

    const readonly = (this.config as SQLiteConfig)?.readonly || dbPath.includes("mode=ro") || false;
    const options = readonly ? { readonly } : {};

    // 🚀 If in Bun, use Bun's native driver exclusively.
    if (isBun) {
      try {
        const { Database } = await import(/* @vite-ignore */ "bun:sqlite");
        const sqlite = new Database(dbPath, options) as SQLiteClient;
        const { drizzle } = await import(/* @vite-ignore */ "drizzle-orm/bun-sqlite");
        const db = drizzle(sqlite as any, { schema }) as SQLiteDB;
        logger.info(`[SQLite] Using native 'bun:sqlite' driver.`);
        return { sqlite, db };
      } catch (e: any) {
        if (!nodeVersion) throw e;
        logger.warn(`[SQLite] Bun driver fallback due to: ${e.message}`);
      }
    }

    try {
      // 🔌 NODE FALLBACK 1: Try better-sqlite3 (Legacy Node)
      const req = await getRequire();
      if (req) {
        const sqlite = req("better-sqlite3")(dbPath, options);
        const { drizzle } = await import("drizzle-orm/better-sqlite3");
        const db = drizzle(sqlite, { schema });
        logger.info(`[SQLite] Using 'better-sqlite3' driver.`);
        return { sqlite, db };
      } else {
        throw new Error("requireFunc not available for better-sqlite3");
      }
    } catch (e: any) {
      // 🔌 NODE FALLBACK 2: Try native node:sqlite (Node 22.5+) via shim
      if (nodeVersion) {
        const v = nodeVersion.replace("v", "");
        const [major, minor] = v.split(".").map(Number);

        if (major > 22 || (major === 22 && minor >= 5)) {
          try {
            const req = await getRequire();
            if (!req) throw new Error("requireFunc not available for node:sqlite");
            const { DatabaseSync } = req("node:sqlite");
            const sqlite = new DatabaseSync(dbPath);

            // 🚀 Shim node:sqlite using drizzle-orm/sqlite-proxy
            const { drizzle: proxyDrizzle } = await import("drizzle-orm/sqlite-proxy");

            const db = proxyDrizzle(
              async (sql, params, method) => {
                try {
                  // 🚀 CRITICAL: node:sqlite does not auto-serialize objects/arrays to JSON strings.
                  const serializedParams = params.map((p) =>
                    p !== null && typeof p === "object" ? JSON.stringify(p) : p,
                  );

                  const stmt = sqlite.prepare(sql);

                  // 🚀 FIX: Force results as arrays to avoid column name collisions in JOINs
                  if (typeof (stmt as any).setReturnArrays === "function") {
                    (stmt as any).setReturnArrays(true);
                  }

                  if (method === "run") {
                    const result = stmt.run(...serializedParams);
                    return { rows: [], ...result };
                  }

                  const rows = stmt.all(...serializedParams) as any[];

                  // If the driver doesn't support setReturnArrays, we fallback to Object.values
                  // (but this won't solve the JOIN collision issue)
                  const arrayRows = rows.map((row) =>
                    Array.isArray(row) ? row : Object.values(row),
                  );

                  return { rows: arrayRows };
                } catch (err: any) {
                  if (!err.message?.includes("no such table")) {
                    logger.error(`[SQLite Shim] execution error: ${err.message}`, { sql });
                  }
                  throw err;
                }
              },
              { schema },
            ) as unknown as SQLiteDB;

            logger.info(`[SQLite] Using 'node:sqlite' shim with array-result fix.`);

            return { sqlite: sqlite as any, db };
          } catch (nodeSqliteErr: any) {
            logger.warn(`[SQLite] Fallback to node:sqlite failed: ${nodeSqliteErr.message}`);
          }
        }
      }

      const isBindingError =
        e.message.includes("bindings file") ||
        e.message.includes("Cannot find module 'better-sqlite3'");
      const isWindows = process.platform === "win32";

      if (isBindingError) {
        // Only log the full error if we couldn't even fall back to node:sqlite
        logger.error(`[SQLite] Driver initialization failed: ${e.message.split("\n")[0]}`);
        let hint = `\n\n💡 SUGGESTION:\n1. Run 'npm install better-sqlite3' to rebuild the native bindings for Node ${nodeVersion}.\n`;
        if (isWindows) {
          hint += `2. If you are using Bun, try running 'bun dev' directly. If that fails, ensure you have VS Build Tools installed.\n`;
        }
        throw new Error(`SQLite driver initialization failed: ${e.message.split("\n")[0]}${hint}`);
      }
      throw new Error(`SQLite Connection failed: ${e.message.split("\n")[0]}`);
    }
  }

  private applyPragmas(client: SQLiteClient) {
    // Tuning - wrapped in try-catch to be safe
    const safeExec = (cmd: string) => {
      try {
        client.exec(cmd);
      } catch (e) {
        // Only log warning, don't crash
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.warn(`[SQLite] Pragma failed: ${cmd}`, e);
        }
      }
    };

    safeExec("PRAGMA journal_mode=WAL");
    safeExec("PRAGMA synchronous=NORMAL");
    safeExec("PRAGMA foreign_keys=ON");
    safeExec("PRAGMA busy_timeout=5000");
    safeExec("PRAGMA temp_store=MEMORY");
    safeExec("PRAGMA mmap_size=268435456"); // 256MB
    safeExec("PRAGMA cache_size=-64000"); // 64MB
    safeExec("PRAGMA journal_size_limit=67108864"); // 64MB WAL limit
    safeExec("PRAGMA wal_autocheckpoint=10000"); // Tune up to 10k to smooth out p95 spikes during bulk inserts
  }

  public override get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        // Use the high-performance prepareAndExecute helper
        return this.prepareAndExecute(sqlText, "all", ...params);
      },
      client: this.sqlite,
    };
  }

  private async resolvePath(config: string | SQLiteConfig): Promise<string> {
    const path = await import("node:path");
    const fs = await import("node:fs");

    let file =
      typeof config === "string"
        ? config
        : config.connectionString || config.filename || config.DB_NAME || "cms.db";

    if (file.startsWith("sqlite://")) {
      file = file.slice(9);
    }

    // Support memory databases
    if (file === ":memory:" || file.startsWith("file::memory:")) {
      return file;
    }

    // 🚀 Ensure consistent extension (align with config-state.ts)
    if (!file.endsWith(".sqlite") && !file.endsWith(".db")) {
      file = `${file}.sqlite`;
    }

    if (!path.isAbsolute(file) && !file.includes("/") && !file.includes("\\")) {
      file = path.join("config", "database", file);
    }

    const full = path.resolve(process.cwd(), file);
    const dir = path.dirname(full);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return full;
  }
}
