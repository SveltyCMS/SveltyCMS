/**
 * @file src/databases/sqlite/adapter/adapterCore.ts
 * @description Core functionality for SQLite adapter (Connection, Drizzle instance) - Bun native
 */

import { logger } from "@src/utils/logger";
import { testWorkerContext } from "@src/utils/test-worker-context";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  CollectionModel,
  DatabaseCapabilities,
  DatabaseError,
  DatabaseResult,
} from "../../db-interface";
import * as schema from "../schema";
import * as utils from "../utils";

// Define a type for our database to avoid 'any'
type SQLiteDB = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;

// Interface for the underlying SQLite client (Bun or better-sqlite3)
interface SQLiteClient {
  close(): void;
  exec(sql: string): void;
  query?(sql: string): {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): void;
  };
  prepare?(sql: string): {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): unknown;
  };
}

export class AdapterCore {
  private _db!: SQLiteDB;
  private _sqlite!: SQLiteClient;
  private connections = new Map<string, { db: SQLiteDB; sqlite: SQLiteClient }>();

  public adapter!: import("../../db-interface").IDBAdapter;
  public crud!: import("../crud/crud-module").CrudModule;
  public batch!: import("../operations/batch-module").BatchModule;
  public collectionRegistry = new Map<string, CollectionModel>();
  public dynamicTables = new Map<string, any>();
  protected isConnectedBoolean = false;
  protected config: any;

  public get db(): SQLiteDB {
    const workerIndex = testWorkerContext.getStore();
    if (workerIndex && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(workerIndex);
      if (conn) return conn.db;
    }
    return this._db;
  }

  public get sqlite(): SQLiteClient {
    const workerIndex = testWorkerContext.getStore();
    if (workerIndex && process.env.TEST_MODE === "true") {
      const conn = this.connections.get(workerIndex);
      if (conn) return conn.sqlite;
    }
    return this._sqlite;
  }

  public getDrizzle(): SQLiteDB {
    return this.db;
  }

  public getClient(): SQLiteClient {
    return this.sqlite;
  }

  /**
   * Initializes a separate SQLite database file for a specific test worker.
   * This ensures total isolation and avoids locking issues in parallel E2E tests.
   */
  public async initWorkerConnection(index: string): Promise<void> {
    if (this.connections.has(index)) {
      return;
    }

    try {
      const path = await import("node:path");
      const baseDbPath =
        typeof this.config === "string"
          ? this.config
          : this.config.connectionString || this.config.filename || "cms.db";
      const ext = path.extname(baseDbPath);
      const base = baseDbPath.slice(0, -ext.length);
      const workerDbPath = `${base}_worker${index}${ext}`;
      const dbPathResolved = path.resolve(process.cwd(), workerDbPath);

      logger.info(`[AdapterCore] Initializing worker database: ${workerDbPath}`);

      let sqlite: SQLiteClient;
      let db: SQLiteDB;

      const isBun = typeof Bun !== "undefined";
      if (isBun) {
        const bunSqlite = "bun:sqlite";
        const { Database } = await import(/* @vite-ignore */ bunSqlite);
        sqlite = new Database(dbPathResolved) as SQLiteClient;
        const drizzleModule = "drizzle-orm/bun-sqlite";
        const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
        db = drizzle(sqlite as unknown, { schema }) as unknown as SQLiteDB;

        // Optimized WAL mode for worker
        sqlite.exec("PRAGMA journal_mode = WAL;");
        sqlite.exec("PRAGMA busy_timeout = 5000;");
      } else {
        const betterSqliteModule = "better-sqlite3";
        const DATABASE = (await import(/* @vite-ignore */ betterSqliteModule)).default;
        sqlite = new DATABASE(dbPathResolved) as unknown as SQLiteClient;
        const drizzleModule = "drizzle-orm/better-sqlite3";
        const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
        db = drizzle(sqlite as unknown, { schema }) as unknown as SQLiteDB;
        sqlite.exec("PRAGMA journal_mode = WAL");
        sqlite.exec("PRAGMA busy_timeout = 5000");
      }

      // Run migrations on the worker database
      const { runMigrations } = await import("../migrations");
      await runMigrations(sqlite);

      this.connections.set(index, { db, sqlite });
    } catch (err) {
      logger.error(`Failed to initialize worker connection ${index}:`, err);
      throw err;
    }
  }

  public isConnected(): boolean {
    return this.isConnectedBoolean;
  }

