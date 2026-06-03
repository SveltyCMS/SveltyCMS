/**
 * @file src/databases/core/drizzle-sql-helpers.ts
 * @description Pure functions and constants for Drizzle SQL database adapters, avoiding class-level dialect checks.
 *
 * Responsibilities:
 * - Define shared table aliases and system collections.
 * - Translate Query IR (Intermediate Representation) into Drizzle SQL conditions.
 * - Map query filters to SQL where clauses without dialect branching.
 *
 * Features:
 * - stateless table/column mappings
 * - query translation engine wrapper
 * - physical select projectors
 */

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
  getTableColumns,
  getTableName,
  sql,
  asc,
  desc,
} from "drizzle-orm";
import { queryTranslator, type LogicalGroup, type QueryCondition } from "../core/query-ir";
import type { FindOptions } from "../db-interface";

// 🚀 CENTRALIZED TABLE ALIASES: Shared across all SQL adapters.
export const SQL_TABLE_ALIASES: Record<string, string> = {
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
  redirects_mv: "redirectsMV",
  redirectsMV: "redirectsMV",
  svelty_jobs: "sveltyJobs",
  sveltyJobs: "sveltyJobs",
  system_virtual_folders: "systemVirtualFolders",
  systemVirtualFolders: "systemVirtualFolders",
};

export const SYSTEM_COLLECTIONS = new Set([
  ...Object.keys(SQL_TABLE_ALIASES),
  "audit_logs",
  "auditLogs",
  "plugin_migrations",
  "pluginMigrations",
  "plugin_states",
  "pluginStates",
  "media_items",
  "mediaItems",
  "content_nodes",
  "contentNodes",
  "system_preferences",
  "systemPreferences",
  "system_virtual_folders",
  "systemVirtualFolders",
  "workflow_definitions",
  "workflowDefinitions",
  "workflow_instances",
  "workflowInstances",
]);

export const SYSTEM_NAME_MAP = new Map<string, string>();
for (const [key, val] of Object.entries(SQL_TABLE_ALIASES)) {
  SYSTEM_NAME_MAP.set(key, val);
  SYSTEM_NAME_MAP.set(val, val);
}

