/**
 * @file src/databases/postgresql/adapter-core.ts
 * @description
 * Core functionality for PostgreSQL database adapter.
 *
 * Responsibilities include:
 * - Establishing connection to PostgreSQL using postgres.js.
 * - Implementing PostgreSQL-specific CRUD hooks and table provisioning.
 *
 * ### Features:
 * - connection pooling and health checks
 * - native postgres JSONB querying
 * - optimized single-statement atomic increment
 * - PgBouncer compatibility (DATABASE_PREPARE flag)
 * - read replica support
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
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as drizzleSql, type SQL } from "drizzle-orm";
import { pgTable, varchar, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import * as utils from "../core/relational-utils";
import { registerTableSchema } from "../core/relational-utils";

export abstract class PostgresAdapterCore extends SqlAdapterCore {
  public type = "postgresql";
  public capabilities: DatabaseCapabilities = {
    supportsTransactions: true,
    supportsIndexing: true,
    supportsFullTextSearch: true,
    supportsAggregation: true,
    supportsStreaming: true,
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
  private _readDb: PostgresJsDatabase<typeof schema> | null = null;
  private replicaSqls = new Map<string, ReturnType<typeof postgres>>();
  private allReplicaSqls: ReturnType<typeof postgres>[] = [];
  protected _transactionModule?: import("./transaction-module").TransactionModule;

  // --------------------------------------------------------------------------
  // Abstract hook implementations
  // --------------------------------------------------------------------------

  /** PostgreSQL supports RETURNING on INSERT and UPDATE. */
  protected get insertReturnsRows(): boolean {
    return true;
  }

  protected get updateReturnsRows(): boolean {
    return true;
  }

  protected get useDynamicSqlInFindMany(): boolean {
    return true;
  }

  protected isMissingTableError(err: any): boolean {
    return err?.code === "42P01";
  }

  public readonly schema = schema;

  public getJsonField(field: string): SQL {
    if (field.includes(".")) {
      const path = `{${field.split(".").join(",")}}`;
      return drizzleSql`data#>>${path}`;
    }
    return drizzleSql`data->>${field}`;
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
  // Read Replicas
  // --------------------------------------------------------------------------

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

  public getDrizzle(mode: "read" | "write" = "write"): PostgresJsDatabase<typeof schema> {
    if (mode === "write") return this.db;
    if (this._readDb) return this._readDb;

    const client = this.getSql("read");
    this._readDb = drizzle(client, { schema });
    return this._readDb;
  }

  public configureReplicas(urls: string[] | string): void {
    const replicaUrls = typeof urls === "string" ? (JSON.parse(urls) as string[]) : urls;
    if (!Array.isArray(replicaUrls)) return;
    for (const sql of this.allReplicaSqls)
      sql.end().catch(() => {
        logger.debug("Failed to end PostgreSQL replica SQL during reconfiguration");
      });
    this.allReplicaSqls = [];
    this.replicaSqls.clear();
    if (replicaUrls.length === 0) return;

    for (const urlStr of replicaUrls) {
      try {
        const url = new URL(urlStr);
        const region = url.searchParams.get("region") || "unknown";
        const replicaSql = postgres(urlStr, {
          max: 50,
          transform: { undefined: null },
        });
        this.allReplicaSqls.push(replicaSql);
        if (region !== "unknown") this.replicaSqls.set(region, replicaSql);
      } catch (e) {
        logger.warn(`Failed to initialize replica ${urlStr}:`, e);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

  public getClient(): ReturnType<typeof postgres> | null {
    return this.sql;
  }

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
        throw new Error("Missing PostgreSQL connection configuration.");
      }

      let options: any;

      const { createPostgresOnCloseHandler } = await import("../resilience-integration");
      const onclose = createPostgresOnCloseHandler(this);

      if (typeof finalConnection === "string") {
        options = {
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || 200,
          connect_timeout: 30,
          onclose,
        };
        let poolerUrl = process.env.DATABASE_POOLER_URL;
        let effectivePrepare = true;

        if (poolerUrl) {
          const { getDbPoolerConfig } = await import("../config-state");
          const pooler = getDbPoolerConfig ? getDbPoolerConfig() : null;
          if (pooler) {
            poolerUrl = pooler.url || poolerUrl;
            effectivePrepare = pooler.prepare !== false;
          }
        }

        let effectiveConnection = finalConnection;
        if (poolerUrl) {
          effectiveConnection = poolerUrl;
        }

        const url = new URL(effectiveConnection);
        options = {
          host: url.hostname,
          port: Number(url.port || 5432),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          database: url.pathname.slice(1),
          ssl:
            url.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          max: Number(process.env.DATABASE_MAX_CONNECTIONS) || 200,
          connect_timeout: 30,
          prepare: effectivePrepare,
          connection: {
            application_name: "sveltycms",
            statement_timeout: 30000,
          },
        };
      } else {
        const c = (finalConnection || {}) as any;
        const usePrepared = (c.prepare ?? process.env.DATABASE_PREPARE ?? "true") !== "false";

        options = {
          host: c.host || c.DB_HOST || "127.0.0.1",
          port: Number(c.port || c.DB_PORT || 5432),
          user: c.user || c.DB_USER || "postgres",
          password: c.password || c.DB_PASSWORD || "",
          database: c.database || c.DB_NAME,
          max: Number(c.max || process.env.DATABASE_MAX_CONNECTIONS || 200),
          connect_timeout: c.connect_timeout || 30,
          ssl: c.ssl || false,
          onnotice: () => {},
          onclose,
          transform: { undefined: null },
          prepare: usePrepared,
          idle_timeout: c.idle_timeout || 60,
          max_lifetime: c.max_lifetime || 60 * 30,
          connection: {
            application_name: "sveltycms",
            statement_timeout: 30000,
          },
        };
      }

      // Auto-create database if missing
      try {
        this.sql = postgres(finalConnection, options);
        this._db = drizzle(this.sql, { schema });
        await this.sql`SELECT 1`;
        this.connected = true;
        logger.info("Connected to PostgreSQL");
        return { success: true, data: undefined };
      } catch (err: any) {
        const isMissingDb = err.code === "3D000" || err.message?.includes("does not exist");

        if (isMissingDb && typeof finalConnection === "string") {
          const dbName = new URL(finalConnection).pathname.slice(1);
          if (dbName) {
            logger.info(`[postgresql] Database "${dbName}" not found. Attempting auto-creation...`);
            const adminOptions = { ...options, database: "postgres" };
            const adminSql = postgres(
              finalConnection.replace(`/${dbName}`, "/postgres"),
              adminOptions,
            );
            try {
              await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
              await adminSql.end();
              this.sql = postgres(finalConnection, options);
              this._db = drizzle(this.sql, { schema });
              await this.sql`SELECT 1`;
              this.connected = true;
              logger.info("Connected to PostgreSQL");
              return { success: true, data: undefined };
            } catch (createErr) {
              await adminSql.end();
              throw createErr;
            }
          }
        }
        throw err;
      }
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
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const count = Number(result[0]?.count ?? 0);
      return { success: true, data: count === 0 };
    } catch (error) {
      return this.handleError(error, "CHECK_EMPTY_FAILED");
    }
  }

  public async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../db-interface").ConnectionPoolStats>
  > {
    if (!this.sql) return this.notConnectedError();
    return {
      success: true,
      data: {
        total: 0,
        active: 0,
        idle: 0,
        waiting: 0,
        avgConnectionTime: 0,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Schema & Dynamic Tables
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

    return pgTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      collection: varchar("collection", { length: 255 }),
      slug: varchar("slug", { length: 255 }),
      locale: varchar("locale", { length: 50 }),
      publishedAt: timestamp("publishedAt", { withTimezone: true }),
      data: jsonb("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      isDeleted: boolean("isDeleted").notNull().default(false),
      createdAt: timestamp("createdAt", { withTimezone: true })
        .notNull()
        .default(drizzleSql`CURRENT_TIMESTAMP`),
      updatedAt: timestamp("updatedAt", { withTimezone: true })
        .notNull()
        .default(drizzleSql`CURRENT_TIMESTAMP`),
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
        if (!this.sql) throw new Error("Database not connected");
        return this.sql.unsafe(sqlText, params);
      },
      client: this.sql,
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
  // Stream Many (PostgreSQL-specific native streaming)
  // --------------------------------------------------------------------------

  public async streamMany<T extends import("../db-interface").BaseEntity>(
    collection: string,
    query: import("../db-interface").QueryFilter<T>,
    options: import("../db-interface").FindOptions<T> = {},
  ): Promise<import("../db-interface").DatabaseResult<AsyncIterable<T>>> {
    return this.wrap(async () => {
      const q =
        this.hooks.length > 0
          ? await this.runHooks("before", "find", collection, query, options)
          : query;
      const table = this.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const where = this.mapQuery(table, q, options);
      let builder = (this.db as any).select().from(table).where(where);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.offset) builder = builder.offset(options.offset);

      const stream = await (builder as any).stream();
      const convertFn = utils.convertDatesToISO;

      async function* generator() {
        for await (const row of stream) {
          yield convertFn(row) as T;
        }
      }

      return generator() as AsyncIterable<T>;
    }, "STREAM_MANY_FAILED");
  }

  // --------------------------------------------------------------------------
  // Upsert Native
  // --------------------------------------------------------------------------

  async upsertNative(
    table: any,
    values: any,
    conflictTarget: any[],
    options: BaseQueryOptions = {},
  ): Promise<void> {
    const tableName = getTableName(table);

    if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
      logger.info(
        `[upsertNative] Table: ${tableName}, ID: ${values._id}, source: ${values.source}, tenant: ${values.tenantId}`,
      );
    }

    await this.wrap(
      async () => {
        const db = this.getDrizzleInstance(options);
        await (db.insert(table).values(values) as any).onConflictDoUpdate({
          target: conflictTarget,
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

        const tenantFilter = utils.buildRawTenantFilter(options, "postgres");

        const dataCol = this.getColumn(table, "data");
        const sqlQuery = dataCol
          ? `UPDATE "${tableName}" SET "data" = jsonb_set(CASE WHEN jsonb_typeof("data") = 'object' THEN "data" ELSE '{}'::jsonb END, '{${field}}', to_jsonb(coalesce((CASE WHEN jsonb_typeof("data") = 'object' THEN "data" ELSE '{}'::jsonb END->>'${field}')::numeric, 0) + ${amount})), "updatedAt" = now() WHERE "${idCol.name}" = '${String(id)}'${tenantFilter} RETURNING *`
          : `UPDATE "${tableName}" SET "${field}" = coalesce("${field}", 0) + ${amount}, "updatedAt" = now() WHERE "${idCol.name}" = '${String(id)}'${tenantFilter} RETURNING *`;

        let rows: any[] = [];
        for (let attempt = 0; attempt < 5 && rows.length === 0; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 10 * attempt));
          try {
            rows = (await this.raw.execute(sqlQuery)) || [];
          } catch (err: any) {
            if (err?.message?.includes("too many clients") || err?.code === "53300") {
              await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
        if (rows.length === 0) {
          throw new Error(`Entry not found after increment: ${String(id)}`);
        }
        return rows[0] as Record<string, unknown>;
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

        const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" VARCHAR(36) PRIMARY KEY, "tenantId" VARCHAR(36), "status" VARCHAR(255) DEFAULT 'draft', "isDeleted" BOOLEAN DEFAULT FALSE, "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "data" JSONB);`;

        if (debugMode && !isBenchSuite) {
          console.log(`[DB Provision] [POSTGRESQL] Executing DDL for ${physicalName}`);
        }
        await this.raw.execute(ddl);

        const columns = [
          { name: "isDeleted", type: "BOOLEAN DEFAULT FALSE" },
          { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
          { name: "tenantId", type: "VARCHAR(36)" },
          {
            name: "createdAt",
            type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
          },
          { name: "collection", type: "VARCHAR(255)" },
          { name: "slug", type: "VARCHAR(255)" },
          { name: "locale", type: "VARCHAR(50)" },
          { name: "publishedAt", type: "TIMESTAMP WITH TIME ZONE" },
        ];

        const dynamicCols = ["collection", "slug", "locale", "publishedAt"];

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          for (const field of schemaData.fields) {
            if (field.indexed || field.unique) {
              const fieldName = field.db_fieldName || field.label;
              if (fieldName) {
                let colType = "VARCHAR(255)";
                if (field.type === "boolean") {
                  colType = "BOOLEAN";
                } else if (field.type === "number" || field.type === "integer") {
                  colType = "INTEGER";
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
            await this.raw.execute(
              `ALTER TABLE "${physicalName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`,
            );
          } catch {
            /* safe */
          }
        }

        for (const colName of dynamicCols) {
          try {
            const indexName = `${physicalName}_${colName}_idx`;
            await this.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${colName}")`,
            );
          } catch {
            /* safe */
          }
        }
      },
      "CREATE_MODEL_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}
