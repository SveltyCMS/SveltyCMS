/**
 * @file src/databases/sqlite/base-sql-adapter.ts
 * @description
 * Unified base class for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * Provides shared logic for query mapping, dynamic table resolution, and error handling.
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
  type SQL,
  count as drizzleCount,
  getTableColumns,
  getTableName,
} from "drizzle-orm";
import { BaseAdapter } from "../core/base-adapter";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  EntityUpdate,
  FindOptions,
  ICrudAdapter,
  QueryFilter,
  DatabaseTransaction,
  CollectionModel,
} from "../db-interface";
import { generateUUID } from "@utils/native-utils";
import * as utils from "../core/relational-utils";
import { queryTranslator, type LogicalGroup, type QueryCondition } from "../core/query-ir";

import {
  type IAuthAdapter,
  type IContentAdapter,
  type IMediaAdapter,
  type ISystemAdapter,
  type IMonitoringAdapter,
  type IBatchAdapter,
  type ICollectionAdapter,
} from "../db-interface";

export abstract class BaseSqlAdapter extends BaseAdapter implements ICrudAdapter {
  // 🚀  CENTRALIZED TABLE ALIASES: Shared across all SQL adapters.
  public static readonly TABLE_ALIASES: Record<string, string> = {
    media: "mediaItems",
    MediaItem: "mediaItems",
    mediaItems: "mediaItems",
    media_items: "mediaItems",
    contentNodes: "contentNodes",
    content_nodes: "contentNodes",
    preferences: "systemPreferences",
    system_preferences: "systemPreferences",
    systemPreferences: "systemPreferences",
    tokens: "authTokens",
    auth_tokens: "authTokens",
    authTokens: "authTokens",
    sessions: "authSessions",
    auth_sessions: "authSessions",
    authSessions: "authSessions",
    users: "authUsers",
    auth_users: "authUsers",
    authUsers: "authUsers",
    system_users: "authUsers",
    content_drafts: "contentDrafts",
    contentDrafts: "contentDrafts",
    content_revisions: "contentRevisions",
    contentRevisions: "contentRevisions",
    redirects: "systemRedirects",
    system_redirects: "systemRedirects",
    systemRedirects: "systemRedirects",
    system_content_structure: "contentNodes",
    systemContentStructure: "contentNodes",
    roles: "roles",
    system_roles: "roles",
    audit_logs: "auditLogs",
    auditLogs: "auditLogs",
    system_audit_logs: "auditLogs",
    website_tokens: "websiteTokens",
    websiteTokens: "websiteTokens",
    plugin_pagespeed_results: "pluginPagespeedResults",
    pluginPagespeedResults: "pluginPagespeedResults",
    plugin_states: "pluginStates",
    pluginStates: "pluginStates",
    plugin_migrations: "pluginMigrations",
    pluginMigrations: "pluginMigrations",
    tenants: "tenants",
    system_tenants: "tenants",
    "404_logs": "fourOhFourLogs",
    fourOhFourLogs: "fourOhFourLogs",
    workflow_definitions: "workflowDefinitions",
    workflowDefinitions: "workflowDefinitions",
    workflow_instances: "workflowInstances",
    workflowInstances: "workflowInstances",
    redirects_mv: "systemRedirects",
    redirectsMV: "systemRedirects",
    svelty_jobs: "sveltyJobs",
    sveltyJobs: "sveltyJobs",
  };
  public abstract readonly type: string;
  protected abstract readonly schema: any;
  protected preparedStatements = new Map<string, any>();
  protected readonly MAX_PREPARED_STATEMENTS = 500;

  // 🚀 HARDENING: Separate Physical Table objects from High-Level Models
  protected tableRegistry = new Map<string, any>(); // Stores Drizzle table objects
  protected modelRegistry = new Map<string, any>(); // Stores CollectionModel wrappers
  public collectionRegistry = new Map<string, CollectionModel>();
  public dynamicTables = new Map<string, any>();

  /**
   * 🚀 AGNOSTIC CORE: Returns the CRUD interface (self).
   */
  public get crud(): ICrudAdapter {
    return this;
  }

  // --- Domain Namespace Holders (Lazy Loaded) ---
  protected _auth?: IAuthAdapter;
  protected _content?: IContentAdapter;
  protected _media?: IMediaAdapter;
  protected _system?: ISystemAdapter;
  protected _monitoring?: IMonitoringAdapter;
  protected _batch?: IBatchAdapter;
  protected _collection?: ICollectionAdapter;

  public abstract transaction<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: any,
  ): Promise<DatabaseResult<T>>;

  public abstract connect(
    connectionString: string | any,
    options?: any,
  ): Promise<DatabaseResult<void>>;

  public abstract disconnect(): Promise<DatabaseResult<void>>;

  public abstract isConnected(): boolean;

  // 🗂️ COLLECTION DOMAIN: Dynamic Schema and Model Management.
  public get collection(): ICollectionAdapter {
    if (!this._collection) {
      // @ts-ignore - Dynamic import for circular safety
      const { CollectionModule } = require("./collection-module");
      this._collection = new CollectionModule(this as any);
    }
    return this._collection!;
  }

  // 🛡️ AUTH DOMAIN: Unified Authentication Module.
  public get auth(): IAuthAdapter {
    if (!this._auth) {
      // @ts-ignore - Dynamic import for circular safety
      const { RelationalAuthModule } = require("./relational-auth");
      this._auth = new RelationalAuthModule(this, this.schema) as IAuthAdapter;
    }
    return this._auth!;
  }

  // 📦 CONTENT DOMAIN: Nodes, Drafts, and Revisions.
  public get content(): IContentAdapter {
    if (!this._content) {
      // @ts-ignore - Dynamic import for circular safety
      const { RelationalContentModule } = require("./relational-content");
      this._content = new RelationalContentModule(this as any, this.schema) as IContentAdapter;
    }
    return this._content!;
  }

  // 🖼️ MEDIA DOMAIN: Files and Folders.
  public get media(): IMediaAdapter {
    if (!this._media) {
      // @ts-ignore - Dynamic import for circular safety
      const { RelationalMediaModule } = require("./relational-media");
      this._media = new RelationalMediaModule(this as any, this.schema) as IMediaAdapter;
    }
    return this._media!;
  }

  // ⚙️ SYSTEM DOMAIN: Preferences, Tenants, Themes, and Jobs.
  public get system(): ISystemAdapter {
    if (!this._system) {
      // @ts-ignore - Dynamic import for circular safety
      const { RelationalSystemModule } = require("./relational-system");
      this._system = new RelationalSystemModule(this as any, this.schema) as ISystemAdapter;
    }
    return this._system!;
  }

  // ⚡ BATCH DOMAIN: High-Performance Bulk Operations.
  public get batch(): IBatchAdapter {
    if (!this._batch) {
      // @ts-ignore - Dynamic import for circular safety
      const { BatchModule } = require("./batch-module");
      this._batch = new BatchModule(this as any) as IBatchAdapter;
    }
    return this._batch!;
  }

  // 📊 MONITORING: Cache and Performance Metrics.
  public get monitoring(): IMonitoringAdapter {
    if (!this._monitoring) {
      this._monitoring = {
        cache: this.createCacheModule(),
        performance: this.createPerformanceModule(),
      };
    }
    return this._monitoring;
  }

  // 🛠️ UTILS: Standard utility methods.
  public get utils() {
    return utils;
  }

  protected createCacheModule() {
    // @ts-ignore - Dynamic import for circular safety
    const { CacheModule } = require("./cache-module");
    return new CacheModule(this as any);
  }

  protected createPerformanceModule() {
    // @ts-ignore - Dynamic import for circular safety
    const { PerformanceModule } = require("./performance-module");
    return new PerformanceModule(this as any);
  }

  protected static FIXED_COLUMNS = new Set([
    "_id",
    "id",
    "tenantId",
    "createdAt",
    "updatedAt",
    "isDeleted",
    "data",
    "position",
  ]);

  // 🚀 AGNOSTIC CORE: Resolves a collection name to a Drizzle table object.
  public getTable(collection: string): any {
    // 1. Check registry (Physical tables only)
    const cached = this.tableRegistry.get(collection);
    if (cached) return cached;

    // 2. Try Aliased Table (Core/System) - DO THIS BEFORE PREFIXING
    const aliased = this.getAliasedTable(collection);
    if (aliased) {
      this.tableRegistry.set(collection, aliased);
      return aliased;
    }

    // 3. Fallback: Create dynamic definition
    const lowerColl = collection.toLowerCase();
    const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
    let tableName = collection;

    // 🚀 DEFENSIVE: Ensure system tables are NEVER prefixed
    const isSystem =
      BaseSqlAdapter.TABLE_ALIASES[collection] !== undefined ||
      BaseSqlAdapter.TABLE_ALIASES[cleanName] !== undefined ||
      lowerColl.startsWith("system_") ||
      lowerColl.startsWith("auth_") ||
      lowerColl.startsWith("audit") ||
      lowerColl.startsWith("plugin") ||
      lowerColl.startsWith("redirects") ||
      lowerColl.startsWith("content") ||
      lowerColl.startsWith("history") ||
      lowerColl.startsWith("404") ||
      lowerColl === "users" ||
      lowerColl === "sessions" ||
      lowerColl === "tokens" ||
      lowerColl === "roles";

    if (!isSystem) {
      tableName = `collection_${collection}`;
    } else {
      // Normalize dynamic system table names to snake_case for migrations
      if (collection === "auditLogs") tableName = "audit_logs";
      else if (collection === "pluginMigrations") tableName = "plugin_migrations";
      else if (collection === "pluginStates") tableName = "plugin_states";
      else if (collection === "mediaItems") tableName = "media_items";
      else if (collection === "contentNodes") tableName = "content_nodes";
      else if (collection === "systemRedirects" || collection === "redirectsMV")
        tableName = "system_redirects";
    }

    const dynamicTable = this.createDynamicTableDefinition(tableName);
    this.tableRegistry.set(collection, dynamicTable);
    return dynamicTable;
  }

  public abstract getClient(): any;

  public async provision(): Promise<void> {
    // Standard SQL adapters usually use migrations, but we provide an empty
    // hook for specialized provisioning if needed.
  }

  public abstract get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  };

  protected abstract getAliasedTable(collection: string): any;
  protected abstract createDynamicTableDefinition(tableName: string): any;
  protected abstract getDrizzleInstance(options?: BaseQueryOptions): any;
  public abstract getJsonField(field: string): SQL;

  protected getColumn(table: any, name: string): Column | undefined {
    if (!table) return undefined;
    try {
      const cols = getTableColumns(table);
      return cols[name];
    } catch {
      return table[name];
    }
  }

  protected prepareValues(
    table: any,
    data: any,
    id: DatabaseId | undefined,
    now: Date,
    options: any,
  ) {
    const values: any = {};
    let schemaCols: Record<string, Column> = {};
    try {
      schemaCols = getTableColumns(table);
    } catch {}

    const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
    if (id && idCol) values[idCol.name] = id.toString();

    if (schemaCols?.["tenantId"] || table["tenantId"]) {
      values.tenantId = options.tenantId || (data as any).tenantId || null;
    }

    if (id && (schemaCols?.["createdAt"] || table["createdAt"])) values.createdAt = now;
    if (schemaCols?.["updatedAt"] || table["updatedAt"]) values.updatedAt = now;

    if (this.getColumn(table, "data")) {
      const dynamicData: any = {};
      for (const k in data) {
        if (!Object.hasOwn(data, k)) continue;
        if (BaseSqlAdapter.FIXED_COLUMNS.has(k) && (schemaCols?.[k] || table[k])) {
          values[k] = data[k];
        } else {
          dynamicData[k] = data[k];
        }
      }
      values.data = JSON.stringify(dynamicData);
    } else {
      for (const k in data) {
        if (Object.hasOwn(data, k) && (schemaCols?.[k] || table[k])) {
          values[k] = data[k];
        }
      }
    }
    return utils.convertISOToDates(values);
  }

  // --- CRUD IMPLEMENTATION ---

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    return this.wrap(async () => {
      const q = await this.runHooks("before", "find", collection, query, options);
      const table = this.getTable(collection);
      const where = this.mapQuery(table, q as any, options);

      const results = await this.getDrizzleInstance(options)
        .select()
        .from(table)
        .where(where)
        .limit(1);

      const data = results.length ? (utils.convertDatesToISO(results[0]) as T) : null;
      return await this.runHooks("after", "find", collection, data, options);
    }, "FIND_ONE_FAILED");
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.wrap(async () => {
      const q = await this.runHooks("before", "find", collection, query, options);
      const table = this.getTable(collection);
      const where = this.mapQuery(table, q as any, options);
      let builder = this.getDrizzleInstance(options).select().from(table).where(where);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.offset) builder = builder.offset(options.offset);

      const results = await builder;
      const data = utils.convertDatesToISO(results) as T[];
      return await this.runHooks("after", "find", collection, data, options);
    }, "FIND_MANY_FAILED");
  }

  async streamMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<AsyncIterable<T>>> {
    return this.wrap(async () => {
      const q = await this.runHooks("before", "find", collection, query, options);
      const table = this.getTable(collection);
      const where = this.mapQuery(table, q as any, options);
      let builder = this.getDrizzleInstance(options).select().from(table).where(where);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.offset) builder = builder.offset(options.offset);

      // Default: Simulated streaming via generator
      const results = await builder;
      const data = utils.convertDatesToISO(results) as T[];

      const generator = async function* () {
        for (const item of data) {
          yield item;
        }
      };

      return generator() as AsyncIterable<T>;
    }, "STREAM_MANY_FAILED");
  }

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> & { rawSql?: boolean; sql?: string; params?: Record<string, any> } = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, query, options);
  }

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, { _id: { $in: ids } } as any, options);
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<boolean>> {
    const res = await this.findOne(collection, query, options);
    return { success: true, data: !!(res.success && res.data) };
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<number>> {
    return this.wrap(async () => {
      const table = this.getTable(collection);
      const where = this.mapQuery(table, query || {}, options);

      const result = await this.getDrizzleInstance(options)
        .select({ count: drizzleCount() })
        .from(table)
        .where(where);
      return result[0].count;
    }, "COUNT_FAILED");
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    return this.wrap(async () => {
      const d = await this.runHooks("before", "insert", collection, data, options);
      const table = this.getTable(collection);
      const id = (d as any)._id || generateUUID();
      const now = new Date();
      const values = this.prepareValues(table, d, id, now, options);

      const result = await this.getDrizzleInstance(options)
        .insert(table)
        .values(values)
        .returning();
      const finalData = utils.convertDatesToISO(result[0]) as T;
      return await this.runHooks("after", "insert", collection, finalData, options);
    }, "INSERT_FAILED");
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    if (!data || data.length === 0) return { success: true, data: [] };

    return this.wrap(async () => {
      const table = this.getTable(collection);
      const now = new Date();

      // 🚀 Batch processing
      const batchValues = data.map((item) => {
        const id = (item as any)._id || generateUUID();
        return this.prepareValues(table, item, id, now, options);
      });

      const results = await this.getDrizzleInstance(options)
        .insert(table)
        .values(batchValues)
        .returning();

      return utils.convertDatesToISO(results) as T[];
    }, "INSERT_MANY_FAILED");
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    return this.wrap(async () => {
      const d = await this.runHooks("before", "update", collection, data, options);
      const table = this.getTable(collection);
      const now = new Date();
      const values = this.prepareValues(table, d, id, now, options);

      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      await this.getDrizzleInstance(options)
        .update(table)
        .set(values)
        .where(eq(idCol, id as any));

      const updated = await this.findOne<T>(collection, { _id: id } as any, options);
      if (!updated.success) throw new Error(updated.message);
      if (!updated.data) throw new Error("Record not found after update");

      return await this.runHooks("after", "update", collection, updated.data, options);
    }, "UPDATE_FAILED");
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.wrap(async () => {
      const items = await this.findMany(collection, query, options);
      if (!items.success) throw new Error(items.message);

      let modifiedCount = 0;
      for (const item of items.data || []) {
        const res = await this.update(collection, (item as any)._id, data, options);
        if (res.success) modifiedCount++;
      }
      return { modifiedCount };
    }, "UPDATE_MANY_FAILED");
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      await this.runHooks("before", "delete", collection, { _id: id }, options);
      const table = this.getTable(collection);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      if (options.permanent) {
        await this.getDrizzleInstance(options)
          .delete(table)
          .where(eq(idCol, id as any));
      } else {
        await this.getDrizzleInstance(options)
          .update(table)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(idCol, id as any));
      }
      await this.runHooks("after", "delete", collection, { _id: id }, options);
    }, "DELETE_FAILED");
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.wrap(async () => {
      const items = await this.findMany(collection, query, options);
      if (!items.success) throw new Error(items.message);

      let deletedCount = 0;
      for (const item of items.data || []) {
        const res = await this.delete(collection, (item as any)._id, options);
        if (res.success) deletedCount++;
      }
      return { deletedCount };
    }, "DELETE_MANY_FAILED");
  }

  async restore(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      const table = this.getTable(collection);
      const idCol = this.getColumn(table, "_id") || this.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      await this.getDrizzleInstance(options)
        .update(table)
        .set({ isDeleted: false, updatedAt: new Date() })
        .where(eq(idCol, id as any));
    }, "RESTORE_FAILED");
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const existing = await this.findOne(collection, query, options);
    if (existing.success && existing.data) {
      return this.update(collection, (existing.data as any)._id, data as any, options);
    }
    return this.insert(collection, data, options);
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    const results: T[] = [];
    for (const item of items) {
      const res = await this.upsert(collection, item.query, item.data, options);
      if (res.success && res.data) results.push(res.data as T);
    }
    return { success: true, data: results };
  }

  async aggregate<R>(
    _collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.notImplemented("aggregate");
  }

  /**
   * 🚀 AGNOSTIC CORE: High-level table provisioning.
   */
  public async createModel(schemaData: any): Promise<void> {
    const tableName = schemaData._id || schemaData.id;
    if (!tableName) throw new Error("Schema must have an _id");

    const table = this.getTable(tableName);
    const physicalName = getTableName(table as any);

    // Execute physical table creation
    await this.wrap(async () => {
      let ddl = "";
      if (this.type === "sqlite") {
        ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" TEXT PRIMARY KEY, "tenantId" TEXT, "createdAt" INTEGER, "updatedAt" INTEGER, "data" TEXT);`;
      } else if (this.type === "postgresql") {
        ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" TEXT PRIMARY KEY, "tenantId" TEXT, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP, "data" JSONB);`;
      } else if (this.type === "mariadb") {
        ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`createdAt\` DATETIME, \`updatedAt\` DATETIME, \`data\` LONGTEXT);`;
      }

      if (ddl) await this.raw.execute(ddl);
      logger.info(`[${this.type.toUpperCase()} Adapter] Provisioned table: ${physicalName}`);
    }, "CREATE_MODEL_FAILED");
  }

  public mapQuery(
    table: any,
    query: Record<string, any>,
    options: BaseQueryOptions = {},
  ): SQL | undefined {
    const ir = queryTranslator.translate("dummy", query || {});
    const conditions: SQL[] = [];

    const filterSql = this.mapIRToSQL(table, ir.filter);
    if (filterSql) conditions.push(filterSql);

    // 🚀 HARDENING: Inject Tenant ID if provided and not bypassed
    if (!options.bypassTenantCheck) {
      const tenantId = options.tenantId;
      const tenantCol = this.getColumn(table, "tenantId");
      if (tenantId !== undefined && tenantCol) {
        conditions.push(tenantId === null ? isNull(tenantCol) : eq(tenantCol, tenantId as string));
      }
    }

    if (!conditions.length) return undefined;
    return and(...conditions);
  }

  protected mapIRToSQL(table: any, group: LogicalGroup): SQL | undefined {
    const conditions: SQL[] = [];
    if (!group || !group.conditions) return undefined;

    for (const cond of group.conditions) {
      if ("conditions" in cond) {
        const sub = this.mapIRToSQL(table, cond as LogicalGroup);
        if (sub) conditions.push(sub);
      } else {
        const column = this.getColumn(table, cond.field);
        if (column) {
          conditions.push(this.translateCondition(column, cond as QueryCondition));
        } else {
          const dataCol = this.getColumn(table, "data");
          if (dataCol) {
            const jsonField = this.getJsonField(cond.field);
            conditions.push(this.translateCondition(jsonField as any, cond as QueryCondition));
          }
        }
      }
    }
    if (!conditions.length) return undefined;
    return group.operator === "$or" ? or(...conditions) : and(...conditions);
  }

  protected translateCondition(col: Column, cond: QueryCondition): SQL {
    const val = cond.value;
    switch (cond.operator) {
      case "$eq":
        return val === null ? isNull(col) : eq(col, val);
      case "$ne":
        return ne(col, val);
      case "$gt":
        return gt(col, val);
      case "$gte":
        return gte(col, val);
      case "$lt":
        return lt(col, val);
      case "$lte":
        return lte(col, val);
      case "$in":
        return inArray(col, Array.isArray(val) ? val : [val]);
      default:
        return eq(col, val);
    }
  }
}