  public async connect(
    config: string | { connectionString?: string; filename?: string },
  ): Promise<DatabaseResult<void>> {
    try {
      this.config = config;

      const path = await import("node:path");
      const fs = await import("node:fs");

      // Ensure directory exists
      let dbPath =
        typeof config === "string"
          ? config
          : config.connectionString || config.filename || "cms.db";

      // 🚀 Critical: Ensure database is stored in /config/database if it's just a filename
      if (!path.isAbsolute(dbPath) && !dbPath.includes("/") && !dbPath.includes("\\")) {
        dbPath = path.join("config", "database", dbPath);
      }

      const dbPathResolved = path.resolve(process.cwd(), dbPath);
      const dbDir = path.dirname(dbPathResolved);

      if (!fs.existsSync(dbDir) && dbDir !== ".") {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const isBun = typeof Bun !== "undefined";

      if (isBun) {
        // Use dynamic import with string concatenation to avoid Node's static ESM loader errors
        // and Vite's build time analysis warnings
        const bunSqlite = "bun:sqlite";
        const { Database } = await import(/* @vite-ignore */ bunSqlite);
        this._sqlite = new Database(dbPathResolved) as SQLiteClient;
        const drizzleModule = "drizzle-orm/bun-sqlite";
        const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
        this._db = drizzle(this._sqlite as unknown, {
          schema,
        }) as unknown as SQLiteDB;

        // WAL mode for better performance/concurrency
        this._sqlite.exec("PRAGMA journal_mode = WAL;");
        this._sqlite.exec("PRAGMA synchronous = NORMAL;");
        this._sqlite.exec("PRAGMA cache_size = -8000;");
        this._sqlite.exec("PRAGMA mmap_size = 268435456;");
        this._sqlite.exec("PRAGMA busy_timeout = 5000;");
        this._sqlite.exec("PRAGMA temp_store = memory;");
        this._sqlite.exec("PRAGMA foreign_keys = ON;");
      } else {
        // Fallback to better-sqlite3 in Node.js (Vite dev)
        const betterSqliteModule = "better-sqlite3";
        const DATABASE = (await import(/* @vite-ignore */ betterSqliteModule)).default;
        this._sqlite = new DATABASE(dbPathResolved) as unknown as SQLiteClient;
        const drizzleModule = "drizzle-orm/better-sqlite3";
        const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
        this._db = drizzle(this._sqlite as unknown, {
          schema,
        }) as unknown as SQLiteDB;

        // WAL mode
        this._sqlite.exec("PRAGMA journal_mode = WAL");
        this._sqlite.exec("PRAGMA synchronous = NORMAL");
        this._sqlite.exec("PRAGMA cache_size = -8000");
        this._sqlite.exec("PRAGMA mmap_size = 268435456");
        this._sqlite.exec("PRAGMA busy_timeout = 5000");
        this._sqlite.exec("PRAGMA temp_store = memory");
        this._sqlite.exec("PRAGMA foreign_keys = ON");
      }

      this.isConnectedBoolean = true;

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to SQLite",
        error: utils.createDatabaseError(
          "CONNECTION_FAILED",
          error instanceof Error ? error.message : String(error),
          error,
        ),
      };
    }
  }

