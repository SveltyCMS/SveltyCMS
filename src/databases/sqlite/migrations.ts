/**
 * @file src/databases/sqlite/migrations.ts
 * @description Automatic schema migration for SQLite (Bun Native)
 *
 * Updates:
 * - Date fields are INTEGER to match Drizzle `timestamp_ms` mode.
 * - Defaults use (strftime('%s', 'now') * 1000) for milliseconds.
 */

import { logger } from "@utils/logger";
import type { DatabaseResult } from "../db-interface";

// 🚀 AGNOSTIC CORE: Standardized SQLite migrations.
export async function runMigrations(db: any): Promise<DatabaseResult<void>> {
  logger.info("🚀 [SQLite] Running system migrations...");
  const execute = (sql: string) => {
    try {
      if (typeof db.exec === "function") db.exec(sql);
      else if (typeof db.run === "function") db.run(sql);
      else if (typeof db.query === "function") db.query(sql).run();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("already exists") && !message.includes("duplicate column name")) {
        logger.error(`[SQLite Migration] FAILED: ${message}`);
        throw err;
      }
    }
  };

  try {
    // 🚀 PERFORMANCE: Consolidate all core table creations into a single batch execution
    execute(`
      CREATE TABLE IF NOT EXISTS "auth_users" (
        "_id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL,
        "username" TEXT,
        "password" TEXT,
        "emailVerified" INTEGER DEFAULT 0,
        "blocked" INTEGER DEFAULT 0,
        "firstName" TEXT,
        "lastName" TEXT,
        "avatar" TEXT,
        "roleIds" TEXT DEFAULT '[]',
        "role" TEXT NOT NULL DEFAULT 'user',
        "isAdmin" INTEGER DEFAULT 0,
        "isRegistered" INTEGER DEFAULT 0,
        "is2FAEnabled" INTEGER DEFAULT 0,
        "totpSecret" TEXT,
        "backupCodes" TEXT,
        "last2FAVerification" INTEGER,
        "authenticators" TEXT,
        "failedAttempts" INTEGER DEFAULT 0,
        "lockoutUntil" INTEGER,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "_id" TEXT PRIMARY KEY,
        "user_id" TEXT NOT NULL,
        "expires" INTEGER NOT NULL,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "auth_tokens" (
        "_id" TEXT PRIMARY KEY,
        "user_id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "expires" INTEGER NOT NULL,
        "consumed" INTEGER DEFAULT 0,
        "blocked" INTEGER DEFAULT 0,
        "isRegistered" INTEGER DEFAULT 0,
        "role" TEXT,
        "username" TEXT,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "auth_api_keys" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "hash" TEXT NOT NULL,
        "prefix" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "scopes" TEXT DEFAULT '[]',
        "permissions" TEXT DEFAULT '[]',
        "revoked" INTEGER DEFAULT 0,
        "usageCount" INTEGER DEFAULT 0,
        "lastUsedAt" INTEGER,
        "lastUsedIp" TEXT,
        "expiresAt" INTEGER,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "roles" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "permissions" TEXT DEFAULT '[]',
        "isAdmin" INTEGER DEFAULT 0,
        "icon" TEXT,
        "color" TEXT,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "content_nodes" (
        "_id" TEXT PRIMARY KEY,
        "path" TEXT NOT NULL,
        "parentId" TEXT,
        "nodeType" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "name" TEXT,
        "slug" TEXT,
        "icon" TEXT,
        "description" TEXT,
        "data" TEXT DEFAULT '{}',
        "metadata" TEXT DEFAULT '{}',
        "translations" TEXT DEFAULT '[]',
        "position" INTEGER DEFAULT 0,
        "isPublished" INTEGER DEFAULT 0,
        "publishedAt" INTEGER,
        "collectionDef" TEXT DEFAULT '{}',
        "isDeleted" INTEGER DEFAULT 0,
        "deletedAt" INTEGER,
        "source" TEXT NOT NULL DEFAULT 'filesystem',
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        UNIQUE("path", "tenantId")
      );

      CREATE TABLE IF NOT EXISTS "content_drafts" (
        "_id" TEXT PRIMARY KEY,
        "contentId" TEXT NOT NULL,
        "data" TEXT NOT NULL,
        "version" INTEGER DEFAULT 1,
        "status" TEXT DEFAULT 'draft',
        "authorId" TEXT NOT NULL,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "content_revisions" (
        "_id" TEXT PRIMARY KEY,
        "contentId" TEXT NOT NULL,
        "data" TEXT NOT NULL,
        "version" INTEGER DEFAULT 1,
        "commitMessage" TEXT,
        "authorId" TEXT NOT NULL,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "media_items" (
        "_id" TEXT PRIMARY KEY,
        "filename" TEXT NOT NULL,
        "originalFilename" TEXT NOT NULL,
        "hash" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "size" INTEGER NOT NULL,
        "mimeType" TEXT NOT NULL,
        "folderId" TEXT,
        "originalId" TEXT,
        "thumbnails" TEXT DEFAULT '{}',
        "metadata" TEXT DEFAULT '{}',
        "access" TEXT DEFAULT 'public',
        "createdBy" TEXT NOT NULL,
        "updatedBy" TEXT NOT NULL,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "system_virtual_folders" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "parentId" TEXT,
        "icon" TEXT,
        "position" INTEGER DEFAULT 0,
        "type" TEXT DEFAULT 'folder',
        "metadata" TEXT DEFAULT '{}',
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "system_preferences" (
        "_id" TEXT PRIMARY KEY,
        "key" TEXT NOT NULL,
        "value" TEXT DEFAULT '{}',
        "category" TEXT DEFAULT 'general',
        "scope" TEXT DEFAULT 'system',
        "userId" TEXT,
        "visibility" TEXT DEFAULT 'private',
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "themes" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "isActive" INTEGER DEFAULT 0,
        "isDefault" INTEGER DEFAULT 0,
        "config" TEXT NOT NULL DEFAULT '{}',
        "previewImage" TEXT,
        "customCss" TEXT,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "widgets" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "isActive" INTEGER DEFAULT 1,
        "instances" TEXT DEFAULT '{}',
        "dependencies" TEXT DEFAULT '[]',
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "website_tokens" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "permissions" TEXT DEFAULT '[]',
        "expiresAt" INTEGER,
        "createdBy" TEXT NOT NULL,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "plugin_pagespeed_results" (
        "_id" TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL,
        "collectionId" TEXT NOT NULL,
        "tenantId" TEXT,
        "language" TEXT DEFAULT 'en',
        "device" TEXT DEFAULT 'mobile',
        "url" TEXT NOT NULL,
        "performanceScore" INTEGER DEFAULT 0,
        "fetchedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "plugin_states" (
        "_id" TEXT PRIMARY KEY,
        "pluginId" TEXT NOT NULL,
        "tenantId" TEXT,
        "enabled" INTEGER DEFAULT 0,
        "settings" TEXT DEFAULT '{}',
        "updatedBy" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "plugin_migrations" (
        "_id" TEXT PRIMARY KEY,
        "pluginId" TEXT NOT NULL,
        "migrationId" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "tenantId" TEXT,
        "appliedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "svelty_jobs" (
        "_id" TEXT PRIMARY KEY,
        "taskType" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "status" TEXT DEFAULT 'pending',
        "attempts" INTEGER DEFAULT 0,
        "maxAttempts" INTEGER DEFAULT 3,
        "nextRunAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "lastError" TEXT,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "tenants" (
        "_id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "status" TEXT DEFAULT 'active',
        "plan" TEXT DEFAULT 'free',
        "quota" TEXT DEFAULT '{}',
        "usage" TEXT DEFAULT '{}',
        "settings" TEXT DEFAULT '{}',
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "404_logs" (
        "_id" TEXT PRIMARY KEY,
        "path" TEXT NOT NULL,
        "tenantId" TEXT,
        "hits" INTEGER DEFAULT 1,
        "lastHit" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "metadata" TEXT DEFAULT '{}',
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "_id" TEXT PRIMARY KEY,
        "action" TEXT NOT NULL,
        "actorEmail" TEXT,
        "actorId" TEXT,
        "actorRole" TEXT,
        "correlationId" TEXT,
        "details" TEXT DEFAULT '{}',
        "errorDetails" TEXT,
        "eventType" TEXT NOT NULL,
        "ipAddress" TEXT,
        "result" TEXT NOT NULL,
        "sessionId" TEXT,
        "severity" TEXT NOT NULL,
        "targetId" TEXT,
        "targetType" TEXT,
        "timestamp" INTEGER NOT NULL,
        "userAgent" TEXT,
        "tenantId" TEXT,
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "previousHash" TEXT,
        "chainHash" TEXT
      );

      CREATE TABLE IF NOT EXISTS "workflow_definitions" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "collectionId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "states" TEXT DEFAULT '[]',
        "transitions" TEXT DEFAULT '[]',
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "workflow_instances" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "entryId" TEXT NOT NULL,
        "collectionId" TEXT NOT NULL,
        "currentState" TEXT NOT NULL,
        "history" TEXT DEFAULT '[]',
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "redirects_mv" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "target" TEXT NOT NULL,
        "type" INTEGER DEFAULT 301,
        "isRegex" INTEGER DEFAULT 0,
        "active" INTEGER DEFAULT 1,
        "metadata" TEXT DEFAULT '{}',
        "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "collection_redirects" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "data" TEXT NOT NULL DEFAULT '{}',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "isDeleted" INTEGER NOT NULL DEFAULT 0,
        "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS "collection_404_logs" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "data" TEXT NOT NULL DEFAULT '{}',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "isDeleted" INTEGER NOT NULL DEFAULT 0,
        "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "idx_content_nodes_path_tenant" ON "content_nodes" ("path", "tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_system_prefs_key_tenant" ON "system_preferences" ("key", "tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_system_themes_name_tenant" ON "themes" ("name", "tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_plugin_states_unique" ON "plugin_states" ("pluginId", "tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_plugin_migrations_unique" ON "plugin_migrations" ("pluginId", "migrationId", "tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_404_logs_path_tenant" ON "404_logs" ("path", "tenantId");

      -- Full-text search virtual table (not auto-created by Drizzle ORM)
      -- Keep an internal mirror keyed by _id so we don't depend on nonexistent title/content columns
      -- or SQLite rowid semantics for the text primary key.
      DROP TRIGGER IF EXISTS "content_nodes_ai";
      DROP TRIGGER IF EXISTS "content_nodes_ad";
      DROP TRIGGER IF EXISTS "content_nodes_au";
      DROP TABLE IF EXISTS "content_nodes_fts";
      CREATE VIRTUAL TABLE IF NOT EXISTS "content_nodes_fts" USING fts5(
        "_id" UNINDEXED,
        "name",
        "description",
        "data"
      );
      -- Triggers to keep FTS5 in sync
      CREATE TRIGGER IF NOT EXISTS "content_nodes_ai" AFTER INSERT ON "content_nodes" BEGIN
        INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
        VALUES (new._id, COALESCE(new.name, ''), COALESCE(new.description, ''), COALESCE(new.data, ''));
      END;
      CREATE TRIGGER IF NOT EXISTS "content_nodes_ad" AFTER DELETE ON "content_nodes" BEGIN
        DELETE FROM "content_nodes_fts" WHERE "_id" = old._id;
      END;
      CREATE TRIGGER IF NOT EXISTS "content_nodes_au" AFTER UPDATE ON "content_nodes" BEGIN
        DELETE FROM "content_nodes_fts" WHERE "_id" = old._id;
        INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
        VALUES (new._id, COALESCE(new.name, ''), COALESCE(new.description, ''), COALESCE(new.data, ''));
      END;
      INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
      SELECT "_id", COALESCE("name", ''), COALESCE("description", ''), COALESCE("data", '')
      FROM "content_nodes";
    `);

    // 🚀 MIGRATION: Add missing auth columns for upgraded databases (idempotent)
    execute(`ALTER TABLE "auth_users" ADD COLUMN "authenticators" TEXT`);
    execute(`ALTER TABLE "auth_users" ADD COLUMN "failedAttempts" INTEGER DEFAULT 0`);
    execute(`ALTER TABLE "auth_users" ADD COLUMN "lockoutUntil" INTEGER`);

    // 🚀 MIGRATION: Rename 'security' to 'password' if needed
    try {
      const tableInfo = (db as any).prepare
        ? (db as any).prepare('PRAGMA table_info("auth_users")').all()
        : [];
      const hasSecurity = tableInfo.some((c: any) => c.name === "security");
      const hasPassword = tableInfo.some((c: any) => c.name === "password");

      if (hasSecurity && !hasPassword) {
        logger.info("[SQLite] Migrating 'security' column to 'password' in auth_users...");
        execute('ALTER TABLE "auth_users" RENAME COLUMN "security" TO "password"');
      }
    } catch {
      // Ignore
    }

    logger.info("SQLite migrations completed successfully.");
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("SQLite migration failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message,
      error: {
        code: "MIGRATION_FAILED",
        message,
        details: error,
      },
    };
  }
}
