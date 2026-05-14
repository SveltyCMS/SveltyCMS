/**
 * @file src/databases/mariadb/adapter/adapter-core.ts
 * @description Core functionality for MariaDB adapter, unified via BaseSqlAdapter.
 */

import { logger } from "@src/utils/logger";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { DatabaseCapabilities, DatabaseResult } from "../db-interface";
import { BaseSqlAdapter } from "../core/base-sql-adapter";
import * as schema from "./schema";
import { mysqlTable, varchar, json, datetime, boolean } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export abstract class AdapterCore extends BaseSqlAdapter {
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

  public pool: mysql.Pool | null = null;
  public get db(): MySql2Database<typeof schema> {
    if (!this._db) {
      throw new Error(
        `[MariaDBAdapter] Database not connected (state: ${this.isConnected() ? "connected" : "idle"})`,
      );
    }
    return this._db;
  }

  private _db: MySql2Database<typeof schema> | null = null;
  public activeDatabaseName: string = "unknown";
  private _transactionModule?: import("./transaction-module").TransactionModule;

  async connect(
    connection: string | mysql.PoolOptions,
    _options?: unknown,
  ): Promise<DatabaseResult<void>> {
    try {
      let finalConnection = connection;

      if (
        !finalConnection ||
        (typeof finalConnection === "string" && finalConnection.trim() === "")
      ) {
        const { getDatabaseConnectionString } = await import("../config-state");
        finalConnection = getDatabaseConnectionString();
      }

      if (!finalConnection) {
        throw new Error("Missing MariaDB connection configuration.");
      }

      let poolConfig: any;

      if (typeof finalConnection === "string") {
        poolConfig = { uri: finalConnection, connectionLimit: 100, connectTimeout: 30000 };
      } else {
        const c = (finalConnection || {}) as any;
        poolConfig = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 3306),
          user: c.user || c.DB_USER || "root",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          connectionLimit: 100,
          connectTimeout: 30000,
          waitForConnections: true,
          maxIdle: 10,
          idleTimeout: 60000,
          queueLimit: 0,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        };
      }

      this.pool = mysql.createPool(poolConfig);
      this.activeDatabaseName =
        poolConfig.database ||
        (poolConfig.uri ? new URL(poolConfig.uri).pathname.slice(1) : "unknown");

      // Verification with Auto-Creation Support
      try {
        await this.pool.query("SELECT 1");
      } catch (err: any) {
        const isMissingDb =
          err.code === "ER_BAD_DB_ERROR" ||
          err.errno === 1049 ||
          err.message?.includes("Unknown database");

        if (isMissingDb) {
          const dbName = this.activeDatabaseName;
          if (dbName && dbName !== "unknown") {
            logger.info(`[mariadb] Database "${dbName}" not found. Attempting auto-creation...`);
            // Create admin connection without database specified
            const adminConfig = { ...poolConfig };
            delete adminConfig.database;
            if (adminConfig.uri) {
              const url = new URL(adminConfig.uri);
              url.pathname = "/";
              adminConfig.uri = url.toString();
            }

            const adminConn = await mysql.createConnection(adminConfig);
            try {
              await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
              await adminConn.end();
              // Re-verify the primary pool
              await this.pool.query("SELECT 1");
            } catch (createErr) {
              await adminConn.end();
              throw createErr;
            }
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      this._db = drizzle(this.pool, { schema, mode: "default" });
      await this.pool.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");

      this.connected = true;
      logger.info("Connected to MariaDB");
      return { success: true, data: undefined };
    } catch (error) {
      if (this.pool) {
        await this.pool.end().catch(() => {});
        this.pool = null;
      }
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  /**
   * 🚀 AGNOSTIC CORE: Returns the raw database client.
   */
  public getClient(): import("mysql2/promise").Pool | null {
    return this.pool;
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._db = null;
      this.connected = false;
      logger.info("Disconnected from MariaDB");
    }
    return { success: true, data: undefined };
  }

  public isConnected(): boolean {
    return this.connected;
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
    if (!(this.connected && this.pool)) {
      return this.notConnectedError();
    }
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      const latency = Date.now() - start;
      const internalPool = (this.pool as any).pool || this.pool;
      const all = internalPool._allConnections?.length || 0;
      const free = internalPool._freeConnections?.length || 0;

      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: Math.max(0, all - free),
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_CHECK_FAILED");
    }
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    if (!this.pool) return this.notConnectedError();
    try {
      const [rows] = await this.pool.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
        [this.activeDatabaseName],
      );
      const count = (rows as any)[0].count;
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../db-interface").ConnectionPoolStats>
  > {
    if (!this.pool) return this.notConnectedError();
    return this.wrap(async () => {
      // mysql2/promise Pool wraps the internal Pool in a .pool property
      const internalPool = (this.pool as any).pool || this.pool;

      const total = internalPool.config?.connectionLimit || 100;
      const all = internalPool._allConnections?.length || 0;
      const free = internalPool._freeConnections?.length || 0;
      const queue = internalPool._connectionQueue?.length || 0;

      return {
        total,
        active: Math.max(0, all - free),
        idle: free,
        waiting: queue,
        avgConnectionTime: 0,
      };
    }, "POOL_STATS_FAILED");
  }

  public readonly schema = schema;

  /**
   * 🚀 AGNOSTIC CORE: MariaDB implementation of JSON field extraction.
   */
  public getJsonField(field: string): import("drizzle-orm").SQL {
    return sql`JSON_VALUE(data, '$.' || ${field})`;
  }

  /**
   * 🚀 AGNOSTIC CORE: Resolves a collection name to its Drizzle schema object.
   */
  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;

    // 1. Check direct alias map
    const alias = (BaseSqlAdapter as any).TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) return schemaAny[alias];

    // 2. Check if the name itself is a schema export
    if (schemaAny[collection]) return schemaAny[collection];

    return null;
  }

  protected getDrizzleInstance(
    _options?: import("../db-interface").BaseQueryOptions,
  ): MySql2Database<typeof schema> {
    return this.db;
  }

  public override getTable(collection: string): any {
    return super.getTable(collection);
  }

  public override destroy(): void {
    if (this.preparedStatements.size > 0) this.preparedStatements.clear();
  }

  public transaction = async <T>(
    fn: (transaction: import("../db-interface").DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: {
      timeout?: number;
      isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
    },
  ): Promise<DatabaseResult<T>> => {
    if (!this._transactionModule) {
      const { TransactionModule } = await import("./transaction-module");
      this._transactionModule = new TransactionModule(this);
    }
    return this._transactionModule.execute(fn, options as any);
  };

  public createDynamicTableDefinition(tableName: string) {
    return mysqlTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      data: json("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      isDeleted: boolean("isDeleted").notNull().default(false),
      createdAt: datetime("createdAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      updatedAt: datetime("updatedAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    });
  }

  /**
   * 🚀 RAW ACCESS: Implementation for MariaDB (mysql2)
   */
  public override get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  } {
    return {
      execute: async (sqlText: string, params: any[] = []) => {
        if (!this.pool) throw new Error("Database not connected");
        const [rows] = await this.pool.query(sqlText, params);
        return rows;
      },
      client: this.pool,
    };
  }
}
