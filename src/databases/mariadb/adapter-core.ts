/**
 * @file src/databases/mariadb/adapter-core.ts
 * @description
 * Core functionality for MariaDB database adapter.
 *
 * Responsibilities include:
 * - Establishing connection pool to MariaDB/MySQL.
 * - Implementing MariaDB-specific CRUD hooks and table provisioning.
 *
 * ### Features:
 * - automated database auto-creation
 * - JSON_SET / JSON_EXTRACT atomic increments
 * - transaction handling and metadata mapping
 */

import { logger } from "@src/utils/logger";
import { SqlAdapterCore } from "../core/sql-adapter-core";
import type {
  BaseQueryOptions,
  DatabaseCapabilities,
  DatabaseResult,
  DatabaseId,
} from "../db-interface";
import * as helpers from "../core/drizzle-sql-helpers";
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, type SQL } from "drizzle-orm";
import { mysqlTable, varchar, json, datetime, boolean } from "drizzle-orm/mysql-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";

export abstract class AdapterCore extends SqlAdapterCore {
  public type = "mariadb";
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

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  protected get convertDatesOptions(): Record<string, any> {
    return { mariaDoubleParseJson: true };
  }

  protected isMissingTableError(err: any): boolean {
    return err?.errno === 1146;
  }

  public readonly schema = schema;

  public getJsonField(field: string): SQL {
    const path = `$.${field}`;
    return sql`JSON_UNQUOTE(JSON_EXTRACT(data, ${path}))`;
  }

