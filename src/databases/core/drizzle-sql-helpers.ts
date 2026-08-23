/**
 * @file src/databases/core/drizzle-sql-helpers.ts
 * @description Pure functions and constants for Drizzle SQL database adapters, avoiding class-level dialect checks.
 *
 * Responsibilities:
 * - Define shared table aliases and system collections.
 * - Fused query parsing + SQL condition building (no intermediate IR objects for hot paths).
 * - Map query filters to SQL where clauses without dialect branching (for..in, direct translate).
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
import type { FindOptions, QueryCondition } from "../db-interface";
import { acquireConditionsArray, applyTenantFilter, safeDate } from "./relational-utils";

/**
 * Universal Drizzle write executor across SQLite (.run()), LibSQL (.run()), and PostgreSQL/MariaDB (thenable).
 */
export async function executeWrite<T extends { run?: () => Promise<unknown> }>(
  builder: T,
): Promise<{ changes?: number; rowsAffected?: number; count?: number }> {
  return (typeof builder.run === "function" ? await builder.run() : await (builder as any)) as any;
}

/**
 * Widgets whose data shape is a flat scalar
 * (string/number/boolean) are safe to store as physical columns instead of the
 * JSON `data` blob. Object/array-shaped widgets (group, repeater, seo, tags,
 * media-upload, price, date-range, …) stay in the blob. The field `type` must
 * also be scalar — a string-typed field with an unknown widget stays in the
 * blob (conservative: unknown shapes must not become columns).
 */
const MATERIALIZABLE_WIDGETS = new Set([
  "Input",
  "Textarea",
  "Email",
  "Slug",
  "Number",
  "Select",
  "Radio",
  "Checkbox",
  "Switch",
  "Boolean",
  "DateTime",
  "Date",
  "ColorPicker",
  "PhoneNumber",
  "Rating",
  "RichText",
  "Markdown",
  "URL",
  "Link",
  "Code",
  "Password",
]);

/**
 * Known object/array-shaped widgets — NEVER materialized, even when indexed
 * or unique (a media-upload/group/repeater field must not become a scalar SQL
 * column; that would break its object/array semantics on reads).
 */
const NON_SCALAR_WIDGETS = new Set([
  "MediaUpload",
  "Group",
  "Repeater",
  "Tags",
  "SEO",
  "JsonEditor",
  "Price",
  "Currency",
  "DateRange",
  "Geolocation",
  "Address",
  "RemoteVideo",
  "MegaMenu",
  "Relation",
  "AIEnrichment",
]);

const _widgetNameCache = new Map<string, string>();

function widgetNameOf(field: any): string {
  const raw =
    field?.widget?.Name ??
    field?.widget?.name ??
    (typeof field.widget === "string" ? field.widget : "");
  if (!raw) return "";

  const cached = _widgetNameCache.get(raw);
  if (cached !== undefined) return cached;

  // The GUI builder stores the palette key (kebab-case: "media-upload") in
  // widget.Name on some paths; canonical code schemas use the PascalCase name
  // ("MediaUpload"). Normalize to PascalCase so the allowlists match both.
  const normalized = raw
    .replace(/[-_\s]+/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .replace(/\s+/g, "");

  _widgetNameCache.set(raw, normalized);
  return normalized;
}

/**
 * True when a schema field is a flat scalar that CAN be materialized as a
 * physical column (capability check — see `shouldMaterializeField` for the
 * policy that decides when columns are actually created).
 */
export function isScalarMaterializableField(field: any): boolean {
  if (!field || typeof field !== "object") return false;
  const type = field.type;
  if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean") {
    return false;
  }
  const widget = widgetNameOf(field);
  if (widget) {
    if (NON_SCALAR_WIDGETS.has(widget)) return false;
    if (!MATERIALIZABLE_WIDGETS.has(widget)) return false;
  }
  return true;
}

/**
 * Whether a field becomes a physical column (row-store hybrid). Columns are
 * ONLY created when there is a query benefit: indexed/unique fields (real
 * constraints + indexed filters/sorts) or an explicit `materialize: true`
 * opt-in — plus a scalar shape. Plain scalar fields stay in the `data` blob:
 * on network adapters every extra column costs a bind on writes and a decode
 * on reads (measured regression when ALL scalars were materialized: PG INSERT
 * +51%, PG FIND MANY +99%, Maria INSERT +109%, FIND MANY +86%), while the
 * blob keeps rows narrow. SQLite pays less per column (in-process), but the
 * policy stays adapter-agnostic and predictable.
 */
