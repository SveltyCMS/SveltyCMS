/**
 * @file src/databases/sqlite/base-sql-adapter.ts
 * @description
 * Unified base class for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * Provides shared logic for query mapping, dynamic table resolution, and error handling.
 * This ensures feature parity and consistent behavior across all SQL engines.
 */

import { logger } from "@src/utils/logger";
import {
  and,
  or,
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

import { queryTranslator, type LogicalGroup, type QueryCondition } from "../agnostic-core/query-ir";

export abstract class BaseSqlAdapter extends BaseAdapter {
  public collectionRegistry = new Map<string, any>();
  public dynamicTables = new Map<string, any>();

  /**
   * 🚀 AGNOSTIC CORE: All SQL adapters MUST expose a Drizzle database instance.
   */
  public abstract get db(): any;

  /**
   * Translates a raw MongoDB-style query into a Drizzle SQL condition.
   * 🚀 We now use the Unified Query IR as an intermediate step.
   */
  public mapQuery(table: Record<string, unknown>, query: Record<string, unknown>): SQL | undefined {
    if (!query || Object.keys(query).length === 0) return undefined;

    // 1. Translate to IR
    const ir = queryTranslator.translate("temp", query);

    // 2. Map IR to SQL
    return this.mapIRToSQL(table, ir.filter);
  }

  /**
   * Recursively maps the Unified Query IR LogicalGroup to Drizzle SQL.
   */
  private mapIRToSQL(table: any, group: LogicalGroup): SQL | undefined {
    const conditions: SQL[] = [];

    for (const item of group.conditions) {
      if ("operator" in item && "conditions" in item) {
        // Nested logical group
        const sub = this.mapIRToSQL(table, item as LogicalGroup);
        if (sub) {
          if (item.operator === "$or") conditions.push(or(sub)!);
          else if (item.operator === "$and") conditions.push(and(sub)!);
          else if (item.operator === "$not") conditions.push(sql`NOT (${sub})`);
        }
      } else {
        // Query condition
        const cond = item as QueryCondition;
        const column = table[cond.field] as Column;
        const value = cond.value;

        if (column) {
          switch (cond.operator) {
            case "$eq":
              conditions.push(value === null ? isNull(column) : eq(column, value));
              break;
            case "$ne":
              conditions.push(ne(column, value));
              break;
            case "$gt":
              conditions.push(gt(column, value));
              break;
            case "$gte":
              conditions.push(gte(column, value));
              break;
            case "$lt":
              conditions.push(lt(column, value));
              break;
            case "$lte":
              conditions.push(lte(column, value));
              break;
            case "$in":
              conditions.push(inArray(column, value));
              break;
            case "$nin":
              conditions.push(sql`${column} NOT IN ${value}`);
              break;
            case "$contains":
            case "$regex": // 🚀 ADDED: Map regex to LIKE for basic search compatibility
              conditions.push(sql`${column} LIKE ${"%" + value + "%"}`);
              break;
            case "$like":
              conditions.push(sql`${column} LIKE ${value}`);
              break;
            case "$exists":
              conditions.push(value ? sql`${column} IS NOT NULL` : isNull(column));
              break;
          }
        } else if ("data" in table) {
          // Fallback to JSON extraction
          const jsonField = sql`json_extract(data, '$.' || ${cond.field})`;
          switch (cond.operator) {
            case "$eq":
              conditions.push(sql`${jsonField} = ${value}`);
              break;
            case "$ne":
              conditions.push(sql`${jsonField} != ${value}`);
              break;
            case "$gt":
              conditions.push(sql`${jsonField} > ${value}`);
              break;
            case "$contains":
            case "$regex": // 🚀 ADDED: Map regex to LIKE for JSON fallback
              conditions.push(sql`${jsonField} LIKE ${"%" + value + "%"}`);
              break;
            case "$in":
              conditions.push(
                sql`${jsonField} IN (${sql.join(
                  value.map((v: any) => sql`${v}`),
                  sql`, `,
                )})`,
              );
              break;
          }
        }
      }
    }

    if (conditions.length === 0) return undefined;
    return group.operator === "$or" ? or(...conditions) : and(...conditions);
  }

  /**
   * Transaction wrapper for SQL adapters.
   */
  public abstract transaction<T>(
    fn: (transaction: any) => Promise<DatabaseResult<T>>,
    options?: {
      isolationLevel?: string;
    },
  ): Promise<DatabaseResult<T>>;

  /**
   * Standardized SQL error handler.
   */
  public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? JSON.stringify(error)
          : String(error);

    // 🛡️ SUPPRESSION: Ignore "no such table" errors for redirects/404_logs during warmup/cache warming.
    // These are expected if the plugin hasn't finished provisioning yet.
    const isNoSuchTable = message.includes("no such table");
    const isTransientCollection =
      message.includes("redirects") ||
      message.includes("404_logs") ||
      message.includes("bench_") ||
      message.includes("benchmark_");

    if (isNoSuchTable && isTransientCollection) {
      logger.debug(`[SQL Adapter] Expected transient error [${code}]: ${message}`);
    } else if (process.env.BENCHMARK_DEBUG === "true" || process.env.SVELTY_AUDIT_ACTIVE) {
      const detailedError =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...(error as any),
            }
          : error;
      logger.error(
        `[SQL Adapter] Error [${code}]:`,
        typeof detailedError === "object" ? JSON.stringify(detailedError, null, 2) : detailedError,
      );
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
   * 🚀 RAW ACCESS: Exposes the underlying client and execute method for specialized tasks.
   * This satisfies requirements for direct SQL execution in setup/migration scripts.
   */
  public abstract get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  };

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
    website_tokens: "websiteTokens",
    plugin_pagespeed_results: "pluginPagespeedResults",
    plugin_states: "pluginStates",
    plugin_migrations: "pluginMigrations",
    tenants: "tenants",
    "404_logs": "fourOhFourLogs",
    workflow_definitions: "workflowDefinitions",
    workflow_instances: "workflowInstances",
    redirects_mv: "redirectsMV",
  };
  protected getAliasedTable(collection: string, schema: any): Record<string, unknown> | null {
    // 🚀 Handle both flat and nested schema objects
    const schemaAny = (schema.schema || schema) as unknown as Record<
      string,
      Record<string, unknown>
    >;

    // Strip prefix to handle variations like 'collection_system_users'
    const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;

    if (schemaAny[collection]) return schemaAny[collection];
    if (schemaAny[cleanName]) return schemaAny[cleanName];

    const camelKey = this.snakeToCamel(cleanName);
    if (schemaAny[camelKey]) {
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
