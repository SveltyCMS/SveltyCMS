/**
 * @file src/databases/sqlite/migrations.ts
 * @description Automatic schema migration for SQLite (Bun Native)
 *
 * Updates:
 * - Date fields are INTEGER to match Drizzle `timestamp_ms` mode.
 * - Defaults use (strftime('%s', 'now') * 1000) for ms timestamps.
 */

import { logger } from '@src/utils/logger';

export async function runMigrations(db: any): Promise<{ success: boolean; error?: string }> {
	try {
		logger.info('Running SQLite migrations...');

		const execute = (sql: string) => {
			if (typeof db.exec === 'function') {
				db.exec(sql);
			} else if (typeof db.query === 'function') {
				db.query(sql).run();
			} else if (typeof db.prepare === 'function') {
				db.prepare(sql).run();
			} else {
				throw new Error('No valid execution method found on SQLite database object');
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
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

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
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

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
				createdBy TEXT NOT NULL,
				tenantId TEXT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
				updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
			)
		`);

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

		logger.info('SQLite migrations completed successfully.');
		return { success: true };
	} catch (error) {
		logger.error('SQLite migration failed:', error);
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}
