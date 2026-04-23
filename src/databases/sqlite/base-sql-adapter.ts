/**
 * @file src/databases/sqlite/base-sql-adapter.ts
 * @description
 * Unified base class for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * Provides shared logic for query mapping, dynamic table resolution, and error handling.
 * This ensures feature parity and consistent behavior across all SQL engines.
 */

import { logger } from "@src/utils/logger.server";
import {
  and,
  type Column,
  eq,
  inArray,
  isNull,
  ne,
  gt,
  gte,
  lt,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { BaseAdapter } from "../base-adapter";
import type { DatabaseError, DatabaseResult } from "../db-interface";

export abstract class BaseSqlAdapter extends BaseAdapter {
  public collectionRegistry = new Map<string, any>();
  public dynamicTables = new Map<string, any>();

  /**
   * Unified MongoDB-style query mapping for SQL adapters.
   * Supports common operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $like, $contains, $or, $and.
   */
  public mapQuery(table: Record<string, unknown>, query: Record<string, unknown>): SQL | undefined {
    if (!query || Object.keys(query).length === 0) {
      return undefined;
    }

    const conditions: SQL[] = [];

    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith("$")) {
        // TODO: Handle top-level operators like $or, $and
        continue;
      }

      const column = table[key] as Column;
      if (!column) continue;

      if (value === null) {
        conditions.push(isNull(column));
      } else if (Array.isArray(value)) {
        conditions.push(value.length ? inArray(column, value) : sql`1=0`);
      } else if (typeof value === "object" && value !== null) {
        // Handle MongoDB-style operators: { field: { $in: [...] } }
        const obj = value as Record<string, unknown>;
        for (const [op, val] of Object.entries(obj)) {
          switch (op) {
            case "$in":
              if (Array.isArray(val)) {
                conditions.push(val.length ? inArray(column, val) : sql`1=0`);
              }
              break;
            case "$nin":
              if (Array.isArray(val)) {
                conditions.push(val.length ? sql`${column} NOT IN ${val}` : sql`1=1`);
              }
              break;
            case "$ne":
              conditions.push(ne(column, val as any));
              break;
            case "$gt":
              conditions.push(gt(column, val as any));
              break;
            case "$gte":
              conditions.push(gte(column, val as any));
              break;
            case "$lt":
              conditions.push(lt(column, val as any));
              break;
            case "$lte":
              conditions.push(lte(column, val as any));
              break;
            case "$like":
              conditions.push(sql`${column} LIKE ${val}`);
              break;
            case "$contains":
              conditions.push(sql`${column} LIKE ${"%" + val + "%"}`);
              break;
          }
        }
      } else {
        // Simple equality
        conditions.push(eq(column, value as any));
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return and(...conditions);
  }

  /**
   * Standardized SQL error handler.
   */
  public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
    const message = error instanceof Error ? error.message : String(error);

    // Check if we are in benchmark/debug mode for more verbose logging
    if (process.env.BENCHMARK_DEBUG === "true" || process.env.SVELTY_AUDIT_ACTIVE) {
      logger.error(`[SQL Adapter] Error [${code}]:`, error);
    } else {
      logger.error(`[SQL Adapter] Error [${code}]:`, message);
    }

    return {
      success: false,
      message,
      error: {
        code,
        message,
        details: error,
      } as DatabaseError,
    };
  }

  /**
   * Common logic for snake_case to camelCase conversion.
   */
  protected snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Helper to create a dynamic table definition for SQL adapters.
   * This should be overridden by specific adapters to use their specific core (sqliteTable, pgTable, etc.)
   */
  public abstract createDynamicTableDefinition(tableName: string): any;

  /**
   * Common getTable resolution logic for SQL adapters.
   */
  public abstract getTable(collection: string): Record<string, unknown>;

  protected static TABLE_ALIASES: Record<string, string> = {
    media: "mediaItems",
    MediaItem: "mediaItems",
    collections: "contentNodes",
    content_nodes: "contentNodes",
    preferences: "systemPreferences",
    system_preferences: "systemPreferences",
    tokens: "authTokens",
    auth_tokens: "authTokens",
    sessions: "authSessions",
    auth_sessions: "authSessions",
    users: "authUsers",
    auth_users: "authUsers",
    system_users: "authUsers",
    system_content_structure: "contentNodes",
    roles: "roles",
    system_roles: "roles",
    audit_logs: "auditLogs",
    system_audit_logs: "auditLogs",
  };
  protected getAliasedTable(collection: string, schema: any): Record<string, unknown> | null {
    // 🚀 ULTRA ELITE: Handle both flat and nested schema objects
    const schemaAny = (schema.schema || schema) as unknown as Record<
      string,
      Record<string, unknown>
    >;

    // Strip prefix to handle variations like 'collection_system_users'
    const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;

    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(`[SQL Trace] Routing: "${collection}" (cleaned: "${cleanName}")`);
    }

    if (schemaAny[collection]) return schemaAny[collection];
    if (schemaAny[cleanName]) return schemaAny[cleanName];

    const camelKey = this.snakeToCamel(cleanName);
    if (schemaAny[camelKey]) {
      if (process.env.BENCHMARK_DEBUG === "true")
        logger.info(`[SQL Trace] Matched Camel: "${camelKey}"`);
      return schemaAny[camelKey];
    }

    const alias = (BaseSqlAdapter as any).TABLE_ALIASES[cleanName];
    if (alias && schemaAny[alias]) {
      if (process.env.BENCHMARK_DEBUG === "true")
        logger.info(`[SQL Trace] Matched Alias: "${cleanName}" -> "${alias}"`);
      return schemaAny[alias];
    }

    if (process.env.BENCHMARK_DEBUG === "true")
      logger.warn(`[SQL Trace] No alias found for "${collection}"`);
    return null;
  }
}
