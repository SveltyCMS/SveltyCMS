/**
 * @file src/databases/sqlite/migrations.ts
 * @description Automatic schema migration for SQLite (Bun Native)
 *
 * Updates:
 * - Date fields are INTEGER to match Drizzle `timestamp_ms` mode.
 * - Defaults use (strftime('%s', 'now') * 1000) for ms timestamps.
 */

import { logger } from "@src/utils/logger";

export async function runMigrations(db: unknown): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info("Running SQLite migrations...");

    const execute = (sql: string) => {
      const d = db as {
        exec?: (sql: string) => void;
        query?: (sql: string) => { run: () => void };
        prepare?: (sql: string) => { run: () => void };
      };
      if (typeof d.exec === "function") {
        d.exec(sql);
      } else if (typeof d.query === "function") {
        d.query(sql).run();
      } else if (typeof d.prepare === "function") {
        d.prepare(sql).run();
      } else {
        throw new Error("No valid execution method found on SQLite database object");
      }
    };

    // Auth Users
    execute(`
			CREATE TABLE IF NOT EXISTS auth_users (
				_id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				username TEXT,
				password TEXT,
				emailVerified INTEGER DEFAULT 0,
				blocked INTEGER DEFAULT 0,
				firstName TEXT,
				lastName TEXT,
				avatar TEXT,
				roleIds TEXT DEFAULT '[]',
				role TEXT NOT NULL DEFAULT 'user',
				isAdmin INTEGER DEFAULT 0,
				isRegistered INTEGER DEFAULT 0,
				is2FAEnabled INTEGER DEFAULT 0,
				totpSecret TEXT,
				backupCodes TEXT,
				last2FAVerification INTEGER,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Helper to safely add columns
    const addColumn = (table: string, col: string, type: string) => {
      try {
        execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch {
        // Column already exists or table doesn't exist yet
      }
    };

    // 🚀 MIGRATION: Rename 'security' to 'password' if needed (v0.0.8 compatibility)
    try {
      // Check if 'security' exists in auth_users
      const tableInfo = (db as any).prepare
        ? (db as any).prepare("PRAGMA table_info(auth_users)").all()
        : [];
      const hasSecurity = tableInfo.some((c: any) => c.name === "security");
      const hasPassword = tableInfo.some((c: any) => c.name === "password");

      if (hasSecurity && !hasPassword) {
        logger.info("[SQLite] Migrating 'security' column to 'password' in auth_users...");
        execute("ALTER TABLE auth_users RENAME COLUMN security TO password");
      }
    } catch {
      // Ignore if table doesn't exist yet
    }

    addColumn("auth_users", "isRegistered", "INTEGER DEFAULT 0");
    addColumn("auth_users", "isAdmin", "INTEGER DEFAULT 0");
    addColumn("auth_users", "role", "TEXT NOT NULL DEFAULT 'user'");
    addColumn("auth_users", "is2FAEnabled", "INTEGER DEFAULT 0");
    addColumn("auth_users", "totpSecret", "TEXT");
    addColumn("auth_users", "backupCodes", "TEXT");
    addColumn("auth_users", "last2FAVerification", "INTEGER");

    // 🚀 MIGRATION: Ensure 'isDeleted' column exists in all dynamic collections
    try {
      const tables = (db as any).prepare
        ? (db as any)
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'",
            )
            .all()
        : [];
      for (const { name } of tables) {
        const tableInfo = (db as any).prepare(`PRAGMA table_info("${name}")`).all();
        if (!tableInfo.some((c: any) => c.name === "isDeleted")) {
          logger.info(`[SQLite] Adding missing 'isDeleted' column to ${name}...`);
          execute(`ALTER TABLE "${name}" ADD COLUMN isDeleted INTEGER DEFAULT 0`);
        }
      }
    } catch {
      // Ignore
    }

    // Auth Sessions
    execute(`
			CREATE TABLE IF NOT EXISTS auth_sessions (
				_id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				expires INTEGER NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Auth Tokens
    execute(`
			CREATE TABLE IF NOT EXISTS auth_tokens (
				_id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				email TEXT NOT NULL,
				token TEXT NOT NULL,
				type TEXT NOT NULL,
				expires INTEGER NOT NULL,
				consumed INTEGER DEFAULT 0,
				blocked INTEGER DEFAULT 0,
				isRegistered INTEGER DEFAULT 0,
				role TEXT,
				username TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Roles
    execute(`
			CREATE TABLE IF NOT EXISTS roles (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				permissions TEXT DEFAULT '[]',
				isAdmin INTEGER DEFAULT 0,
				icon TEXT,
				color TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Content Nodes
    execute(`
			CREATE TABLE IF NOT EXISTS content_nodes (
				_id TEXT PRIMARY KEY,
				path TEXT NOT NULL UNIQUE,
				parentId TEXT,
				nodeType TEXT NOT NULL,
				status TEXT DEFAULT 'draft',
				name TEXT,
				slug TEXT,
				icon TEXT,
				description TEXT,
				data TEXT,
				metadata TEXT,
				translations TEXT DEFAULT '[]',
				"order" INTEGER DEFAULT 0,
				isPublished INTEGER DEFAULT 0,
				publishedAt INTEGER,
				collectionDef TEXT,
				isDeleted INTEGER DEFAULT 0,
				deletedAt INTEGER,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    addColumn("content_nodes", "collectionDef", "TEXT");
    addColumn("content_nodes", "isDeleted", "INTEGER DEFAULT 0");
    addColumn("content_nodes", "deletedAt", "INTEGER");

    // Content Drafts
    execute(`
			CREATE TABLE IF NOT EXISTS content_drafts (
				_id TEXT PRIMARY KEY,
				contentId TEXT NOT NULL,
				data TEXT NOT NULL,
				version INTEGER DEFAULT 1,
				status TEXT DEFAULT 'draft',
				authorId TEXT NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Content Revisions
    execute(`
			CREATE TABLE IF NOT EXISTS content_revisions (
				_id TEXT PRIMARY KEY,
				contentId TEXT NOT NULL,
				data TEXT NOT NULL,
				version INTEGER DEFAULT 1,
				commitMessage TEXT,
				authorId TEXT NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Themes
    execute(`
			CREATE TABLE IF NOT EXISTS themes (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				path TEXT NOT NULL,
				isActive INTEGER DEFAULT 0,
				isDefault INTEGER DEFAULT 0,
				config TEXT NOT NULL,
				previewImage TEXT,
				customCss TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Widgets
    execute(`
			CREATE TABLE IF NOT EXISTS widgets (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				isActive INTEGER DEFAULT 1,
				instances TEXT DEFAULT '{}',
				dependencies TEXT DEFAULT '[]',
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Media Items
    execute(`
			CREATE TABLE IF NOT EXISTS media_items (
				_id TEXT PRIMARY KEY,
				filename TEXT NOT NULL,
				originalFilename TEXT NOT NULL,
				hash TEXT NOT NULL,
				path TEXT NOT NULL,
				size INTEGER NOT NULL,
				mimeType TEXT NOT NULL,
				folderId TEXT,
				originalId TEXT,
				thumbnails TEXT DEFAULT '{}',
				metadata TEXT DEFAULT '{}',
				access TEXT DEFAULT 'public',
				createdBy TEXT NOT NULL,
				updatedBy TEXT NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // System Virtual Folders
    execute(`
			CREATE TABLE IF NOT EXISTS system_virtual_folders (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				path TEXT NOT NULL UNIQUE,
				parentId TEXT,
				icon TEXT,
				"order" INTEGER DEFAULT 0,
				type TEXT DEFAULT 'folder',
				metadata TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // System Preferences
    execute(`
			CREATE TABLE IF NOT EXISTS system_preferences (
				_id TEXT PRIMARY KEY,
				key TEXT NOT NULL,
				value TEXT,
				category TEXT,
				scope TEXT DEFAULT 'system',
				userId TEXT,
				visibility TEXT DEFAULT 'private',
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Website Tokens
    execute(`
			CREATE TABLE IF NOT EXISTS website_tokens (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				token TEXT NOT NULL UNIQUE,
				permissions TEXT DEFAULT '[]',
				expiresAt INTEGER,
				createdBy TEXT NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    addColumn("website_tokens", "permissions", "TEXT DEFAULT '[]'");
    addColumn("website_tokens", "expiresAt", "INTEGER");

    // Plugin Pagespeed Results
    execute(`
			CREATE TABLE IF NOT EXISTS plugin_pagespeed_results (
				_id TEXT PRIMARY KEY,
				entryId TEXT NOT NULL,
				collectionId TEXT NOT NULL,
				tenantId TEXT,
				language TEXT DEFAULT 'en',
				device TEXT DEFAULT 'mobile',
				url TEXT NOT NULL,
				performanceScore INTEGER DEFAULT 0,
				fetchedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Plugin States
    execute(`
			CREATE TABLE IF NOT EXISTS plugin_states (
				_id TEXT PRIMARY KEY,
				pluginId TEXT NOT NULL,
				tenantId TEXT,
				enabled INTEGER DEFAULT 0,
				settings TEXT,
				updatedBy TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Plugin Migrations
    execute(`
			CREATE TABLE IF NOT EXISTS plugin_migrations (
				_id TEXT PRIMARY KEY,
				pluginId TEXT NOT NULL,
				migrationId TEXT NOT NULL,
				version INTEGER NOT NULL,
				tenantId TEXT,
				appliedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Audit Logs
    execute(`
			CREATE TABLE IF NOT EXISTS audit_logs (
				_id TEXT PRIMARY KEY,
				action TEXT NOT NULL,
				actorEmail TEXT,
				actorId TEXT,
				actorRole TEXT,
				correlationId TEXT,
				details TEXT DEFAULT '{}',
				errorDetails TEXT,
				eventType TEXT NOT NULL,
				ipAddress TEXT,
				result TEXT NOT NULL,
				sessionId TEXT,
				severity TEXT NOT NULL,
				targetId TEXT,
				targetType TEXT,
				timestamp TEXT NOT NULL,
				userAgent TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Svelty Jobs
    execute(`
			CREATE TABLE IF NOT EXISTS svelty_jobs (
				_id TEXT PRIMARY KEY,
				taskType TEXT NOT NULL,
				payload TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				attempts INTEGER DEFAULT 0,
				maxAttempts INTEGER DEFAULT 3,
				nextRunAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				lastError TEXT,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Tenants
    execute(`
			CREATE TABLE IF NOT EXISTS tenants (
				_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				ownerId TEXT NOT NULL,
				status TEXT DEFAULT 'active',
				plan TEXT DEFAULT 'free',
				quota TEXT DEFAULT '{}',
				usage TEXT DEFAULT '{}',
				settings TEXT DEFAULT '{}',
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // 404 Logs
    execute(`
			CREATE TABLE IF NOT EXISTS "404_logs" (
				_id TEXT PRIMARY KEY,
				path TEXT NOT NULL,
				tenantId TEXT,
				hits INTEGER DEFAULT 1,
				lastHit INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				metadata TEXT DEFAULT '{}',
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Workflow Definitions
    execute(`
			CREATE TABLE IF NOT EXISTS workflow_definitions (
				_id TEXT PRIMARY KEY,
				tenantId TEXT,
				collectionId TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT,
				states TEXT DEFAULT '[]',
				transitions TEXT DEFAULT '[]',
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Workflow Instances
    execute(`
			CREATE TABLE IF NOT EXISTS workflow_instances (
				_id TEXT PRIMARY KEY,
				tenantId TEXT,
				entryId TEXT NOT NULL,
				collectionId TEXT NOT NULL,
				currentState TEXT NOT NULL,
				history TEXT DEFAULT '[]',
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Redirects MV
    execute(`
			CREATE TABLE IF NOT EXISTS redirects_mv (
				_id TEXT PRIMARY KEY,
				tenantId TEXT,
				"from" TEXT NOT NULL,
				"to" TEXT NOT NULL,
				type INTEGER DEFAULT 301,
				isRegex INTEGER DEFAULT 0,
				active INTEGER DEFAULT 1,
				metadata TEXT DEFAULT '{}',
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

    // Dynamic collections placeholders to avoid errors during bootstrap
    execute(`
			CREATE TABLE IF NOT EXISTS collection_redirects (
				_id TEXT PRIMARY KEY,
				tenantId TEXT,
				data TEXT NOT NULL DEFAULT '{}',
				status TEXT NOT NULL DEFAULT 'draft',
				isDeleted INTEGER NOT NULL DEFAULT 0,
				createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
			);
		`);

    execute(`
			CREATE TABLE IF NOT EXISTS collection_404_logs (
				_id TEXT PRIMARY KEY,
				tenantId TEXT,
				data TEXT NOT NULL DEFAULT '{}',
				status TEXT NOT NULL DEFAULT 'draft',
				isDeleted INTEGER NOT NULL DEFAULT 0,
				createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
			);
		`);

    logger.info("SQLite migrations completed successfully.");
    return { success: true };
  } catch (error) {
    logger.error("SQLite migration failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