  public async disconnect(): Promise<DatabaseResult<void>> {
    try {
      if (this._sqlite) {
        this._sqlite.close();
      }
      for (const conn of this.connections.values()) {
        conn.sqlite.close();
      }
      this.connections.clear();
      this.isConnectedBoolean = false;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Failed to disconnect",
        error: utils.createDatabaseError(
          "DISCONNECT_FAILED",
          error instanceof Error ? error.message : String(error),
          error,
        ),
      };
    }
  }

  public async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
  > {
    try {
      const start = performance.now();
      if (this.sqlite.query) {
        this.sqlite.query("SELECT 1").get();
      } else if (this.sqlite.prepare) {
        this.sqlite.prepare("SELECT 1").get();
      }
      const latency = performance.now() - start;
      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: 1, // In-process
        },
      };
    } catch (error) {
      return {
        success: false,
        message: "Health check failed",
        error: utils.createDatabaseError(
          "HEALTH_CHECK_FAILED",
          error instanceof Error ? error.message : String(error),
          error,
        ),
      };
    }
  }

  public getCapabilities(): DatabaseCapabilities {
    return {
      supportsTransactions: true,
      supportsIndexing: true,
      supportsFullTextSearch: false, // Can be enabled
      supportsAggregation: true,
      supportsStreaming: true,
      supportsPartitioning: false,
      maxBatchSize: 1000,
      maxQueryComplexity: 100,
    };
  }

  // Helper methods for modules

  public wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
    if (!this.isConnectedBoolean) {
      return Promise.resolve(this.notConnectedError());
    }
    return fn()
      .then((data) => ({ success: true, data }) as DatabaseResult<T>)
      .catch((error) => this.handleError(error, code));
  }

  public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`SQLite adapter error [${code}]:`, message);
    return {
      success: false,
      message,
      error: utils.createDatabaseError(code, message, error) as DatabaseError,
    };
  }

  public notImplemented<T>(method: string): DatabaseResult<T> {
    const message = `Method ${method} not yet implemented for SQLite adapter.`;
    logger.warn(message);
    return {
      success: false,
      message,
      error: utils.createDatabaseError("NOT_IMPLEMENTED", message) as DatabaseError,
    };
  }

  public notConnectedError<T>(): DatabaseResult<T> {
    return {
      success: false,
      message: "Database not connected",
      error: utils.createDatabaseError(
        "NOT_CONNECTED",
        "Database connection not established",
      ) as DatabaseError,
    };
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  public getTable(collection: string): any {
    logger.debug(`[SQLiteAdapter] getTable: ${collection}`);
    const schemaAny = schema as unknown as Record<string, any>;

    // Aliases
    if (collection === "system_content_structure") {
      return schema.contentNodes;
    }
    if (
      collection === "tokens" ||
      collection === "invitation_tokens" ||
      collection === "auth_tokens"
    ) {
      logger.debug(`[SQLiteAdapter] matched tokens alias -> schema.authTokens`);
      return schema.authTokens;
    }
    if (collection === "users" || collection === "auth_users") {
      return schema.authUsers;
    }
    if (collection === "sessions" || collection === "auth_sessions") {
      return schema.authSessions;
    }

    // 1. Static schema tables
    if (schemaAny[collection]) {
      return schemaAny[collection];
    }
    const camelKey = this.snakeToCamel(collection);
    if (schemaAny[camelKey]) {
      return schemaAny[camelKey];
    }

    // 2. Dynamic collection tables (UUID-based or Name-based)
    // We use a prefix to distinguish them from static tables
    if (this.dynamicTables.has(collection)) {
      return this.dynamicTables.get(collection)!;
    }

    // If it looks like a UUID or is a known collection name that isn't a static table,
    // we return a dynamic table definition
    if (/^[a-f0-9]{32,36}$/i.test(collection) || collection.startsWith("collection_")) {
      const tableId = collection.startsWith("collection_")
        ? collection
        : `collection_${collection}`;
      const dynamicTable = this.createDynamicTableDefinition(tableId);
      this.dynamicTables.set(collection, dynamicTable);
      return dynamicTable;
    }

    return schema.contentNodes;
  }

  /**
   * Creates a Drizzle table definition for a dynamic collection at runtime.
   * All dynamic collections sharing a common relational structure for flexibility.
   */
  private createDynamicTableDefinition(tableName: string) {
    return sqliteTable(tableName, {
      _id: text("_id", { length: 36 }).primaryKey(),
      tenantId: text("tenantId", { length: 36 }),
      data: text("data", { mode: "json" }).notNull().default("{}"),
      status: text("status", { length: 50 }).notNull().default("draft"),
      createdAt: integer("createdAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s', 'now') * 1000)`),
      updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s', 'now') * 1000)`),
    });
  }

  public mapQuery(
    table: Record<string, unknown>,
    query: Record<string, unknown>,
  ): import("drizzle-orm").SQL | undefined {
    if (!query || Object.keys(query).length === 0) {
      return undefined;
    }

    const conditions: import("drizzle-orm").SQL[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith("$")) {
        continue;
      }
      const column = table[key] as import("drizzle-orm").Column;
      if (column) {
        if (value === null || value === undefined) {
          conditions.push(isNull(column));
        } else if (Array.isArray(value)) {
          if (value.length > 0) {
            conditions.push(inArray(column, value));
          } else {
            // An empty array in inArray() throws "Too few parameter values" in SQLite
            conditions.push(sql`1 = 0`);
          }
        } else if (typeof value === "object" && value !== null) {
          // Handle MongoDB-style operators
          const val = value as Record<string, any>;
          if (val.$ne !== undefined) {
            conditions.push(ne(column, val.$ne as string | number | boolean));
          } else if (val.$in !== undefined && Array.isArray(val.$in)) {
            if (val.$in.length > 0) {
              conditions.push(inArray(column, val.$in));
            } else {
              conditions.push(sql`1 = 0`);
            }
          }
        } else {
          conditions.push(eq(column, value as string | number | boolean));
        }
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }
    return and(...conditions);
  }
}
