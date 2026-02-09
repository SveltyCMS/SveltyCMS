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

import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Helper to create UUID primary key
const uuidPk = () => text('_id', { length: 36 }).primaryKey();

// Helper for timestamps
// Using timestamp_ms mode allows us to pass JS Date objects to insert/update
// and get JS Date objects back, which matches the behavior expected by shared modules.
const timestamps = {
	createdAt: integer('createdAt', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(strftime('%s', 'now') * 1000)`),
	updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(strftime('%s', 'now') * 1000)`)
};

// Helper for tenantId (nullable for multi-tenant support)
const tenantField = () => text('tenantId', { length: 36 });

// Auth Users Table
export const authUsers = sqliteTable(
	'auth_users',
	{
		_id: uuidPk(),
		email: text('email', { length: 255 }).notNull(),
		username: text('username', { length: 255 }),
		password: text('password', { length: 255 }),
		emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
		blocked: integer('blocked', { mode: 'boolean' }).notNull().default(false),
		firstName: text('firstName', { length: 255 }),
		lastName: text('lastName', { length: 255 }),
		avatar: text('avatar'),
		roleIds: text('roleIds', { mode: 'json' }).$type<string[]>().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		emailIdx: index('email_idx').on(table.email),
		tenantIdx: index('tenant_idx').on(table.tenantId),
		emailTenantUnique: unique('email_tenant_unique').on(table.email, table.tenantId)
	})
);

