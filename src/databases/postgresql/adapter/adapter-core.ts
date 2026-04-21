/**
 * @file src/databases/postgresql/adapter/adapterCore.ts
 * @description Core functionality shared across PostgreSQL adapter modules.
 *
 * Features:
 * - Connect to PostgreSQL
 * - Disconnect from PostgreSQL
 * - Wait for connection
 * - Get connection health
 */

import { logger } from "@utils/logger";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type {
  DatabaseCapabilities,
  DatabaseError,
  DatabaseResult,
  ICrudAdapter,
  IBatchAdapter,
} from "../../db-interface";
import * as schema from "../schema/index";
import * as utils from "../utils";

export class AdapterCore {
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
  public db: PostgresJsDatabase<typeof schema> | null = null;
  private replicaSqls = new Map<string, ReturnType<typeof postgres>>();
  private allReplicaSqls: ReturnType<typeof postgres>[] = [];
  public crud!: ICrudAdapter;
  public batch!: IBatchAdapter;
  protected connected = false;
  public collectionRegistry = new Map<string, unknown>();
  public dynamicTables = new Map<string, any>();

  /**
   * Returns the appropriate SQL client based on the operation mode (read/write).
   * 🚀 Geographic Read-Replica Awareness.
   */
  public getSql(mode: "read" | "write" = "write"): ReturnType<typeof postgres> {
    if (!this.sql) throw new Error("Database not connected");

    if (mode === "write" || this.allReplicaSqls.length === 0) {
      return this.sql;
    }

    // 🌍 Geographic Routing
    const region = (globalThis as any).SVELTY_REGION || "unknown";
    if (this.replicaSqls.has(region)) {
      return this.replicaSqls.get(region)!;
    }

    // 🔄 Round-Robin Fallback
    const index = Math.floor(Math.random() * this.allReplicaSqls.length);
    return this.allReplicaSqls[index];
  }

  /**
   * Returns the appropriate Drizzle instance.
   */
  public getDb(mode: "read" | "write" = "write"): PostgresJsDatabase<typeof schema> {
    const client = this.getSql(mode);
    // Drizzle instances are lightweight; we can wrap a client on-the-fly or cache them
    return drizzle(client, { schema });
  }

  public getCapabilities(): DatabaseCapabilities {
    return this.capabilities;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  async connect(
    connection: string | Record<string, unknown>,
    _options?: unknown,
  ): Promise<DatabaseResult<void>> {
    try {
      let finalConnection = connection;

      // Fallback: If connection is missing or empty, try to build it from global config
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
        max: 100, // Increased for high-concurrency enterprise benchmarks
        connect_timeout: 30, // Increased stability
      };

      if (typeof finalConnection === "string") {
        // Parse connection string manually to ensure correct parameters
        try {
          const url = new URL(finalConnection);
          options = {
            ...options,
            host: url.hostname,
            port: Number(url.port) || 5432,
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.slice(1), // Remove leading slash
            ssl: url.searchParams.get("sslmode") === "require" ? "require" : undefined,
            onnotice: () => {
              /* Suppress notice messages */
            },
            transform: {
              undefined: null, // Transform undefined to null
            },
          };
        } catch (e) {
          logger.warn(
            "Failed to parse PostgreSQL connection string, falling back to raw string (might fail auth):",
            e,
          );
          this.sql = postgres(finalConnection, {
            onnotice: () => {
              /* Suppress notice messages */
            },
            transform: {
              undefined: null, // Transform undefined to null
            },
          });
          this.db = drizzle(this.sql, { schema });
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
          onnotice: () => {
            /* Suppress notice messages */
          },
          transform: {
            undefined: null, // Transform undefined to null
          },
        };
      }

      this.sql = postgres(options);
      this.db = drizzle(this.sql, { schema });

      this.sql = postgres(options);
      this.db = drizzle(this.sql, { schema });

      // Verification: Ensure the connection is actually established
      try {
        await this.sql`SELECT 1`;
      } catch (err: any) {
        logger.error(
          `Initial PostgreSQL connection check failed (Code: ${err.code}):`,
          err.message,
        );
        // If database doesn't exist (code 3D000 in Postgres), try creating it
        if (err.code === "3D000" && options.database) {
          logger.info(`Database "${options.database}" not found. Attempting to create it...`);
          const adminOptions = { ...options, database: "postgres" };
          const adminSql = postgres(adminOptions);
          try {
            await adminSql.unsafe(`CREATE DATABASE "${options.database}"`);
            logger.info(`Successfully created database "${options.database}".`);
            await adminSql.end();
            // Reconnect to the new database
            this.sql = postgres(options);
            this.db = drizzle(this.sql, { schema });
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
      this.db = null;
      this.connected = false;
      logger.info("Disconnected from PostgreSQL");
    }
    return { success: true, data: undefined };
  }

  public async waitForConnection?(): Promise<void> {
    if (this.connected) {
      return;
    }
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
      return {
        success: false,
        message: "Database not connected",
        error: utils.createDatabaseError("NOT_CONNECTED", "Database not connected"),
      };
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
          activeConnections: 0, // postgres.js doesn't expose this directly
        },
      };
    } catch (error) {
      return this.handleError(error, "HEALTH_CHECK_FAILED");
    }
  }

