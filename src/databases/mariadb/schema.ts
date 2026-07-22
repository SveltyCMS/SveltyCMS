/**
 * @file src/databases/mariadb/schema/index.ts
 * @description Drizzle schema definitions for MariaDB tables
 *
 * This file defines the relational schema for SveltyCMS using Drizzle ORM.
 * All tables include multi-tenant support via nullable tenantId columns.
 * Date fields are stored as DATETIME and converted to ISODateString at boundaries.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import type { TenantQuota, TenantUsage } from "../db-interface";

// Helper to create UUID primary key
const uuidPk = () => varchar("_id", { length: 36 }).primaryKey();

// Helper for timestamps
const timestamps = {
  createdAt: datetime("createdAt")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updatedAt")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
};

// Helper for tenantId (nullable for multi-tenant support)
// Explicit default(null) ensures Drizzle sends NULL instead of DEFAULT keyword
const tenantField = () => varchar("tenantId", { length: 36 }).default(sql`NULL`);

// Auth Users Table
export const authUsers = mysqlTable(
  "auth_users",
  {
    _id: uuidPk(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 255 }),
    password: varchar("password", { length: 255 }),
    emailVerified: boolean("emailVerified").notNull().default(false),
    blocked: boolean("blocked").notNull().default(false),
    isAdmin: boolean("isAdmin").notNull().default(false),
    firstName: varchar("firstName", { length: 255 }),
    lastName: varchar("lastName", { length: 255 }),
    avatar: text("avatar"),
    roleIds: json("roleIds").$type<string[]>().notNull().default([]),
    role: varchar("role", { length: 50 }).notNull().default("user"),
    isRegistered: boolean("isRegistered").notNull().default(false),
    is2FAEnabled: boolean("is2FAEnabled").notNull().default(false),
    totpSecret: varchar("totpSecret", { length: 255 }),
    backupCodes: json("backupCodes").$type<string[]>(),
    last2FAVerification: datetime("last2FAVerification"),
    authenticators: json("authenticators").$type<import("../auth/types").Authenticator[]>(),
    failedAttempts: int("failedAttempts").notNull().default(0),
    lockoutUntil: datetime("lockoutUntil"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    emailTenantUnique: unique("email_tenant_unique").on(table.email, table.tenantId),
  }),
);

// Auth Sessions Table
export const authSessions = mysqlTable(
  "auth_sessions",
  {
    _id: uuidPk(),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    expires: datetime("expires").notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    userIdx: index("user_idx").on(table.user_id),
    expiresIdx: index("expires_idx").on(table.expires),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Auth Tokens Table
export const authTokens = mysqlTable(
  "auth_tokens",
  {
    _id: uuidPk(),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    expires: datetime("expires").notNull(),
    consumed: boolean("consumed").notNull().default(false),
    blocked: boolean("blocked").notNull().default(false),
    role: varchar("role", { length: 50 }),
    username: varchar("username", { length: 255 }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    tokenIdx: index("token_idx").on(table.token),
    userIdx: index("user_idx").on(table.user_id),
    expiresIdx: index("expires_idx").on(table.expires),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Roles Table
export const roles = mysqlTable(
  "roles",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    permissions: json("permissions").$type<string[]>().notNull().default([]),
    isAdmin: boolean("isAdmin").notNull().default(false),
    icon: varchar("icon", { length: 100 }),
    color: varchar("color", { length: 50 }),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: index("name_idx").on(table.name),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Content Nodes Table (Pages/Collections)
export const contentNodes = mysqlTable(
  "content_nodes",
  {
    _id: uuidPk(),
    path: varchar("path", { length: 500 }).notNull(),
    parentId: varchar("parentId", { length: 36 }),
    nodeType: varchar("nodeType", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    name: varchar("name", { length: 500 }),
    slug: varchar("slug", { length: 500 }),
    icon: varchar("icon", { length: 100 }),
    description: text("description"),
    collectionDef: json("collectionDef").$type<import("@src/content/types").Schema>(),
    data: json("data"),
    metadata: json("metadata"),
    translations: json("translations")
      .$type<{ languageTag: string; translationName: string }[]>()
      .default([]),
    position: int("position").notNull().default(0),
    isPublished: boolean("isPublished").notNull().default(false),
    publishedAt: datetime("publishedAt"),
    isDeleted: boolean("isDeleted").notNull().default(false),
    deletedAt: datetime("deletedAt"),
    source: varchar("source", { length: 50 }).notNull().default("filesystem"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    parentIdx: index("parent_idx").on(table.parentId),
    nodeTypeIdx: index("nodeType_idx").on(table.nodeType),
    statusIdx: index("status_idx").on(table.status),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    pathTenantUnique: unique("path_tenant_unique").on(table.path, table.tenantId),
  }),
);

// Content Drafts Table
export const contentDrafts = mysqlTable(
  "content_drafts",
  {
    _id: uuidPk(),
    contentId: varchar("contentId", { length: 36 }).notNull(),
    data: json("data").notNull(),
    version: int("version").notNull().default(1),
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    authorId: varchar("authorId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    contentIdx: index("content_idx").on(table.contentId),
    authorIdx: index("author_idx").on(table.authorId),
    statusIdx: index("status_idx").on(table.status),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Content Revisions Table
export const contentRevisions = mysqlTable(
  "content_revisions",
  {
    _id: uuidPk(),
    contentId: varchar("contentId", { length: 36 }).notNull(),
    data: json("data").notNull(),
    version: int("version").notNull().default(1),
    commitMessage: text("commitMessage"),
    authorId: varchar("authorId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    contentIdx: index("content_idx").on(table.contentId),
    versionIdx: index("version_idx").on(table.version),
    authorIdx: index("author_idx").on(table.authorId),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Themes Table
export const themes = mysqlTable(
  "themes",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    isActive: boolean("isActive").notNull().default(false),
    isDefault: boolean("isDefault").notNull().default(false),
    config: json("config").notNull(),
    previewImage: text("previewImage"),
    customCss: text("customCss"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: unique("themes_name_tenant_unique").on(table.name, table.tenantId),
    activeIdx: index("active_idx").on(table.isActive),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Widgets Table
export const widgets = mysqlTable(
  "widgets",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    isActive: boolean("isActive").notNull().default(true),
    instances: json("instances").notNull().default({}),
    dependencies: json("dependencies").$type<string[]>().notNull().default([]),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: unique("name_unique").on(table.name),
    activeIdx: index("active_idx").on(table.isActive),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Media Items Table
export const mediaItems = mysqlTable(
  "media_items",
  {
    _id: uuidPk(),
    filename: varchar("filename", { length: 500 }).notNull(),
    originalFilename: varchar("originalFilename", { length: 500 }).notNull(),
    hash: varchar("hash", { length: 255 }).notNull(),
    path: varchar("path", { length: 1000 }).notNull(),
    size: int("size").notNull(),
    mimeType: varchar("mimeType", { length: 255 }).notNull(),
    folderId: varchar("folderId", { length: 36 }),
    originalId: varchar("originalId", { length: 36 }),
    thumbnails: json("thumbnails").notNull().default({}),
    metadata: json("metadata").notNull().default({}),
    access: varchar("access", { length: 50 }).notNull().default("public"),
    createdBy: varchar("createdBy", { length: 36 }).notNull(),
    updatedBy: varchar("updatedBy", { length: 36 }).notNull(),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    hashIdx: index("hash_idx").on(table.hash),
    folderIdx: index("folder_idx").on(table.folderId),
    createdByIdx: index("created_by_idx").on(table.createdBy),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// System Virtual Folders Table
export const systemVirtualFolders = mysqlTable(
  "system_virtual_folders",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 500 }).notNull(),
    path: varchar("path", { length: 1000 }).notNull(),
    parentId: varchar("parentId", { length: 36 }),
    icon: varchar("icon", { length: 100 }),
    position: int("position").notNull().default(0),
    type: varchar("type", { length: 50 }).notNull().default("folder"),
    metadata: json("metadata"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    pathIdx: unique("path_unique").on(table.path),
    parentIdx: index("parent_idx").on(table.parentId),
    typeIdx: index("type_idx").on(table.type),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// System Preferences Table
export const systemPreferences = mysqlTable(
  "system_preferences",
  {
    _id: uuidPk(),
    key: varchar("key", { length: 255 }).notNull(),
    value: json("value"),
    scope: varchar("scope", { length: 50 }).notNull().default("system"),
    userId: varchar("userId", { length: 36 }),
    visibility: varchar("visibility", { length: 50 }).notNull().default("private"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    keyIdx: unique("system_preferences_key_tenant_unique").on(table.key, table.tenantId),
    scopeIdx: index("scope_idx").on(table.scope),
    userIdx: index("user_idx").on(table.userId),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Audit Logs Table
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    _id: uuidPk(),
    action: varchar("action", { length: 255 }).notNull(),
    actorEmail: varchar("actorEmail", { length: 255 }),
    actorId: varchar("actorId", { length: 36 }),
    actorRole: varchar("actorRole", { length: 50 }),
    correlationId: varchar("correlationId", { length: 36 }),
    details: json("details").notNull(),
    errorDetails: text("errorDetails"),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    ipAddress: varchar("ipAddress", { length: 45 }),
    result: varchar("result", { length: 50 }).notNull(),
    sessionId: varchar("sessionId", { length: 36 }),
    severity: varchar("severity", { length: 20 }).notNull(),
    targetId: varchar("targetId", { length: 255 }),
    targetType: varchar("targetType", { length: 100 }),
    timestamp: datetime("timestamp")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    userAgent: text("userAgent"),
    tenantId: tenantField(),
    previousHash: varchar("previousHash", { length: 64 }),
    chainHash: varchar("chainHash", { length: 64 }),
    ...timestamps,
  },
  (table) => ({
    timestampIdx: index("timestamp_idx").on(table.timestamp),
    eventTypeIdx: index("event_type_idx").on(table.eventType),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Outbox Events Table — Transactional Outbox Pattern
// Events are written in the same transaction as the data change,
// then a background process reads and delivers them reliably.
export const sveltyOutbox = mysqlTable(
  "svelty_outbox",
  {
    _id: uuidPk(),
    tenantId: tenantField(),
    eventType: varchar("eventType", { length: 255 }).notNull(),
    aggregateType: varchar("aggregateType", { length: 255 }).notNull(),
    aggregateId: varchar("aggregateId", { length: 255 }).notNull(),
    payload: json("payload").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    deliveredAt: datetime("deliveredAt"),
    attempts: int("attempts").notNull().default(0),
    lastError: text("lastError"),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("outbox_status_idx").on(table.status),
    tenantIdx: index("outbox_tenant_idx").on(table.tenantId),
    eventTypeIdx: index("outbox_event_type_idx").on(table.eventType),
    createdAtIdx: index("outbox_created_at_idx").on(table.createdAt),
  }),
);

// Background Jobs Table
export const sveltyJobs = mysqlTable(
  "svelty_jobs",
  {
    _id: uuidPk(),
    taskType: varchar("taskType", { length: 255 }).notNull(),
    payload: json("payload").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, running, completed, failed
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("maxAttempts").notNull().default(3),
    nextRunAt: datetime("nextRunAt")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastError: text("lastError"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("job_status_idx").on(table.status),
    nextRunIdx: index("job_next_run_idx").on(table.nextRunAt),
    tenantIdx: index("tenant_idx").on(table.tenantId),
  }),
);

// Website Tokens Table
export const websiteTokens = mysqlTable(
  "website_tokens",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdBy: varchar("createdBy", { length: 36 }).notNull(),
    permissions: json("permissions").$type<string[]>().notNull().default([]),
    expiresAt: datetime("expiresAt"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    tokenIdx: unique("token_unique").on(table.token),
    nameIdx: index("name_idx").on(table.name),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    tenantNameIdx: index("tenant_name_idx").on(table.tenantId, table.name),
  }),
);

// Plugin: PageSpeed Results Table
export const pluginPagespeedResults = mysqlTable(
  "plugin_pagespeed_results",
  {
    _id: uuidPk(),
    entryId: varchar("entryId", { length: 36 }).notNull(),
    collectionId: varchar("collectionId", { length: 36 }).notNull(),
    tenantId: tenantField(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    device: varchar("device", { length: 20 }).notNull().default("mobile"),
    url: varchar("url", { length: 2000 }).notNull(),
    performanceScore: int("performanceScore").notNull().default(0),
    fetchedAt: datetime("fetchedAt")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...timestamps,
  },
  (table) => ({
    entryIdx: index("entry_idx").on(table.entryId),
    collectionIdx: index("collection_idx").on(table.collectionId),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    deviceIdx: index("device_idx").on(table.device),
  }),
);

// Plugin States Table
export const pluginStates = mysqlTable(
  "plugin_states",
  {
    _id: uuidPk(),
    pluginId: varchar("pluginId", { length: 255 }).notNull(),
    tenantId: tenantField(),
    enabled: boolean("enabled").notNull().default(false),
    settings: json("settings"),
    updatedBy: varchar("updatedBy", { length: 36 }),
    ...timestamps,
  },
  (table) => ({
    pluginIdx: index("plugin_idx").on(table.pluginId),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    pluginTenantUnique: unique("plugin_tenant_unique").on(table.pluginId, table.tenantId),
  }),
);

// Plugin Storage Table
export const pluginStorage = mysqlTable(
  "plugin_storage",
  {
    _id: uuidPk(),
    plugin: varchar("plugin", { length: 255 }).notNull(),
    collectionName: varchar("collection", { length: 255 }).notNull(),
    tenantId: tenantField(),
    data: json("data").notNull(),
    ...timestamps,
  },
  (table) => ({
    pluginIdx: index("plugin_storage_plugin_idx").on(table.plugin),
    collectionIdx: index("plugin_storage_collection_idx").on(table.collectionName),
    tenantIdx: index("plugin_storage_tenant_idx").on(table.tenantId),
    pluginCollectionIdx: index("plugin_storage_plugin_collection_idx").on(
      table.plugin,
      table.collectionName,
    ),
  }),
);

// Plugin Migrations Table
export const pluginMigrations = mysqlTable(
  "plugin_migrations",
  {
    _id: uuidPk(),
    pluginId: varchar("pluginId", { length: 255 }).notNull(),
    migrationId: varchar("migrationId", { length: 255 }).notNull(),
    version: int("version").notNull(),
    tenantId: tenantField(),
    appliedAt: datetime("appliedAt")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...timestamps,
  },
  (table) => ({
    pluginIdx: index("plugin_idx").on(table.pluginId),
    tenantIdx: index("tenant_idx").on(table.tenantId),
    pluginMigrationUnique: unique("plugin_migration_unique").on(
      table.pluginId,
      table.migrationId,
      table.tenantId,
    ),
  }),
);

// Tenants Table
export const tenants = mysqlTable(
  "tenants",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    ownerId: varchar("ownerId", { length: 36 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    plan: varchar("plan", { length: 20 }).notNull().default("free"),
    quota: json("quota").$type<TenantQuota>().notNull().default({
      maxUsers: 10,
      maxStorageBytes: 1_073_741_824,
      maxCollections: 20,
      maxApiRequestsPerMonth: 10_000,
    }),
    usage: json("usage").$type<TenantUsage>().notNull().default({
      usersCount: 0,
      storageBytes: 0,
      collectionsCount: 0,
      apiRequestsMonth: 0,
      lastUpdated: new Date(),
    }),
    settings: json("settings").default({}),
    ...timestamps,
  },
  (table) => ({
    nameIdx: index("tenant_name_idx").on(table.name),
    ownerIdx: index("tenant_owner_idx").on(table.ownerId),
  }),
);

// Redirects Materialized View Table
export const redirectsMV = mysqlTable(
  "redirects_mv",
  {
    _id: varchar("_id", { length: 36 }).primaryKey(),
    tenantId: tenantField(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    type: int("type").default(301),
    isRegex: boolean("isRegex").default(false),
    active: boolean("active").default(true),
    metadata: json("metadata"),
    ...timestamps,
  },
  (table) => ({
    tenantIdx: index("tenant_idx").on(table.tenantId),
    activeIdx: index("active_idx").on(table.active),
    lookupIdx: index("idx_redirects_mv_lookup").on(table.tenantId, table.source, table.active),
  }),
);

// Auth API Keys Table
export const authApiKeys = mysqlTable(
  "auth_api_keys",
  {
    _id: uuidPk(),
    name: varchar("name", { length: 255 }).notNull(),
    hash: varchar("hash", { length: 255 }).notNull(),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    userId: varchar("userId", { length: 36 }).notNull(),
    scopes: json("scopes").$type<string[]>().notNull().default([]),
    permissions: json("permissions").$type<string[]>().notNull().default([]),
    revoked: boolean("revoked").notNull().default(false),
    usageCount: int("usageCount").notNull().default(0),
    lastUsedAt: datetime("lastUsedAt"),
    lastUsedIp: varchar("lastUsedIp", { length: 45 }),
    expiresAt: datetime("expiresAt"),
    tenantId: tenantField(),
    ...timestamps,
  },
  (table) => ({
    hashIdx: unique("hash_unique").on(table.hash),
    userIdx: index("api_key_user_idx").on(table.userId),
    tenantIdx: index("api_key_tenant_idx").on(table.tenantId),
    tenantHashIdx: index("tenant_hash_idx").on(table.tenantId, table.hash),
  }),
);

// Workflow Definitions Table
export const workflowDefinitions = mysqlTable(
  "workflow_definitions",
  {
    _id: varchar("_id", { length: 36 }).primaryKey(),
    tenantId: tenantField(),
    collectionId: varchar("collectionId", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    states: json("states").notNull().default([]),
    transitions: json("transitions").notNull().default([]),
    ...timestamps,
  },
  (table) => ({
    tenantIdx: index("workflow_def_tenant_idx").on(table.tenantId),
    collectionIdx: index("workflow_def_collection_idx").on(table.collectionId),
  }),
);

// Workflow Instances Table
export const workflowInstances = mysqlTable(
  "workflow_instances",
  {
    _id: varchar("_id", { length: 36 }).primaryKey(),
    tenantId: tenantField(),
    entryId: varchar("entryId", { length: 36 }).notNull(),
    collectionId: varchar("collectionId", { length: 255 }).notNull(),
    currentState: varchar("currentState", { length: 100 }).notNull(),
    history: json("history").notNull().default([]),
    ...timestamps,
  },
  (table) => ({
    tenantIdx: index("workflow_inst_tenant_idx").on(table.tenantId),
    entryIdx: index("workflow_inst_entry_idx").on(table.entryId),
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
  sveltyOutbox,
  sveltyJobs,
  websiteTokens,
  pluginPagespeedResults,
  pluginStates,
  pluginStorage,
  pluginMigrations,
  tenants,
  auditLogs,
  redirectsMV,
  workflowDefinitions,
  workflowInstances,
};
