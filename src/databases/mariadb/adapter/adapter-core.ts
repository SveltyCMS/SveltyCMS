/**
 * @file src/databases/mariadb/adapter/adapter-core.ts
 * @description Core functionality for MariaDB adapter, unified via BaseSqlAdapter.
 */

import { logger } from "@src/utils/logger";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { DatabaseCapabilities, DatabaseResult } from "../../db-interface";
import { BaseSqlAdapter } from "../../sqlite/base-sql-adapter";
import * as schema from "../schema";

interface InternalPool {
  pool?: {
    _allConnections: unknown[];
    _freeConnections: unknown[];
    _connectionQueue: unknown[];
    config?: {
      connectionLimit: number;
    };
  };
}

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

  public pool: mysql.Pool | null = null;
  public db: MySql2Database<typeof schema> | null = null;
  public activeDatabaseName: string = "unknown";
  public crud!: import("../crud/crud-module").CrudModule;
  public batch!: import("../operations/batch-module").BatchModule;
  private transactionModule?: import("../operations/transaction-module").TransactionModule;

  public getDb(): MySql2Database<typeof schema> {
    if (!this.db) throw new Error("Database not connected");
    return this.db;
  }

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
        const { getDatabaseConnectionString } = await import("../../config-state");
        finalConnection = getDatabaseConnectionString();
      }

      if (!finalConnection) {
        throw new Error("Missing MariaDB connection configuration.");
      }

      let poolConfig: any;

      if (typeof finalConnection === "string") {
        poolConfig = { uri: finalConnection, connectionLimit: 100, connectTimeout: 30000 };
      } else {
        const c = connection as any;
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

      this.db = drizzle(this.pool, { schema, mode: "default" });
      await this.pool.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");

      const { TransactionModule } = await import("../operations/transaction-module");
      this.transactionModule = new TransactionModule(this);

      this.connected = true;
      logger.info("Connected to MariaDB");
      return { success: true, data: undefined };
    } catch (error) {
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.db = null;
      this.connected = false;
      logger.info("Disconnected from MariaDB");
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
    if (!(this.connected && this.pool)) {
      return this.notConnectedError();
    }
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      const latency = Date.now() - start;
      const internalPool = (this.pool as unknown as InternalPool).pool;
      return {
        success: true,
        data: {
          healthy: true,
          latency,
          activeConnections: internalPool ? internalPool._allConnections.length : 0,
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
    DatabaseResult<import("../../db-interface").ConnectionPoolStats>
  > {
    try {
      if (!this.pool) return this.handleError("Not initialized", "POOL_STATS_FAILED");
      const pool = (this.pool as unknown as InternalPool).pool;
      if (!pool)
        return {
          success: true,
          data: { total: 10, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 },
        };

      return {
        success: true,
        data: {
          total: pool.config?.connectionLimit || 10,
          active: pool._allConnections?.length || 0,
          idle: pool._freeConnections?.length || 0,
          waiting: pool._connectionQueue?.length || 0,
          avgConnectionTime: 0,
        },
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
    const { mysqlTable, varchar, json, datetime } = require("drizzle-orm/mysql-core");
    const { sql } = require("drizzle-orm");
    return mysqlTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      data: json("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      createdAt: datetime("createdAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      updatedAt: datetime("updatedAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    });
  }
}