// Auth Sessions Table
export const authSessions = sqliteTable(
	'auth_sessions',
	{
		_id: uuidPk(),
		user_id: text('user_id', { length: 36 }).notNull(),
		expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		userIdx: index('user_idx').on(table.user_id),
		expiresIdx: index('expires_idx').on(table.expires),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Auth Tokens Table
export const authTokens = sqliteTable(
	'auth_tokens',
	{
		_id: uuidPk(),
		user_id: text('user_id', { length: 36 }).notNull(),
		email: text('email', { length: 255 }).notNull(),
		token: text('token', { length: 255 }).notNull(),
		type: text('type', { length: 50 }).notNull(),
		expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
		consumed: integer('consumed', { mode: 'boolean' }).notNull().default(false),
		role: text('role', { length: 50 }),
		username: text('username', { length: 255 }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: index('token_idx').on(table.token),
		userIdx: index('user_idx').on(table.user_id),
		expiresIdx: index('expires_idx').on(table.expires),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Roles Table
export const roles = sqliteTable(
	'roles',
	{
		_id: uuidPk(),
		name: text('name', { length: 255 }).notNull(),
		description: text('description'),
		permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull().default([]),
		isAdmin: integer('isAdmin', { mode: 'boolean' }).notNull().default(false),
		icon: text('icon', { length: 100 }),
		color: text('color', { length: 50 }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('name_idx').on(table.name),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Content Nodes Table (Pages/Collections)
export const contentNodes = sqliteTable(
	'content_nodes',
	{
		_id: uuidPk(),
		path: text('path', { length: 500 }).notNull(),
		parentId: text('parentId', { length: 36 }),
		nodeType: text('nodeType', { length: 50 }).notNull(),
		status: text('status', { length: 50 }).notNull().default('draft'),
		name: text('name', { length: 500 }),
		slug: text('slug', { length: 500 }),
		icon: text('icon', { length: 100 }),
		description: text('description'),
		data: text('data', { mode: 'json' }),
		metadata: text('metadata', { mode: 'json' }),
		translations: text('translations', { mode: 'json' }).$type<{ languageTag: string; translationName: string }[]>().default([]),
		order: integer('order').notNull().default(0),
		isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
		publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('path_unique').on(table.path),
		parentIdx: index('parent_idx').on(table.parentId),
		nodeTypeIdx: index('nodeType_idx').on(table.nodeType),
		statusIdx: index('status_idx').on(table.status),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Content Drafts Table
export const contentDrafts = sqliteTable(
	'content_drafts',
	{
		_id: uuidPk(),
		contentId: text('contentId', { length: 36 }).notNull(),
		data: text('data', { mode: 'json' }).notNull(),
		version: integer('version').notNull().default(1),
		status: text('status', { length: 50 }).notNull().default('draft'),
		authorId: text('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_idx').on(table.contentId),
		authorIdx: index('author_idx').on(table.authorId),
		statusIdx: index('status_idx').on(table.status),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Content Revisions Table
export const contentRevisions = sqliteTable(
	'content_revisions',
	{
		_id: uuidPk(),
		contentId: text('contentId', { length: 36 }).notNull(),
		data: text('data', { mode: 'json' }).notNull(),
		version: integer('version').notNull().default(1),
		commitMessage: text('commitMessage'),
		authorId: text('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_idx').on(table.contentId),
		versionIdx: index('version_idx').on(table.version),
		authorIdx: index('author_idx').on(table.authorId),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Themes Table
export const themes = sqliteTable(
	'themes',
	{
		_id: uuidPk(),
		name: text('name', { length: 255 }).notNull(),
		path: text('path', { length: 500 }).notNull(),
		isActive: integer('isActive', { mode: 'boolean' }).notNull().default(false),
		isDefault: integer('isDefault', { mode: 'boolean' }).notNull().default(false),
		config: text('config', { mode: 'json' }).notNull(),
		previewImage: text('previewImage'),
		customCss: text('customCss'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('name_idx').on(table.name),
		activeIdx: index('active_idx').on(table.isActive),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Widgets Table
export const widgets = sqliteTable(
	'widgets',
	{
		_id: uuidPk(),
		name: text('name', { length: 255 }).notNull(),
		isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
		instances: text('instances', { mode: 'json' }).notNull().default({}),
		dependencies: text('dependencies', { mode: 'json' }).$type<string[]>().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: unique('name_unique').on(table.name),
		activeIdx: index('active_idx').on(table.isActive),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Media Items Table
export const mediaItems = sqliteTable(
	'media_items',
	{
		_id: uuidPk(),
		filename: text('filename', { length: 500 }).notNull(),
		originalFilename: text('originalFilename', { length: 500 }).notNull(),
		hash: text('hash', { length: 255 }).notNull(),
		path: text('path', { length: 1000 }).notNull(),
		size: integer('size').notNull(),
		mimeType: text('mimeType', { length: 255 }).notNull(),
		folderId: text('folderId', { length: 36 }),
		originalId: text('originalId', { length: 36 }),
		thumbnails: text('thumbnails', { mode: 'json' }).notNull().default({}),
		metadata: text('metadata', { mode: 'json' }).notNull().default({}),
		access: text('access', { length: 50 }).notNull().default('public'),
		createdBy: text('createdBy', { length: 36 }).notNull(),
		updatedBy: text('updatedBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		hashIdx: index('hash_idx').on(table.hash),
		folderIdx: index('folder_idx').on(table.folderId),
		createdByIdx: index('created_by_idx').on(table.createdBy),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// System Virtual Folders Table
export const systemVirtualFolders = sqliteTable(
	'system_virtual_folders',
	{
		_id: uuidPk(),
		name: text('name', { length: 500 }).notNull(),
		path: text('path', { length: 1000 }).notNull(),
		parentId: text('parentId', { length: 36 }),
		icon: text('icon', { length: 100 }),
		order: integer('order').notNull().default(0),
		type: text('type', { length: 50 }).notNull().default('folder'),
		metadata: text('metadata', { mode: 'json' }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('path_unique').on(table.path),
		parentIdx: index('parent_idx').on(table.parentId),
		typeIdx: index('type_idx').on(table.type),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// System Preferences Table
export const systemPreferences = sqliteTable(
	'system_preferences',
	{
		_id: uuidPk(),
		key: text('key', { length: 255 }).notNull(),
		value: text('value', { mode: 'json' }),
		scope: text('scope', { length: 50 }).notNull().default('system'),
		userId: text('userId', { length: 36 }),
		visibility: text('visibility', { length: 50 }).notNull().default('private'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		keyIdx: index('key_idx').on(table.key),
		scopeIdx: index('scope_idx').on(table.scope),
		userIdx: index('user_idx').on(table.userId),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Website Tokens Table
export const websiteTokens = sqliteTable(
	'website_tokens',
	{
		_id: uuidPk(),
		name: text('name', { length: 255 }).notNull(),
		token: text('token', { length: 255 }).notNull(),
		createdBy: text('createdBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: unique('token_unique').on(table.token),
		nameIdx: index('name_idx').on(table.name),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);

// Plugin: PageSpeed Results Table
export const pluginPagespeedResults = sqliteTable(
	'plugin_pagespeed_results',
	{
		_id: uuidPk(),
		entryId: text('entryId', { length: 36 }).notNull(),
		collectionId: text('collectionId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		language: text('language', { length: 10 }).notNull().default('en'),
		device: text('device', { length: 20 }).notNull().default('mobile'),
		url: text('url', { length: 2000 }).notNull(),
		performanceScore: integer('performanceScore').notNull().default(0),
		fetchedAt: integer('fetchedAt', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(strftime('%s', 'now') * 1000)`),
		...timestamps
	},
	(table) => ({
		entryIdx: index('entry_idx').on(table.entryId),
		collectionIdx: index('collection_idx').on(table.collectionId),
		tenantIdx: index('tenant_idx').on(table.tenantId),
		deviceIdx: index('device_idx').on(table.device)
	})
);

// Plugin States Table
export const pluginStates = sqliteTable(
	'plugin_states',
	{
		_id: uuidPk(),
		pluginId: text('pluginId', { length: 255 }).notNull(),
		tenantId: tenantField(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
		settings: text('settings', { mode: 'json' }),
		updatedBy: text('updatedBy', { length: 36 }),
		...timestamps
	},
	(table) => ({
		pluginIdx: index('plugin_idx').on(table.pluginId),
		tenantIdx: index('tenant_idx').on(table.tenantId),
		pluginTenantUnique: unique('plugin_tenant_unique').on(table.pluginId, table.tenantId)
	})
);

// Plugin Migrations Table
export const pluginMigrations = sqliteTable(
	'plugin_migrations',
	{
		_id: uuidPk(),
		pluginId: text('pluginId', { length: 255 }).notNull(),
		migrationId: text('migrationId', { length: 255 }).notNull(),
		version: integer('version').notNull(),
		tenantId: tenantField(),
		appliedAt: integer('appliedAt', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(strftime('%s', 'now') * 1000)`),
		...timestamps
	},
	(table) => ({
		pluginIdx: index('plugin_idx').on(table.pluginId),
		tenantIdx: index('tenant_idx').on(table.tenantId),
		pluginMigrationUnique: unique('plugin_migration_unique').on(table.pluginId, table.migrationId, table.tenantId)
	})
);

// Export all tables as a schema object for Drizzle
export const schema = {
	authUsers,
	authSessions,
	authTokens,
	roles,
	contentNodes,
	contentDrafts,
	contentRevisions,
	themes,
	widgets,
	mediaItems,
	systemVirtualFolders,
	systemPreferences,
	websiteTokens,
	pluginPagespeedResults,
	pluginStates,
	pluginMigrations
};