  public async getConnectionPoolStats(): Promise<
    DatabaseResult<import("../../db-interface").ConnectionPoolStats>
  > {
    try {
      if (!this.sql) {
        return {
          success: false,
          message: "Database connection not initialized",
          error: {
            code: "CONNECTION_NOT_INITIALIZED",
            message: "Connection not initialized",
          },
        };
      }

      // postgres.js manages connections internally
      return {
        success: true,
        data: {
          total: 10,
          active: 0,
          idle: 0,
          waiting: 0,
          avgConnectionTime: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get PostgreSQL pool stats",
        error: { code: "POOL_STATS_FAILED", message: String(error) },
      };
    }
  }

  public wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
    if (!this.db) {
      return Promise.resolve(this.notConnectedError());
    }
    try {
      return fn()
        .then((data) => ({ success: true, data }) as DatabaseResult<T>)
        .catch((error) => this.handleError(error, code));
    } catch (error) {
      return Promise.resolve(this.handleError(error, code));
    }
  }

  public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
    const message = error instanceof Error ? error.message : String(error);
    // Log full error object in debug/benchmark mode to capture stack traces
    if (process.env.BENCHMARK_DEBUG === "true" || process.env.SVELTY_AUDIT_ACTIVE) {
      logger.error(`PostgreSQL adapter error [${code}]:`, error);
    } else {
      logger.error(`PostgreSQL adapter error [${code}]:`, message);
    }
    return {
      success: false,
      message,
      error: utils.createDatabaseError(code, message, error) as DatabaseError,
    };
  }

  public notImplemented<T>(method: string): DatabaseResult<T> {
    const message = `Method ${method} not yet implemented for PostgreSQL adapter.`;
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

  // Common short aliases used by API routes and resolvers
  private static TABLE_ALIASES: Record<string, string> = {
    media: "mediaItems",
    MediaItem: "mediaItems",
    collections: "contentNodes",
    preferences: "systemPreferences",
    tokens: "authTokens",
    sessions: "authSessions",
    users: "authUsers",
    system_content_structure: "contentNodes",
  };

  public getTable(collection: string): Record<string, unknown> {
    const schemaAny = schema as unknown as Record<string, Record<string, unknown>>;

    // 1. Static schema tables
    if (schemaAny[collection]) {
      return schemaAny[collection];
    }

    // Convert snake_case to camelCase (e.g., 'media_items' → 'mediaItems')
    const camelKey = this.snakeToCamel(collection);
    if (schemaAny[camelKey]) {
      return schemaAny[camelKey];
    }

    // Check common aliases (e.g., 'media' → 'mediaItems')
    const alias = AdapterCore.TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) {
      return schemaAny[alias];
    }

    // 2. Dynamic collection tables (UUID-based or Name-based)
    if (this.dynamicTables.has(collection)) {
      return this.dynamicTables.get(collection)!;
    }

    // Treat as dynamic if it's not a static schema table and doesn't match common aliases
    const tableId = collection.startsWith("collection_") ? collection : `collection_${collection}`;

    // Check if we already have this dynamic table defined
    if (this.dynamicTables.has(tableId)) {
      return this.dynamicTables.get(tableId);
    }

    // If it's a UUID or starts with collection_, or it's a known dynamic collection
    if (
      /^[a-f0-9]{32,36}$/i.test(collection) ||
      collection.startsWith("collection_") ||
      this.collectionRegistry.has(collection)
    ) {
      // Robust registry check: ensure the ID is registered if not already present
      if (!this.collectionRegistry.has(collection)) {
        this.collectionRegistry.set(collection, { _id: collection });
      }

      const dynamicTable = this.createDynamicTableDefinition(tableId);
      this.dynamicTables.set(collection, dynamicTable);
      this.dynamicTables.set(tableId, dynamicTable);
      return dynamicTable as unknown as Record<string, unknown>;
    }

    // Final fallback to contentNodes
    return schema.contentNodes as unknown as Record<string, unknown>;
  }

  /**
   * Creates a Drizzle table definition for a dynamic collection at runtime.
   * All dynamic collections sharing a common relational structure for flexibility.
   */
  private createDynamicTableDefinition(tableName: string) {
    const { pgTable, varchar, jsonb, timestamp } = require("drizzle-orm/pg-core");
    const { sql } = require("drizzle-orm");

    return pgTable(tableName, {
      _id: varchar("_id", { length: 36 }).primaryKey(),
      tenantId: varchar("tenantId", { length: 36 }),
      data: jsonb("data").notNull().default({}),
      status: varchar("status", { length: 50 }).notNull().default("draft"),
      createdAt: timestamp("createdAt", { withTimezone: true })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      updatedAt: timestamp("updatedAt", { withTimezone: true })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    });
  }

  public mapQuery(table: Record<string, unknown>, query: Record<string, unknown>): unknown {
    if (!query || Object.keys(query).length === 0) {
      return undefined;
    }

    const conditions: import("drizzle-orm").SQL[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith("$")) {
        continue; // Skip MongoDB operators
      }
      const column = table[key] as import("drizzle-orm").Column;
      if (column) {
        if (value === null) {
          conditions.push(isNull(column));
        } else if (Array.isArray(value)) {
          conditions.push(inArray(column, value));
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

  /**
   * Hot-loads read-replica configuration.
   * Can be called at runtime when settings are updated in the database.
   */
  public configureReplicas(urls: string[] | string): void {
    const replicaUrls = typeof urls === "string" ? (JSON.parse(urls) as string[]) : urls;
    if (!Array.isArray(replicaUrls)) return;

    // Close existing replica connections
    for (const sql of this.allReplicaSqls) {
      sql.end();
    }

    this.allReplicaSqls = [];
    this.replicaSqls.clear();

    if (replicaUrls.length === 0) {
      logger.info("Read replica cluster cleared.");
      return;
    }

    const postgres = require("postgres");
    for (const urlStr of replicaUrls) {
      try {
        const url = new URL(urlStr);
        const region = url.searchParams.get("region") || "unknown";
        const replicaSql = postgres(urlStr, {
          max: 50,
          onnotice: () => {},
          transform: { undefined: null },
        });
        this.allReplicaSqls.push(replicaSql);
        if (region !== "unknown") {
          this.replicaSqls.set(region, replicaSql);
        }
      } catch (e) {
        logger.warn(`Failed to initialize replica ${urlStr}:`, e);
      }
    }
    logger.info(
      `Initialized ${this.allReplicaSqls.length} read replicas from database configuration.`,
    );
  }
}
