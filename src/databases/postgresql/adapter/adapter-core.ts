/**
 * @file src/databases/postgresql/adapter/adapter-core.ts
 * @description Core functionality for PostgreSQL adapter, unified via BaseSqlAdapter.
 */

import { logger } from "@src/utils/logger";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type {
  DatabaseCapabilities,
  DatabaseResult,
  ICrudAdapter,
  IBatchAdapter,
} from "../../db-interface";
import { BaseSqlAdapter } from "../../relational/base-sql-adapter";
import * as schema from "../schema/index";

export class AdapterCore extends BaseSqlAdapter {
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    supportsAggregation: true,
    supportsStreaming: false,
    supportsPartitioning: true,
    maxBatchSize: 1000,
    maxQueryComplexity: 100,
  };

  public sql: ReturnType<typeof postgres> | null = null;
  public get db(): PostgresJsDatabase<typeof schema> {
    if (!this._db) {
      throw new Error(
        `[PostgreSQLAdapter] Database not connected (state: ${this.connected ? "connected" : "idle"})`,
      );
    }
    return this._db;
  }

  private _db: PostgresJsDatabase<typeof schema> | null = null;
  private replicaSqls = new Map<string, ReturnType<typeof postgres>>();
  private allReplicaSqls: ReturnType<typeof postgres>[] = [];
  public crud!: ICrudAdapter;
  public batch!: IBatchAdapter;
  private transactionModule?: import("../operations/transaction-module").TransactionModule;

  /**
   * Returns the appropriate SQL client based on the operation mode (read/write).
   */
  public getSql(mode: "read" | "write" = "write"): ReturnType<typeof postgres> {
    if (!this.sql) throw new Error("Database not connected");

    if (mode === "write" || this.allReplicaSqls.length === 0) {
      return this.sql;
    }

    const region = (globalThis as any).SVELTY_REGION || "unknown";
    if (this.replicaSqls.has(region)) {
      return this.replicaSqls.get(region)!;
    }

    const index = Math.floor(Math.random() * this.allReplicaSqls.length);
    return this.allReplicaSqls[index];
  }

  public getDb(mode: "read" | "write" = "write"): PostgresJsDatabase<typeof schema> {
    const client = this.getSql(mode);
    return drizzle(client, { schema });
  }

  async connect(
    connection: string | Record<string, unknown>,
    _options?: unknown,
  ): Promise<DatabaseResult<void>> {
    try {
      let finalConnection = connection;

      if (
        !finalConnection ||
        (typeof finalConnection === "string" && finalConnection.trim() === "")
      ) {
        const { getDatabaseConnectionString } = await import("../../config-state");
        finalConnection = getDatabaseConnectionString();
      }

      if (!finalConnection) {
        throw new Error("Missing PostgreSQL connection configuration.");
      }

      let options: Record<string, unknown> = {
        max: 100,
        connect_timeout: 30,
      };

      if (typeof finalConnection === "string") {
        try {
          const url = new URL(finalConnection);
          options = {
            ...options,
            host: url.hostname,
            port: Number(url.port) || 5432,
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.slice(1),
            ssl: url.searchParams.get("sslmode") === "require" ? "require" : undefined,
            onnotice: () => {},
            transform: { undefined: null },
          };
        } catch {
          this.sql = postgres(finalConnection, {
            onnotice: () => {},
            transform: { undefined: null },
          });
          this._db = drizzle(this.sql, { schema });
          this.connected = true;
          logger.info("Connected to PostgreSQL (String Mode)");
          return { success: true, data: undefined };
        }
      } else {
        const c = finalConnection as any;
        options = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 5432),
          user: c.user || c.DB_USER || "postgres",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME || "postgres",
          max: 100,
          connect_timeout: 30,
          ssl: c.ssl === true || c.ssl === "require" ? "require" : undefined,
          onnotice: () => {},
          transform: { undefined: null },
        };
      }

      this.sql = postgres(options);
      this._db = drizzle(this.sql, { schema });

      // Verification
      try {
        await this.sql`SELECT 1`;
      } catch (err: any) {
        if (err.code === "3D000" && (options.database as string)) {
          const adminOptions = { ...options, database: "postgres" };
          const adminSql = postgres(adminOptions);
          try {
            await adminSql.unsafe(`CREATE DATABASE "${options.database}"`);
            await adminSql.end();
            this.sql = postgres(options);
            this._db = drizzle(this.sql, { schema });
            await this.sql`SELECT 1`;
          } catch (createErr) {
            await adminSql.end();
            throw createErr;
          }
        } else {
          throw err;
        }
      }

      this.connected = true;
      logger.info("Connected to PostgreSQL");

      const { TransactionModule } = await import("../operations/transaction-module");
      this.transactionModule = new TransactionModule(this);

      return { success: true, data: undefined };
    } catch (error) {
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
      this._db = null;
      this.connected = false;
      logger.info("Disconnected from PostgreSQL");
    }
    return { success: true, data: undefined };
  }

  public async waitForConnection(): Promise<void> {
    if (this.connected) return;
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.connected) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
  > {
    if (!(this.connected && this.sql)) {
      return this.notConnectedError();
    }
    const start = Date.now();
    try {
      await this.sql`SELECT 1`;
      const latency = Date.now() - start;
      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: 0,
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_CHECK_FAILED");
    }
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    if (!this.sql) return this.notConnectedError();
    try {
      const result = await this.sql`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
      const count = Number(result[0].count);
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  public async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../../db-interface").ConnectionPoolStats>
  > {
    try {
      if (!this.sql) return this.handleError("Not connected", "POOL_STATS_FAILED");
      return {
        success: true,
        data: { total: 10, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 },
      };
    } catch (error) {
      return this.handleError(error, "POOL_STATS_FAILED");
    }
  }

  public getTable(collection: string): Record<string, unknown> {
    const aliased = this.getAliasedTable(collection, schema);
    if (aliased) return aliased;

    if (this.dynamicTables.has(collection)) return this.dynamicTables.get(collection)!;
    const tableId = collection.startsWith("collection_") ? collection : `collection_${collection}`;
    if (this.dynamicTables.has(tableId)) return this.dynamicTables.get(tableId);

    if (
      /^[a-f0-9]{32,36}$/i.test(collection) ||
      collection.startsWith("collection_") ||
      this.collectionRegistry.has(collection)
    ) {
      if (!this.collectionRegistry.has(collection))
        this.collectionRegistry.set(collection, { _id: collection });
      const dynamicTable = this.createDynamicTableDefinition(tableId);
      this.dynamicTables.set(collection, dynamicTable);
      this.dynamicTables.set(tableId, dynamicTable);
      return dynamicTable as unknown as Record<string, unknown>;
    }
    return schema.contentNodes as unknown as Record<string, unknown>;
  }

  public transaction = async <T>(
    fn: (
      transaction: import("../../db-interface").DatabaseTransaction,
    ) => Promise<DatabaseResult<T>>,
    options?: {
      isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
    },
  ): Promise<DatabaseResult<T>> => {
    if (!this.transactionModule) {
      throw new Error("Transaction module not initialized. Connect to database first.");
    }
    return this.transactionModule.execute(fn, options as any);
  };

  public createDynamicTableDefinition(tableName: string) {
    const { pgTable, varchar, jsonb, timestamp, boolean } = require("drizzle-orm/pg-core");
    const { sql } = require("drizzle-orm");
    return pgTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      data: jsonb("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      isDeleted: boolean("isDeleted").notNull().default(false),
      createdAt: timestamp("createdAt", { withTimezone: true })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      updatedAt: timestamp("updatedAt", { withTimezone: true })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    });
  }

  public configureReplicas(urls: string[] | string): void {
    const replicaUrls = typeof urls === "string" ? (JSON.parse(urls) as string[]) : urls;
    if (!Array.isArray(replicaUrls)) return;
    for (const sql of this.allReplicaSqls) sql.end();
    this.allReplicaSqls = [];
    this.replicaSqls.clear();
    if (replicaUrls.length === 0) return;

    for (const urlStr of replicaUrls) {
      try {
        const url = new URL(urlStr);
        const region = url.searchParams.get("region") || "unknown";
        const replicaSql = postgres(urlStr, { max: 50, transform: { undefined: null } });
        this.allReplicaSqls.push(replicaSql);
        if (region !== "unknown") this.replicaSqls.set(region, replicaSql);
      } catch (e) {
        logger.warn(`Failed to initialize replica ${urlStr}:`, e);
      }
    }
  }

  /**
   * 🚀 RAW ACCESS: Implementation for PostgreSQL (postgres.js)
   */
  public override get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        if (!this.sql) throw new Error("Database not connected");
        // Use unsafe for raw string execution with parameters
        return this.sql.unsafe(sqlText, params);
      },
      client: this.sql,
    };
  }
}
