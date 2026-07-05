/**
 * @file src/databases/sqlite/schema/index.ts
 * @description Drizzle schema definitions for SQLite tables
 *
 * This file defines the relational schema for SveltyCMS using Drizzle ORM (SQLite).
 * All tables include multi-tenant support via nullable tenantId columns.
 *
 * Date fields are stored as INTEGER (unix timestamp ms) to be compatible with
 * JS Date objects used in shared modules. Drizzle handles Date <-> Number conversion.
 *
 * Booleans are stored as INTEGER (0/1).
 * JSON is stored as TEXT and parsed at runtime.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// --- Direct Exports from Sub-modules ---
export { fourOhFourLogs } from "./404-logs";
export { redirectsMV } from "./seo";
export { workflowDefinitions, workflowInstances } from "./workflow";

// --- Local Schema Definitions ---
import { fourOhFourLogs } from "./404-logs";
import { redirectsMV } from "./seo";
import { workflowDefinitions, workflowInstances } from "./workflow";
import type { TenantQuota, TenantUsage } from "../db-interface";

// Helper to create UUID primary key
const uuidPk = () => text("_id", { length: 36 }).primaryKey();

// Helper for timestamps
const timestamps = {
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
};

// Helper for tenantId (nullable for multi-tenant support)
const tenantField = () => text("tenantId", { length: 36 });

// Auth Users Table
export const authUsers = sqliteTable(
  "auth_users",
  {
    _id: uuidPk(),
    email: text("email", { length: 255 }).notNull(),
    username: text("username", { length: 255 }),
    password: text("password", { length: 255 }),
    emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    firstName: text("firstName", { length: 255 }),
    lastName: text("lastName", { length: 255 }),
    avatar: text("avatar"),
    roleIds: text("roleIds", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    role: text("role", { length: 50 }).notNull().default("user"),
    isAdmin: integer("isAdmin", { mode: "boolean" }).notNull().default(false),
    isRegistered: integer("isRegistered", { mode: "boolean" }).notNull().default(false),
    is2FAEnabled: integer("is2FAEnabled", { mode: "boolean" }).notNull().default(false),
    totpSecret: text("totpSecret"),
    backupCodes: text("backupCodes", { mode: "json" }).$type<string[]>(),
    last2FAVerification: integer("last2FAVerification", {
      mode: "timestamp_ms",
    }),
    authenticators: text("authenticators", { mode: "json" }).$type<
      import("../auth/types").Authenticator[]
    >(),
    failedAttempts: integer("failedAttempts").notNull().default(0),
    lockoutUntil: integer("lockoutUntil", { mode: "timestamp_ms" }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    emailIdx: index("auth_users_email_idx").on(table.email),
    tenantIdx: index("auth_users_tenant_idx").on(table.tenantId),
    tenantEmailIdx: index("auth_users_tenant_email_idx").on(table.tenantId, table.email),
    emailTenantUnique: unique("auth_users_email_tenant_unique").on(table.email, table.tenantId),
  }),
);

// Auth Sessions Table
export const authSessions = sqliteTable(
  "auth_sessions",
  {
    _id: uuidPk(),
    user_id: text("user_id", { length: 36 }).notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    userIdx: index("auth_sessions_user_idx").on(table.user_id),
    expiresIdx: index("auth_sessions_expires_idx").on(table.expires),
    tenantIdx: index("auth_sessions_tenant_idx").on(table.tenantId),
  }),
);

// Auth Tokens Table
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    _id: uuidPk(),
    user_id: text("user_id", { length: 36 }).notNull(),
    email: text("email", { length: 255 }).notNull(),
    token: text("token", { length: 255 }).notNull(),
    type: text("type", { length: 50 }).notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    role: text("role", { length: 50 }),
    username: text("username", { length: 255 }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    tokenIdx: index("auth_tokens_token_idx").on(table.token),
    userIdx: index("auth_tokens_user_idx").on(table.user_id),
    expiresIdx: index("auth_tokens_expires_idx").on(table.expires),
    tenantIdx: index("auth_tokens_tenant_idx").on(table.tenantId),
    tenantTokenIdx: index("auth_tokens_tenant_token_idx").on(table.tenantId, table.token),
  }),
);

// Roles Table
export const roles = sqliteTable(
  "roles",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    description: text("description"),
    permissions: text("permissions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    isAdmin: integer("isAdmin", { mode: "boolean" }).notNull().default(false),
    icon: text("icon", { length: 100 }),
    color: text("color", { length: 50 }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: index("roles_name_idx").on(table.name),
    tenantIdx: index("roles_tenant_idx").on(table.tenantId),
  }),
);

// Content Nodes Table (Pages/Collections)
export const contentNodes = sqliteTable(
  "content_nodes",
  {
    _id: uuidPk(),
    path: text("path", { length: 500 }).notNull(),
    parentId: text("parentId", { length: 36 }),
    nodeType: text("nodeType", { length: 50 }).notNull(),
    status: text("status", { length: 50 }).notNull().default("draft"),
    name: text("name", { length: 500 }),
    slug: text("slug", { length: 500 }),
    icon: text("icon", { length: 100 }),
    description: text("description"),
    collectionDef: text("collectionDef", { mode: "json" }).$type<
      import("@src/content/types").Schema
    >(),
    data: text("data"),
    metadata: text("metadata"),
    translations: text("translations")
      .$type<{ languageTag: string; translationName: string }[]>()
      .default("[]" as any),
    position: integer("position").notNull().default(0),
    isPublished: integer("isPublished", { mode: "boolean" }).notNull().default(false),
    publishedAt: integer("publishedAt", { mode: "timestamp_ms" }),
    isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
    deletedAt: integer("deletedAt", { mode: "timestamp_ms" }),
    source: text("source").notNull().default("filesystem"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    parentIdx: index("content_nodes_parent_idx").on(table.parentId),
    nodeTypeIdx: index("content_nodes_nodetype_idx").on(table.nodeType),
    statusIdx: index("content_nodes_status_idx").on(table.status),
    tenantIdx: index("content_nodes_tenant_idx").on(table.tenantId),
    pathTenantUnique: unique("content_nodes_path_tenant_unique").on(table.path, table.tenantId),
  }),
);

// Content Drafts Table
export const contentDrafts = sqliteTable(
  "content_drafts",
  {
    _id: uuidPk(),
    contentId: text("contentId", { length: 36 }).notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status", { length: 50 }).notNull().default("draft"),
    authorId: text("authorId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    contentIdx: index("content_drafts_content_idx").on(table.contentId),
    authorIdx: index("content_drafts_author_idx").on(table.authorId),
    statusIdx: index("content_drafts_status_idx").on(table.status),
    tenantIdx: index("content_drafts_tenant_idx").on(table.tenantId),
  }),
);

// Content Revisions Table
export const contentRevisions = sqliteTable(
  "content_revisions",
  {
    _id: uuidPk(),
    contentId: text("contentId", { length: 36 }).notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    commitMessage: text("commitMessage"),
    authorId: text("authorId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    contentIdx: index("content_revisions_content_idx").on(table.contentId),
    versionIdx: index("content_revisions_version_idx").on(table.version),
    authorIdx: index("content_revisions_author_idx").on(table.authorId),
    tenantIdx: index("content_revisions_tenant_idx").on(table.tenantId),
  }),
);

// Themes Table
export const themes = sqliteTable(
  "themes",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    path: text("path", { length: 500 }).notNull(),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(false),
    isDefault: integer("isDefault", { mode: "boolean" }).notNull().default(false),
    config: text("config", { mode: "json" }).$type<Record<string, any>>().notNull(),
    previewImage: text("previewImage"),
    customCss: text("customCss"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: unique("themes_name_tenant_unique").on(table.name, table.tenantId),
    activeIdx: index("themes_active_idx").on(table.isActive),
    tenantIdx: index("themes_tenant_idx").on(table.tenantId),
  }),
);

// Widgets Table
export const widgets = sqliteTable(
  "widgets",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    instances: text("instances", { mode: "json" })
      .notNull()
      .default({} as any),
    dependencies: text("dependencies", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: unique("widgets_name_unique").on(table.name),
    activeIdx: index("widgets_active_idx").on(table.isActive),
    tenantIdx: index("widgets_tenant_idx").on(table.tenantId),
  }),
);

// Media Items Table
export const mediaItems = sqliteTable(
  "media_items",
  {
    _id: uuidPk(),
    filename: text("filename", { length: 500 }).notNull(),
    originalFilename: text("originalFilename", { length: 500 }).notNull(),
    hash: text("hash", { length: 255 }).notNull(),
    path: text("path", { length: 1000 }).notNull(),
    size: integer("size").notNull(),
    mimeType: text("mimeType", { length: 255 }).notNull(),
    folderId: text("folderId", { length: 36 }),
    originalId: text("originalId", { length: 36 }),
    thumbnails: text("thumbnails")
      .notNull()
      .default("{}" as any),
    metadata: text("metadata")
      .notNull()
      .default("{}" as any),
    access: text("access", { length: 50 }).notNull().default("public"),
    createdBy: text("createdBy", { length: 36 }).notNull(),
    updatedBy: text("updatedBy", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    hashIdx: index("media_items_hash_idx").on(table.hash),
    folderIdx: index("media_items_folder_idx").on(table.folderId),
    createdByIdx: index("media_items_created_by_idx").on(table.createdBy),
    tenantIdx: index("media_items_tenant_idx").on(table.tenantId),
  }),
);

// System Virtual Folders Table
export const systemVirtualFolders = sqliteTable(
  "system_virtual_folders",
  {
    _id: uuidPk(),
    name: text("name", { length: 500 }).notNull(),
    path: text("path", { length: 1000 }).notNull(),
    parentId: text("parentId", { length: 36 }),
    icon: text("icon", { length: 100 }),
    position: integer("position").notNull().default(0),
    type: text("type", { length: 50 }).notNull().default("folder"),
    metadata: text("metadata"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    pathIdx: unique("system_folders_path_unique").on(table.path),
    parentIdx: index("system_folders_parent_idx").on(table.parentId),
    typeIdx: index("system_folders_type_idx").on(table.type),
    tenantIdx: index("system_folders_tenant_idx").on(table.tenantId),
  }),
);

// System Preferences Table
export const systemPreferences = sqliteTable(
  "system_preferences",
  {
    _id: uuidPk(),
    key: text("key", { length: 255 }).notNull(),
    value: text("value"),
    scope: text("scope", { length: 50 }).notNull().default("system"),
    userId: text("userId", { length: 36 }),
    visibility: text("visibility", { length: 50 }).notNull().default("private"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    keyIdx: index("system_prefs_key_idx").on(table.key),
    scopeIdx: index("system_prefs_scope_idx").on(table.scope),
    userIdx: index("system_prefs_user_idx").on(table.userId),
    tenantIdx: index("system_prefs_tenant_idx").on(table.tenantId),
    keyTenantUnique: unique("system_prefs_key_tenant_unique").on(table.key, table.tenantId),
  }),
);

// Background Jobs Table
export const sveltyJobs = sqliteTable(
  "svelty_jobs",
  {
    _id: uuidPk(),
    taskType: text("taskType", { length: 255 }).notNull(),
    payload: text("payload").notNull(),
    status: text("status", { length: 50 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("maxAttempts").notNull().default(3),
    nextRunAt: integer("nextRunAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    lastError: text("lastError"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("jobs_status_idx").on(table.status),
    nextRunIdx: index("jobs_next_run_idx").on(table.nextRunAt),
    tenantIdx: index("jobs_tenant_idx").on(table.tenantId),
  }),
);

// Website Tokens Table
export const websiteTokens = sqliteTable(
  "website_tokens",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    token: text("token", { length: 255 }).notNull(),
    permissions: text("permissions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    createdBy: text("createdBy", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    tokenIdx: unique("website_tokens_token_unique").on(table.token),
    nameIdx: index("website_tokens_name_idx").on(table.name),
    tenantIdx: index("website_tokens_tenant_idx").on(table.tenantId),
    tenantNameIdx: index("website_tokens_tenant_name_idx").on(table.tenantId, table.name),
  }),
);

// Plugin: PageSpeed Results Table
export const pluginPagespeedResults = sqliteTable(
  "plugin_pagespeed_results",
  {
    _id: uuidPk(),
    entryId: text("entryId", { length: 36 }).notNull(),
    collectionId: text("collectionId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    language: text("language", { length: 10 }).notNull().default("en"),
    device: text("device", { length: 20 }).notNull().default("mobile"),
    url: text("url", { length: 2000 }).notNull(),
    performanceScore: integer("performanceScore").notNull().default(0),
    fetchedAt: integer("fetchedAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    ...timestamps,
  },
  (table) => ({
    entryIdx: index("pagespeed_entry_idx").on(table.entryId),
    collectionIdx: index("pagespeed_collection_idx").on(table.collectionId),
    tenantIdx: index("pagespeed_tenant_idx").on(table.tenantId),
    deviceIdx: index("pagespeed_device_idx").on(table.device),
  }),
);

// Plugin States Table
export const pluginStates = sqliteTable(
  "plugin_states",
  {
    _id: uuidPk(),
    pluginId: text("pluginId", { length: 255 }).notNull(),
    tenantId: tenantField(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    settings: text("settings", { mode: "json" }),
    updatedBy: text("updatedBy", { length: 36 }),
    ...timestamps,
  },
  (table) => ({
    pluginIdx: index("plugin_states_plugin_idx").on(table.pluginId),
    tenantIdx: index("plugin_states_tenant_idx").on(table.tenantId),
    pluginTenantUnique: unique("plugin_states_tenant_unique").on(table.pluginId, table.tenantId),
  }),
);

// Plugin Migrations Table
export const pluginMigrations = sqliteTable(
  "plugin_migrations",
  {
    _id: uuidPk(),
    pluginId: text("pluginId", { length: 255 }).notNull(),
    migrationId: text("migrationId", { length: 255 }).notNull(),
    version: integer("version").notNull(),
    tenantId: tenantField(),
    appliedAt: integer("appliedAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    ...timestamps,
  },
  (table) => ({
    pluginIdx: index("plugin_migrations_plugin_idx").on(table.pluginId),
    tenantIdx: index("plugin_migrations_tenant_idx").on(table.tenantId),
    pluginMigrationUnique: unique("plugin_migrations_unique").on(
      table.pluginId,
      table.migrationId,
      table.tenantId,
    ),
  }),
);

// Tenants Table
export const tenants = sqliteTable(
  "tenants",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    ownerId: text("ownerId", { length: 36 }).notNull(),
    status: text("status", { length: 20 }).notNull().default("active"),
    plan: text("plan", { length: 20 }).notNull().default("free"),
    quota: text("quota", { mode: "json" })
      .$type<TenantQuota>()
      .notNull()
      .default({
        maxUsers: 10,
        maxStorageBytes: 1_073_741_824,
        maxCollections: 20,
        maxApiRequestsPerMonth: 10_000,
      } as any),
    usage: text("usage", { mode: "json" })
      .$type<TenantUsage>()
      .notNull()
      .default({
        usersCount: 0,
        storageBytes: 0,
        collectionsCount: 0,
        apiRequestsMonth: 0,
        lastUpdated: new Date(),
      } as any),
    settings: text("settings", { mode: "json" }).default({} as any),
    ...timestamps,
  },
  (table) => ({
    // ✅ FIXED: Renamed from "tenants_name_idx" to "tenants_tenant_name_idx"
    nameIdx: index("tenants_tenant_name_idx").on(table.name),
    ownerIdx: index("tenants_owner_idx").on(table.ownerId),
  }),
);

// Audit Logs Table
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    _id: uuidPk(),
    action: text("action").notNull(),
    actorEmail: text("actorEmail"),
    actorId: text("actorId"),
    actorRole: text("actorRole"),
    correlationId: text("correlationId"),
    details: text("details", { mode: "json" }).notNull().default({}),
    errorDetails: text("errorDetails", { mode: "json" }),
    eventType: text("eventType").notNull(),
    ipAddress: text("ipAddress"),
    result: text("result").notNull(),
    sessionId: text("sessionId"),
    severity: text("severity").notNull(),
    targetId: text("targetId"),
    targetType: text("targetType"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("userAgent"),
    tenantId: tenantField(),
    previousHash: text("previousHash"),
    chainHash: text("chainHash"),
    ...timestamps,
  },
  (table) => ({
    actorIdx: index("audit_logs_actor_idx").on(table.actorId),
    typeIdx: index("audit_logs_type_idx").on(table.eventType),
    tenantIdx: index("audit_tenant_idx").on(table.tenantId),
  }),
);

// Auth API Keys Table
export const authApiKeys = sqliteTable(
  "auth_api_keys",
  {
    _id: uuidPk(),
    name: text("name", { length: 255 }).notNull(),
    hash: text("hash", { length: 255 }).notNull(),
    prefix: text("prefix", { length: 12 }).notNull(),
    userId: text("userId", { length: 36 }).notNull(),
    scopes: text("scopes", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    permissions: text("permissions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([] as any),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    usageCount: integer("usageCount").notNull().default(0),
    lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
    lastUsedIp: text("lastUsedIp"),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    hashIdx: unique("api_keys_hash_unique").on(table.hash),
    userIdx: index("api_keys_user_idx").on(table.userId),
    tenantIdx: index("api_key_tenant_idx").on(table.tenantId),
    tenantHashIdx: index("api_keys_tenant_hash_idx").on(table.tenantId, table.hash),
  }),
);

// Export all tables as a schema object for Drizzle
export const schema = {
  authUsers,
  authSessions,
  authTokens,
  authApiKeys,
  roles,
  contentNodes,
  contentDrafts,
  contentRevisions,
  themes,
  widgets,
  mediaItems,
  systemVirtualFolders,
  systemPreferences,
  sveltyJobs,
  websiteTokens,
  pluginPagespeedResults,
  pluginStates,
  pluginMigrations,
  tenants,
  auditLogs,
  fourOhFourLogs,
  workflowDefinitions,
  workflowInstances,
  redirectsMV,
};
