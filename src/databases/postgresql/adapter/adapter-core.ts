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
  public crud!: ICrudAdapter;
  public batch!: IBatchAdapter;
  protected connected = false;
  public collectionRegistry = new Map<string, unknown>();
  public dynamicTables = new Map<string, any>();

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
        max: 10,
        connect_timeout: 10,
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
        options = {
          ...options,
          host: (finalConnection as any).host,
          port: (finalConnection as any).port,
          user: (finalConnection as any).user,
          password: (finalConnection as any).password,
          database: (finalConnection as any).database,
          ssl:
            (finalConnection as any).ssl === true || (finalConnection as any).ssl === "require"
              ? "require"
              : undefined,
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
    logger.error(`PostgreSQL adapter error [${code}]:`, message);
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

    if (/^[a-f0-9]{32,36}$/i.test(collection) || collection.startsWith("collection_")) {
      const tableId = collection.startsWith("collection_")
        ? collection
        : `collection_${collection}`;
      const dynamicTable = this.createDynamicTableDefinition(tableId);
      this.dynamicTables.set(collection, dynamicTable);
      return dynamicTable as unknown as Record<string, unknown>;
    }

    // Fallback to contentNodes
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
}