// 🚀 PERFECT STORM: Comprehensive Physical Selection Map
export const SYSTEM_LITERAL_COLUMNS: Record<string, string[]> = {
  contentNodes: [
    "_id",
    "path",
    "nodeType",
    "status",
    "parentId",
    "tenantId",
    "createdAt",
    "updatedAt",
    "isDeleted",
    "data",
    "position",
    "source",
    "isPublished",
    "publishedAt",
    "name",
    "slug",
    "icon",
    "description",
    "collectionDef",
    "translations",
  ],
  authUsers: [
    "_id",
    "email",
    "username",
    "password",
    "emailVerified",
    "blocked",
    "firstName",
    "lastName",
    "avatar",
    "roleIds",
    "role",
    "isAdmin",
    "isRegistered",
    "is2FAEnabled",
    "totpSecret",
    "backupCodes",
    "last2FAVerification",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  authSessions: ["_id", "user_id", "expires", "tenantId", "createdAt", "updatedAt"],
  authTokens: [
    "_id",
    "user_id",
    "email",
    "token",
    "type",
    "expires",
    "consumed",
    "blocked",
    "role",
    "username",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  roles: [
    "_id",
    "name",
    "description",
    "permissions",
    "isAdmin",
    "icon",
    "color",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  contentDrafts: [
    "_id",
    "contentId",
    "data",
    "version",
    "status",
    "authorId",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  contentRevisions: [
    "_id",
    "contentId",
    "data",
    "version",
    "commitMessage",
    "authorId",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  themes: [
    "_id",
    "name",
    "path",
    "isActive",
    "isDefault",
    "config",
    "previewImage",
    "customCss",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  widgets: [
    "_id",
    "name",
    "isActive",
    "instances",
    "dependencies",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  mediaItems: [
    "_id",
    "filename",
    "originalFilename",
    "hash",
    "path",
    "size",
    "mimeType",
    "folderId",
    "originalId",
    "thumbnails",
    "metadata",
    "access",
    "createdBy",
    "updatedBy",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  systemVirtualFolders: [
    "_id",
    "name",
    "path",
    "parentId",
    "icon",
    "position",
    "type",
    "metadata",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  systemPreferences: [
    "_id",
    "key",
    "value",
    "scope",
    "userId",
    "visibility",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  sveltyJobs: [
    "_id",
    "taskType",
    "payload",
    "status",
    "attempts",
    "maxAttempts",
    "nextRunAt",
    "lastError",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  websiteTokens: [
    "_id",
    "name",
    "token",
    "permissions",
    "expiresAt",
    "createdBy",
    "type",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  pluginPagespeedResults: [
    "_id",
    "entryId",
    "collectionId",
    "tenantId",
    "language",
    "device",
    "url",
    "performanceScore",
    "fetchedAt",
    "createdAt",
    "updatedAt",
  ],
  pluginStates: [
    "_id",
    "pluginId",
    "tenantId",
    "enabled",
    "settings",
    "updatedBy",
    "createdAt",
    "updatedAt",
  ],
  pluginMigrations: [
    "_id",
    "pluginId",
    "migrationId",
    "version",
    "tenantId",
    "appliedAt",
    "createdAt",
    "updatedAt",
  ],
  tenants: [
    "_id",
    "name",
    "ownerId",
    "status",
    "plan",
    "quota",
    "usage",
    "settings",
    "createdAt",
    "updatedAt",
  ],
  auditLogs: [
    "_id",
    "action",
    "actorEmail",
    "actorId",
    "actorRole",
    "correlationId",
    "details",
    "errorDetails",
    "eventType",
    "ipAddress",
    "result",
    "sessionId",
    "severity",
    "targetId",
    "targetType",
    "timestamp",
    "userAgent",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  fourOhFourLogs: [
    "_id",
    "path",
    "tenantId",
    "hits",
    "lastHit",
    "metadata",
    "createdAt",
    "updatedAt",
  ],
  workflowDefinitions: [
    "_id",
    "tenantId",
    "collectionId",
    "name",
    "description",
    "states",
    "transitions",
    "createdAt",
    "updatedAt",
  ],
  workflowInstances: [
    "_id",
    "tenantId",
    "entryId",
    "collectionId",
    "currentState",
    "history",
    "createdAt",
    "updatedAt",
  ],
  redirectsMV: [
    "_id",
    "tenantId",
    "source",
    "target",
    "type",
    "isRegex",
    "active",
    "metadata",
    "createdAt",
    "updatedAt",
  ],
};

export const FIXED_COLUMNS = new Set([
  "_id",
  "id",
  "path",
  "nodeType",
  "status",
  "parentId",
  "tenantId",
  "createdAt",
  "updatedAt",
  "publishDate",
  "isDeleted",
  "data",
  "position",
  "source",
  "isPublished",
  "publishedAt",
  "name",
  "slug",
  "icon",
  "description",
  "collectionDef",
]);

export function isSystemTable(collection: string): boolean {
  if (typeof collection !== "string") return false;
  const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
  return SYSTEM_COLLECTIONS.has(cleanName) || SYSTEM_COLLECTIONS.has(collection);
}

export function resolveSystemTableName(collection: string): string {
  if (typeof collection !== "string") return "";
  const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
  return SYSTEM_NAME_MAP.get(cleanName) || SYSTEM_NAME_MAP.get(collection) || collection;
}

export function getColumnHelper(
  table: any,
  name: string,
  tableColumnsCache: Map<any, Record<string, Column>>,
  lastRef: { table: any; cols: Record<string, Column> | null },
  forcePhysical = false,
): Column | undefined {
  if (!table) return undefined;

  let cols = table === lastRef.table ? lastRef.cols : tableColumnsCache.get(table);

  if (!cols) {
    try {
      const resolvedCols = getTableColumns(table);
      if (resolvedCols && Object.keys(resolvedCols).length > 0) {
        cols = resolvedCols as any;
        tableColumnsCache.set(table, cols!);
      }
    } catch {}
  }

  if (cols && cols[name]) {
    lastRef.table = table;
    lastRef.cols = cols;
    return cols[name];
  }

  if (table[name]) return table[name];

  if (forcePhysical && FIXED_COLUMNS.has(name)) {
    return sql.raw(`"${name}"`) as any;
  }

  return undefined;
}

export function translateCondition(col: Column, cond: QueryCondition): SQL {
  let val = cond.value;

  if (val !== null && typeof val === "object" && typeof (val as any).getTime === "function") {
    if (!(val instanceof Date)) {
      val = new Date((val as any).getTime());
    }
  } else if (Array.isArray(val)) {
    val = val.map((v) =>
      v !== null &&
      typeof v === "object" &&
      typeof (v as any).getTime === "function" &&
      !(v instanceof Date)
        ? new Date((v as any).getTime())
        : v,
    );
  }

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

export function mapIRToSQL(
  table: any,
  group: LogicalGroup,
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
): SQL | undefined {
  const conditions: SQL[] = [];
  if (!group || !group.conditions) return undefined;

  for (const cond of group.conditions) {
    if ("conditions" in cond) {
      const sub = mapIRToSQL(table, cond as LogicalGroup, getColumn, getJsonField);
      if (sub) conditions.push(sub);
    } else {
      const column = getColumn(table, cond.field);
      if (column) {
        conditions.push(translateCondition(column, cond as QueryCondition));
      } else {
        const dataCol = getColumn(table, "data");
        if (dataCol) {
          const jsonField = getJsonField(cond.field);
          conditions.push(translateCondition(jsonField as any, cond as QueryCondition));
        }
      }
    }
  }
  if (!conditions.length) return undefined;
  return group.operator === "$or" ? or(...conditions) : and(...conditions);
}

export function mapQuery(
  table: any,
  query: any,
  options: any = {},
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
): SQL | undefined {
  if (
    query &&
    query._id &&
    (typeof query._id === "string" || typeof query._id === "number") &&
    Object.keys(query).length === 1 &&
    !options.bypassTenantCheck
  ) {
    const idCol = getColumn(table, "_id") || getColumn(table, "id");
    if (idCol) {
      const conditions = [eq(idCol, query._id as any)];
      const tenantCol = getColumn(table, "tenantId");
      if (options.tenantId !== undefined && options.tenantId !== "global" && tenantCol) {
        conditions.push(
          options.tenantId === null ? isNull(tenantCol) : eq(tenantCol, options.tenantId as string),
        );
      }
      return and(...conditions);
    }
  }

  const ir = queryTranslator.translate("dummy", query || {});
  const conditions: SQL[] = [];

  const filterSql = mapIRToSQL(table, ir.filter, getColumn, getJsonField);
  if (filterSql) conditions.push(filterSql);

  if (!options.bypassTenantCheck) {
    const tenantId = options.tenantId;
    const tenantCol = getColumn(table, "tenantId");
    if (tenantId !== undefined && tenantId !== "global" && tenantCol) {
      conditions.push(tenantId === null ? isNull(tenantCol) : eq(tenantCol, tenantId as string));
    }
  }

  if (!conditions.length) return undefined;
  return and(...conditions);
}

export function applyOrderBy(
  builder: any,
  table: any,
  options: FindOptions<any>,
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
): any {
  if (options.sort) {
    const sortConditions: any[] = [];
    const normalizedSorts: { field: string; direction: "asc" | "desc" }[] = [];
    if (Array.isArray(options.sort)) {
      for (const item of options.sort) {
        if (Array.isArray(item) && item.length >= 2) {
          normalizedSorts.push({
            field: item[0],
            direction: item[1] as "asc" | "desc",
          });
        } else if (typeof item === "object" && item !== null) {
          const keys = Object.keys(item);
          if (keys.length > 0) {
            const field = keys[0];
            const direction = (item as any)[field];
            normalizedSorts.push({ field, direction });
          }
        }
      }
    } else if (typeof options.sort === "object") {
      for (const field of Object.keys(options.sort)) {
        const direction = (options.sort as any)[field];
        normalizedSorts.push({ field, direction });
      }
    }

    for (const s of normalizedSorts) {
      let sortCol: any;
      const column = getColumn(table, s.field);
      if (column) {
        sortCol = column;
      } else {
        const dataCol = getColumn(table, "data");
        if (dataCol) {
          sortCol = getJsonField(s.field);
        }
      }

      if (sortCol) {
        if (s.direction === "asc") {
          sortConditions.push(asc(sortCol));
        } else {
          sortConditions.push(desc(sortCol));
        }
      }
    }

    if (sortConditions.length > 0) {
      return builder.orderBy(...sortConditions);
    }
  }
  return builder;
}

export function getPhysicalSelection(
  table: any,
  selectionCache: Map<string, any>,
  getColumn: (table: any, name: string, forcePhysical?: boolean) => Column | undefined,
): any {
  const tableName = getTableName(table);
  const lowerName = tableName.toLowerCase();
  const isDynamic =
    lowerName.includes("benchmark") ||
    lowerName.startsWith("collection_") ||
    lowerName.startsWith("bench_");

  const systemName = resolveSystemTableName(tableName);
  const isSystem = isSystemTable(tableName);

  if (!isDynamic && !isSystem) {
    try {
      const columns = getTableColumns(table);
      if (columns && Object.keys(columns).length > 0) return columns;
    } catch {}
  }

  if (isSystem) {
    const cached = selectionCache.get(systemName);
    if (cached) return cached;
  }

  const selection: any = {};
  let columnNames: readonly string[];

  if (isSystem && SYSTEM_LITERAL_COLUMNS[systemName]) {
    columnNames = SYSTEM_LITERAL_COLUMNS[systemName];
  } else if (systemName === "contentNodes" || lowerName.includes("content_nodes")) {
    columnNames = SYSTEM_LITERAL_COLUMNS.contentNodes;
  } else {
    columnNames = ["_id", "data", "status", "tenantId", "createdAt", "updatedAt", "isDeleted"];
  }

  for (let i = 0; i < columnNames.length; i++) {
    const k = columnNames[i];
    const col = getColumn(table, k, true);
    if (col) {
      selection[k] = col;
    } else {
      selection[k] = sql.raw(`"${k}"`);
    }
  }

  if (isSystem) {
    selectionCache.set(systemName, selection);
  }

  return selection;
}