  public getTable(collection: string): any {
    if (typeof collection !== "string") return null;

    const cached = this.tableRegistry.get(collection);
    if (cached) return cached;

    if (this._resolving.has(collection)) {
      logger.error(`Infinite recursion detected in getTable for: ${collection}`);
      return null;
    }
    this._resolving.add(collection);

    try {
      if (helpers.isSystemTable(collection)) {
        const aliased = this.getAliasedTable(collection);
        if (aliased) {
          this.tableRegistry.set(collection, aliased);
          return aliased;
        }
      }

      const cleanId = collection.replace(/-/g, "");
      const tableName = cleanId.startsWith("collection_") ? cleanId : `collection_${cleanId}`;

      const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
      if (helpers.isSystemTable(cleanName) && cleanName !== collection) {
        return this.getTable(cleanName);
      }

      const dynamicTable = this.createDynamicTableDefinition(tableName);
      this.tableRegistry.set(collection, dynamicTable);
      return dynamicTable;
    } finally {
      this._resolving.delete(collection);
    }
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(connection: any, _options?: any): Promise<DatabaseResult<void>> {
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
        poolConfig = {
          uri: finalConnection,
          connectionLimit: 100,
          connectTimeout: 30000,
          maxIdle: 50,
          idleTimeout: 60000,
          charset: "utf8mb4",
        };
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
          maxIdle: 50,
          idleTimeout: 60000,
          queueLimit: 0,
          enableKeepAlive: true,
          charset: "utf8mb4",
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
          err.message.includes("Unknown database");

        if (isMissingDb) {
          const dbName = this.activeDatabaseName;
          if (dbName && dbName !== "unknown") {
            logger.info(`[mariadb] Database "${dbName}" not found. Attempting auto-creation...`);
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
        await this.pool.end().catch(() => {
          logger.debug("MariaDB pool end failed during connection error cleanup");
        });
        this.pool = null;
      }
      this.connected = false;
      return this.handleError(error, "CONNECTION_FAILED");
    }
  }

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

  // --------------------------------------------------------------------------
  // Schema & Table Management
  // --------------------------------------------------------------------------

  public createDynamicTableDefinition(tableName: string) {
    registerTableSchema(tableName, [
      "_id",
      "tenantId",
      "collection",
      "slug",
      "locale",
      "publishedAt",
      "data",
      "status",
      "isDeleted",
      "createdAt",
      "updatedAt",
    ]);

    return mysqlTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      collection: varchar("collection", { length: 255 }),
      slug: varchar("slug", { length: 255 }),
      locale: varchar("locale", { length: 50 }),
      publishedAt: datetime("publishedAt"),
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

  // --------------------------------------------------------------------------
  // Raw Access
  // --------------------------------------------------------------------------

  public get raw(): {
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

  // --------------------------------------------------------------------------
  // Transaction
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Upsert Native
  // --------------------------------------------------------------------------

  async upsertNative(
    table: any,
    values: any,
    _conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        await (db.insert(table).values(values) as any).onDuplicateKeyUpdate({
          set: values,
        });
      },
      "UPSERT_NATIVE_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // Atomic Increment
  // --------------------------------------------------------------------------

  private _returningSupported: boolean | null = null;

  async atomicIncrement(
    collection: string,
    id: DatabaseId,
    field: string,
    amount: number,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<Record<string, unknown>>> {
    return this.wrap(
      async () => {
        const table = this.getTable(collection);
        if (!table) throw new Error(`Collection table not found: ${collection}`);
        const tableName = getTableName(table);
        const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
        if (!idCol) throw new Error("ID column not found");

        const tenantFilter = utils.buildRawTenantFilter(options, "mysql");

        const dataCol = this.getColumn(table, "data");
        const idStr = String(id);
        const drizzle = this.getDrizzleInstance(options);

        if (this._returningSupported !== false) {
          try {
            const upsertSql = dataCol
              ? `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`updatedAt\`) VALUES ('${idStr}', '{}', NOW()) ON DUPLICATE KEY UPDATE \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${field}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${field}'), 0) + ${amount}), \`updatedAt\` = NOW() RETURNING *`
              : `INSERT INTO \`${tableName}\` (\`_id\`, \`${field}\`, \`updatedAt\`) VALUES ('${idStr}', ${amount}, NOW()) ON DUPLICATE KEY UPDATE \`${field}\` = COALESCE(\`${field}\`, 0) + ${amount}, \`updatedAt\` = NOW() RETURNING *`;

            const execResult = await drizzle.execute(sql.raw(upsertSql));
            let rows: any = null;
            if (Array.isArray(execResult)) {
              rows = execResult[0];
            } else {
              rows = (execResult as any).rows || execResult;
            }

            if (Array.isArray(rows) && rows.length > 0) {
              this._returningSupported = true;
              return utils.convertDatesToISO(rows[0], {
                mariaDoubleParseJson: true,
                table: collection,
              }) as Record<string, unknown>;
            }
          } catch (err: any) {
            this._returningSupported = false;
            logger.debug(
              `MariaDB INSERT...RETURNING not supported, using inline SELECT fallback: ${err.message}`,
            );
          }
        }

        // Fallback: UPDATE + inline SELECT
        if (dataCol) {
          await drizzle.execute(
            sql.raw(
              `UPDATE \`${tableName}\` SET \`data\` = JSON_SET(COALESCE(\`data\`, '{}'), '$.${field}', COALESCE(JSON_EXTRACT(COALESCE(\`data\`, '{}'), '$.${field}'), 0) + ${amount}), \`updatedAt\` = NOW() WHERE \`_id\` = '${idStr}'${tenantFilter}`,
            ),
          );
        } else {
          await drizzle.execute(
            sql.raw(
              `UPDATE \`${tableName}\` SET \`${field}\` = COALESCE(\`${field}\`, 0) + ${amount}, \`updatedAt\` = NOW() WHERE \`_id\` = '${idStr}'${tenantFilter}`,
            ),
          );
        }

        const selectResult = await drizzle.execute(
          sql.raw(
            `SELECT * FROM \`${tableName}\` WHERE \`_id\` = '${idStr}'${tenantFilter} LIMIT 1`,
          ),
        );

        let fallbackRows: any[] = [];
        if (Array.isArray(selectResult)) {
          fallbackRows = (selectResult as unknown as any[][])[0] || [];
        } else {
          fallbackRows = (selectResult as any).rows || [];
        }

        if (!fallbackRows || fallbackRows.length === 0) {
          throw new Error(`Entry not found after increment: ${idStr}`);
        }

        return utils.convertDatesToISO(fallbackRows[0], {
          mariaDoubleParseJson: true,
          table: collection,
        }) as Record<string, unknown>;
      },
      "ATOMIC_INCREMENT_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
  }

  // --------------------------------------------------------------------------
  // Create Model (Table Provisioning)
  // --------------------------------------------------------------------------

  public async createModel(schemaData: any): Promise<void> {
    const tableName = schemaData._id || schemaData.id;
    if (!tableName) throw new Error("Schema must have an _id");

    const normalizedName = tableName.replace(/-/g, "");
    const table = this.getTable(normalizedName);
    const physicalName = getTableName(table as any);

    await this.wrap(
      async () => {
        const isBenchSuite = process.env.SVELTY_BENCHMARK_SUITE === "true";
        const debugMode = process.env.BENCHMARK_DEBUG === "true";

        if (debugMode && !isBenchSuite) {
          console.log(
            `[DB Provision] SVELTY_BENCHMARK_SUITE=${process.env.SVELTY_BENCHMARK_SUITE || "standalone"}`,
          );
        }

        const ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`status\` VARCHAR(255) DEFAULT 'draft', \`isDeleted\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME, \`updatedAt\` DATETIME, \`data\` LONGTEXT);`;

        if (ddl) {
          if (debugMode && !isBenchSuite) {
            console.log(`[DB Provision] [MARIADB] Executing DDL for ${physicalName}`);
          }
          await this.raw.execute(ddl);
        }

        const columns = [
          { name: "isDeleted", type: "TINYINT(1) DEFAULT 0" },
          { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
          { name: "tenantId", type: "VARCHAR(36)" },
          { name: "createdAt", type: "DATETIME" },
          { name: "updatedAt", type: "DATETIME" },
          { name: "collection", type: "VARCHAR(255)" },
          { name: "slug", type: "VARCHAR(255)" },
          { name: "locale", type: "VARCHAR(50)" },
          { name: "publishedAt", type: "DATETIME" },
        ];

        const dynamicCols = ["collection", "slug", "locale", "publishedAt"];

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          for (const field of schemaData.fields) {
            if (field.indexed || field.unique) {
              const fieldName = field.db_fieldName || field.label;
              if (fieldName) {
                let colType = "VARCHAR(255)";
                if (field.type === "boolean") {
                  colType = "TINYINT(1)";
                } else if (field.type === "number" || field.type === "integer") {
                  colType = "INT";
                }
                const reserved = [
                  "_id",
                  "id",
                  "tenantId",
                  "status",
                  "isDeleted",
                  "createdAt",
                  "updatedAt",
                  "collection",
                  "slug",
                  "locale",
                  "publishedAt",
                  "data",
                ];
                if (!reserved.includes(fieldName)) {
                  columns.push({ name: fieldName, type: colType });
                  dynamicCols.push(fieldName);
                }
              }
            }
          }
        }

        registerTableSchema(normalizedName, ["_id", "data", ...columns.map((c: any) => c.name)]);

        for (const col of columns) {
          try {
            const query = `SHOW COLUMNS FROM \`${physicalName}\` LIKE '${col.name}'`;
            const res = await this.raw.execute(query);
            const exists = res.length > 0;

            if (!exists) {
              const alterSql = `ALTER TABLE \`${physicalName}\` ADD COLUMN \`${col.name}\` ${col.type}`;
              await this.raw.execute(alterSql);
            }
          } catch {
            /* safe */
          }
        }

        for (const colName of dynamicCols) {
          try {
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
            );
          } catch {
            /* safe */
          }
        }

        logger.info(`[MARIADB Adapter] Provisioned table: ${physicalName}`);
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}

export * from "./adapter-core";