export function shouldMaterializeField(field: any): boolean {
  if (!field || typeof field !== "object") return false;
  const needsColumn = field.indexed || field.unique || field.materialize === true;
  if (!needsColumn) return false;
  // Explicit opt-in still requires a scalar shape — an object/array widget
  // must never become a scalar SQL column (breaks its shape on reads).
  if (field.materialize === true) return isScalarMaterializableField(field);
  const type = field.type;
  if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean") {
    return false;
  }
  const widget = widgetNameOf(field);
  if (widget && NON_SCALAR_WIDGETS.has(widget)) return false;
  return true;
}

/**
 * Escape LIKE wildcards in user input so `%`, `_` and `\` are matched
 * literally. Callers MUST pair the result with `ESCAPE '\'` (bound as a
 * parameter — never inlined, see `$regex` below) on every LIKE expression.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

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
  system_settings: "systemPreferences",
  systemPreferences: "systemPreferences",
  tokens: "authTokens",
  auth_tokens: "authTokens",
  authTokens: "authTokens",
  api_keys: "authApiKeys",
  auth_api_keys: "authApiKeys",
  authApiKeys: "authApiKeys",
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
  plugin_storage: "pluginStorage",
  pluginStorage: "pluginStorage",
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
  svelty_outbox: "sveltyOutbox",
  sveltyOutbox: "sveltyOutbox",
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
  "svelty_outbox",
  "sveltyOutbox",
  "plugin_storage",
  "pluginStorage",
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
    "authenticators",
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
  sveltyOutbox: [
    "_id",
    "tenantId",
    "eventType",
    "aggregateType",
    "aggregateId",
    "payload",
    "status",
    "createdAt",
    "deliveredAt",
    "attempts",
    "lastError",
    "updatedAt",
  ],
  websiteTokens: [
    "_id",
    "name",
    "token",
    "permissions",
    "expiresAt",
    "createdBy",
    "tenantId",
    "createdAt",
    "updatedAt",
  ],
  authApiKeys: [
    "_id",
    "name",
    "hash",
    "prefix",
    "userId",
    "scopes",
    "permissions",
    "revoked",
    "usageCount",
    "lastUsedAt",
    "lastUsedIp",
    "expiresAt",
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
  pluginStorage: ["_id", "plugin", "collectionName", "tenantId", "data", "createdAt", "updatedAt"],
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
  workflow_definitions: [
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
  workflow_instances: [
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

const _isSysCache = new Map<string, boolean>();
const _resolveSysNameCache = new Map<string, string>();

export function isSystemTable(collection: string): boolean {
  if (typeof collection !== "string") return false;
  const cached = _isSysCache.get(collection);
  if (cached !== undefined) return cached;
  const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
  const res = SYSTEM_COLLECTIONS.has(cleanName) || SYSTEM_COLLECTIONS.has(collection);
  if (_isSysCache.size < 512) _isSysCache.set(collection, res);
  return res;
}

export function resolveSystemTableName(collection: string): string {
  if (typeof collection !== "string") return "";
  const cached = _resolveSysNameCache.get(collection);
  if (cached !== undefined) return cached;
  const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;
  const res = SYSTEM_NAME_MAP.get(cleanName) || SYSTEM_NAME_MAP.get(collection) || collection;
  if (_resolveSysNameCache.size < 512) _resolveSysNameCache.set(collection, res);
  return res;
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
    // Guard: only allow safe identifiers in raw SQL (defense-in-depth beyond FIXED_COLUMNS)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return undefined;
    }
    return sql.raw(`"${name}"`) as any;
  }

  return undefined;
}

/**
 * Coerce filter values for date/timestamp columns to real Date objects.
 * Drizzle's timestamp column modes call `value.getTime()` / `value.toISOString()`
 * in their driver mapping with no type guard, so ISO strings (keyset cursors)
 * and epoch numbers (API filters) would throw. Only applies to real
 * date/timestamp columns — JSON-field comparisons keep dialect-text semantics.
 *
 * Detection reads BOTH the public getters (sqlite-core) and `column.config`
 * (mysql-core hides dataType/columnType from the public surface) and accepts
 * both ISO-8601 and MariaDB space-separated datetime strings.
 */
function coerceDateColumnValue(col: any, val: unknown): unknown {
  if (!col) return val;
  const cfg = col?.config ?? {};
  const isDateCol =
    col?.dataType === "date" ||
    (typeof col?.columnType === "string" && /(Timestamp|DateTime|Date)$/.test(col.columnType)) ||
    cfg?.dataType === "date" ||
    (typeof cfg?.columnType === "string" && /(Timestamp|DateTime|Date)$/.test(cfg.columnType));
  if (!isDateCol) return val;
  if (Array.isArray(val)) {
    return val.map((v) => coerceDateColumnValue(col, v));
  }
  if (typeof val === "string" && val.length > 5) {
    // ISO-8601 ("…T…Z") and MariaDB datetime ("YYYY-MM-DD HH:mm:ss") shapes
    const normalized = val.includes("T") ? val : val.replace(" ", "T");
    const ts = Date.parse(normalized);
    if (!Number.isNaN(ts)) return new Date(ts);
  } else if (typeof val === "number" && val > 0) {
    return new Date(val);
  }
  return val;
}

export function translateCondition(col: Column, cond: QueryCondition): SQL {
  let val = cond.value;

  if (val !== null && typeof val === "object" && typeof (val as any).getTime === "function") {
    val = safeDate(val);
  } else if (Array.isArray(val)) {
    val = val.map((v) =>
      v !== null && typeof v === "object" && typeof (v as any).getTime === "function"
        ? safeDate(v)
        : v,
    );
  }
  // Date/timestamp columns need real Date objects for the driver mapping
  // (Drizzle timestamp modes call value.getTime() with no type guard).
  // Keyset cursors and API filters pass ISO strings / epoch numbers — coerce
  // them here or every comparison against a *At/*Date column throws.
  val = coerceDateColumnValue(col, val);

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

// Fused parse + map for mapQuery: builds SQL conditions directly from user query
// without allocating QueryIR / LogicalGroup / QueryCondition objects or their arrays.
// This is the highest-ROI hot-path optimization for filtered find/findMany.
// Uses for...in (zero allocation) instead of Object.entries.
// Exact semantics preserved (including root $and grouping, nested non-$ as $eq, date handling).

function addSingleCondition(
  conditions: SQL[],
  table: any,
  field: string,
  operator: string,
  value: any,
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
  operators?: Record<string, unknown>,
  coerceJsonValue?: (val: unknown) => unknown,
) {
  let col = getColumn(table, field);
  let isJsonField = false;
  if (!col) {
    const dataCol = getColumn(table, "data");
    if (dataCol) {
      col = getJsonField(field) as any;
      isJsonField = true;
    }
  }
  if (!col) return;

  let val = value;
  // JSON-extract columns render scalars dialect-specifically (MariaDB text
  // "true" vs SQLite typed 1/0 vs Postgres text `->>`). Adapters coerce the
  // bound value so e.g. `enabled: true` actually matches JSON-stored booleans.
  if (isJsonField && coerceJsonValue) {
    val = Array.isArray(val) ? val.map(coerceJsonValue) : coerceJsonValue(val);
  }
  if (val !== null && typeof val === "object" && typeof (val as any).getTime === "function") {
    val = safeDate(val);
  } else if (Array.isArray(val)) {
    val = val.map((v) =>
      v !== null && typeof v === "object" && typeof (v as any).getTime === "function"
        ? safeDate(v)
        : v,
    );
  }
  if (!col) return;
  // Date/timestamp columns need real Date objects for the driver mapping
  // (Drizzle timestamp modes call value.getTime() with no type guard).
  // Keyset cursors and API filters pass ISO strings / epoch numbers — coerce
  // them here or every comparison against a *At/*Date column throws.
  val = coerceDateColumnValue(col, val);

  switch (operator) {
    case "$eq":
      conditions.push(val === null ? isNull(col) : eq(col, val));
      break;
    case "$ne":
      conditions.push(ne(col, val));
      break;
    case "$gt":
      conditions.push(gt(col, val));
      break;
    case "$gte":
      conditions.push(gte(col, val));
      break;
    case "$lt":
      conditions.push(lt(col, val));
      break;
    case "$lte":
      conditions.push(lte(col, val));
      break;
    case "$in":
      conditions.push(inArray(col, Array.isArray(val) ? val : [val]));
      break;
    case "$regex": {
      // Mongo-style regex → SQL LIKE. Escape LIKE wildcards so user input
      // (e.g. "a.b" or "%" in search boxes) is matched literally.
      // The ESCAPE char is BOUND as a parameter, never inlined: on MySQL/MariaDB
      // a backslash inside a string literal is itself an escape, so `ESCAPE '\\'`
      // written as SQL text is a syntax error there (fine on SQLite/Postgres).
      const raw = String(val ?? "");
      // Translate Mongo anchors: "^foo" → starts-with, "foo$" → ends-with.
      const anchorStart = raw.startsWith("^");
      const anchorEnd = raw.endsWith("$");
      const core = anchorStart ? raw.slice(1) : raw;
      const noTrailing = anchorEnd ? core.slice(0, -1) : core;
      const escaped = escapeLikePattern(noTrailing);
      const pattern = `${anchorStart ? "" : "%"}${escaped}${anchorEnd ? "" : "%"}`;
      const caseInsensitive = String(operators?.["$options"] ?? "")
        .toLowerCase()
        .includes("i");
      // Postgres LIKE is case-sensitive — use lower() on both sides for $options:"i"
      // (SQLite/MySQL LIKE are already case-insensitive by default).
      const ESCAPE_CHAR = "\\";
      conditions.push(
        caseInsensitive
          ? sql`lower(${col}) LIKE lower(${pattern}) ESCAPE ${ESCAPE_CHAR}`
          : sql`${col} LIKE ${pattern} ESCAPE ${ESCAPE_CHAR}`,
      );
      break;
    }
    case "$options":
      // Paired with $regex above (Mongo syntax); no standalone SQL meaning.
      break;
    default:
      conditions.push(eq(col, val));
      break;
  }
}

function addFilterConds(
  out: SQL[],
  table: any,
  q: any,
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
  coerceJsonValue?: (val: unknown) => unknown,
) {
  if (!q || typeof q !== "object") return;
  for (const key in q) {
    if (!Object.prototype.hasOwnProperty.call(q, key)) continue;
    const value = q[key];
    if (key === "$or" && Array.isArray(value)) {
      const subs: SQL[] = [];
      for (const sub of value) {
        const sc: SQL[] = [];
        addFilterConds(sc, table, sub, getColumn, getJsonField, coerceJsonValue);
        if (sc.length > 0) {
          const s = sc.length === 1 ? sc[0] : and(...sc);
          if (s) subs.push(s);
        }
      }
      if (subs.length > 0) {
        const s = subs.length === 1 ? subs[0] : or(...subs);
        if (s) out.push(s);
      }
    } else if (key === "$and" && Array.isArray(value)) {
      const subs: SQL[] = [];
      for (const sub of value) {
        addFilterConds(subs, table, sub, getColumn, getJsonField, coerceJsonValue);
      }
      if (subs.length > 0) {
        const s = subs.length === 1 ? subs[0] : and(...subs);
        if (s) out.push(s);
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      let handled = false;
      for (const subKey in value) {
        if (!Object.prototype.hasOwnProperty.call(value, subKey)) continue;
        const subValue = value[subKey];
        if (subKey.startsWith("$")) {
          addSingleCondition(
            out,
            table,
            key,
            subKey,
            subValue,
            getColumn,
            getJsonField,
            value,
            coerceJsonValue,
          );
          handled = true;
        } else {
          addSingleCondition(
            out,
            table,
            key,
            "$eq",
            value,
            getColumn,
            getJsonField,
            undefined,
            coerceJsonValue,
          );
          handled = true;
          break;
        }
      }
      if (!handled) {
        addSingleCondition(
          out,
          table,
          key,
          "$eq",
          value,
          getColumn,
          getJsonField,
          undefined,
          coerceJsonValue,
        );
      }
    } else {
      addSingleCondition(
        out,
        table,
        key,
        "$eq",
        value,
        getColumn,
        getJsonField,
        undefined,
        coerceJsonValue,
      );
    }
  }
}

export function mapQuery(
  table: any,
  query: any,
  options: any = {},
  getColumn: (table: any, name: string) => Column | undefined,
  getJsonField: (field: string) => SQL,
  coerceJsonValue?: (val: unknown) => unknown,
): SQL | undefined {
  if (query && query._id && (typeof query._id === "string" || typeof query._id === "number")) {
    // Zero-allocation fast-path guard: count keys without allocating Object.keys array.
    // Tiny micro-win; V8/Bun still optimize the original for 1-element cases, but this matches the "allocation floor" goal.
    let keyCount = 0;
    for (const k in query) {
      if (Object.prototype.hasOwnProperty.call(query, k)) {
        keyCount++;
        if (keyCount > 1) break;
      }
    }
    if (keyCount !== 1) {
      // fall through to full filter path
    } else {
      const idCol = getColumn(table, "_id") || getColumn(table, "id");
      if (idCol) {
        const conditions = [eq(idCol, query._id as any)];
        const tenantCol = getColumn(table, "tenantId");
        applyTenantFilter(conditions, tenantCol, options);
        return and(...conditions);
      }
    }
  }

  const conditions = acquireConditionsArray();
  if (query && typeof query === "object") {
    addFilterConds(conditions, table, query, getColumn, getJsonField, coerceJsonValue);
  }

  const tenantCol = getColumn(table, "tenantId");
  applyTenantFilter(conditions, tenantCol, options);

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

const tableSelectionCache = new WeakMap<any, any>();

/**
 * Physical column selection for a table. When `excludeData` is true and the
 * table has a JSON `data` blob column, it is omitted from the selection — the
 * caller then skips the JSON parse + flattenDataColumn pass entirely. This is
 * the projection win: list UIs that only need _id/status/updatedAt never pay
 * for deserializing the full content payload.
 */
export function getPhysicalSelection(
  table: any,
  selectionCache: Map<string, any>,
  getColumn: (table: any, name: string, forcePhysical?: boolean) => Column | undefined,
  excludeData = false,
): any {
  let cached = tableSelectionCache.get(table);
  if (cached && !excludeData) return cached;
  if (cached && excludeData) {
    const withoutData: any = {};
    for (const k of Object.keys(cached)) {
      if (k !== "data") withoutData[k] = cached[k];
    }
    return withoutData;
  }

  const tableName = getTableName(table);
  const lowerName = tableName.toLowerCase();

  const systemName = resolveSystemTableName(tableName);
  const isSystem = isSystemTable(tableName);

  // 🚀 ROW-STORE HYBRID: dynamic collection tables carry materialized columns
  // in their Drizzle def — select ALL def columns (the fixed base list would
  // silently drop materialized fields like title, and provisioned columns
  // like slug/collection/locale/publishedAt were never selected either).
  try {
    const columns = getTableColumns(table);
    if (columns && Object.keys(columns).length > 0) {
      const selection = excludeData ? omitData(columns) : columns;
      tableSelectionCache.set(table, columns);
      return selection;
    }
  } catch {}

  if (isSystem) {
    const cachedSel = selectionCache.get(systemName);
    if (cachedSel) {
      tableSelectionCache.set(table, cachedSel);
      return excludeData ? omitData(cachedSel) : cachedSel;
    }
  }

  const selection: any = {};
  let columnNames: readonly string[];

  if (isSystem && SYSTEM_LITERAL_COLUMNS[systemName]) {
    columnNames = SYSTEM_LITERAL_COLUMNS[systemName];
  } else if (systemName === "contentNodes" || lowerName.includes("content_nodes")) {
    columnNames = SYSTEM_LITERAL_COLUMNS.contentNodes;
  } else {
    columnNames = excludeData
      ? ["_id", "status", "tenantId", "createdAt", "updatedAt", "isDeleted"]
      : ["_id", "data", "status", "tenantId", "createdAt", "updatedAt", "isDeleted"];
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

  tableSelectionCache.set(table, selection);
  return selection;
}

function omitData(selection: any): any {
  const out: any = {};
  for (const k of Object.keys(selection)) {
    if (k !== "data") out[k] = selection[k];
  }
  return out;
}
