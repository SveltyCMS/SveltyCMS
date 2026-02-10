/**
 * @file src/databases/postgresql/schema/index.ts
 * @description Drizzle schema definitions for PostgreSQL tables
 *
 * This file defines the relational schema for SveltyCMS using Drizzle ORM.
 * All tables include multi-tenant support via nullable tenantId columns.
 * Date fields are stored as TIMESTAMP and converted to ISODateString at boundaries.
 */

import { pgTable, varchar, text, timestamp, boolean, integer, json, index, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Helper for timestamps
const timestamps = {
	createdAt: timestamp('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp('updatedAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`)
};

// Helper for tenantId (nullable for multi-tenant support)
const tenantField = () => varchar('tenantId', { length: 36 });

// Auth Users Table
export const authUsers = pgTable(
	'auth_users',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		email: varchar('email', { length: 255 }).notNull(),
		username: varchar('username', { length: 255 }),
		password: varchar('password', { length: 255 }),
		emailVerified: boolean('emailVerified').notNull().default(false),
		blocked: boolean('blocked').notNull().default(false),
		firstName: varchar('firstName', { length: 255 }),
		lastName: varchar('lastName', { length: 255 }),
		avatar: text('avatar'),
		roleIds: json('roleIds').$type<string[]>().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		emailIdx: index('auth_users_email_idx').on(table.email),
		tenantIdx: index('auth_users_tenant_idx').on(table.tenantId),
		emailTenantUnique: unique('auth_users_email_tenant_unique').on(table.email, table.tenantId)
	})
);

// Auth Sessions Table
export const authSessions = pgTable(
	'auth_sessions',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		user_id: varchar('user_id', { length: 36 }).notNull(),
		expires: timestamp('expires').notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		userIdx: index('auth_sessions_user_idx').on(table.user_id),
		expiresIdx: index('auth_sessions_expires_idx').on(table.expires),
		tenantIdx: index('auth_sessions_tenant_idx').on(table.tenantId)
	})
);

// Auth Tokens Table
export const authTokens = pgTable(
	'auth_tokens',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		user_id: varchar('user_id', { length: 36 }).notNull(),
		email: varchar('email', { length: 255 }).notNull(),
		token: varchar('token', { length: 255 }).notNull(),
		type: varchar('type', { length: 50 }).notNull(),
		expires: timestamp('expires').notNull(),
		consumed: boolean('consumed').notNull().default(false),
		role: varchar('role', { length: 50 }),
		username: varchar('username', { length: 255 }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: index('auth_tokens_token_idx').on(table.token),
		userIdx: index('auth_tokens_user_idx').on(table.user_id),
		expiresIdx: index('auth_tokens_expires_idx').on(table.expires),
		tenantIdx: index('auth_tokens_tenant_idx').on(table.tenantId)
	})
);

// Roles Table
export const roles = pgTable(
	'roles',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar('name', { length: 255 }).notNull(),
		description: text('description'),
		permissions: json('permissions').$type<string[]>().notNull().default([]),
		isAdmin: boolean('isAdmin').notNull().default(false),
		icon: varchar('icon', { length: 100 }),
		color: varchar('color', { length: 50 }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('roles_name_idx').on(table.name),
		tenantIdx: index('roles_tenant_idx').on(table.tenantId)
	})
);

// Content Nodes Table (Pages/Collections)
export const contentNodes = pgTable(
	'content_nodes',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		path: varchar('path', { length: 500 }).notNull(),
		parentId: varchar('parentId', { length: 36 }),
		type: varchar('type', { length: 50 }).notNull(),
		status: varchar('status', { length: 50 }).notNull().default('draft'),
		title: varchar('title', { length: 500 }),
		slug: varchar('slug', { length: 500 }),
		data: json('data'),
		metadata: json('metadata'),
		order: integer('order').notNull().default(0),
		isPublished: boolean('isPublished').notNull().default(false),
		publishedAt: timestamp('publishedAt'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('content_nodes_path_unique').on(table.path),
		parentIdx: index('content_nodes_parent_idx').on(table.parentId),
		typeIdx: index('content_nodes_type_idx').on(table.type),
		statusIdx: index('content_nodes_status_idx').on(table.status),
		tenantIdx: index('content_nodes_tenant_idx').on(table.tenantId)
	})
);

// Content Drafts Table
export const contentDrafts = pgTable(
	'content_drafts',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		contentId: varchar('contentId', { length: 36 }).notNull(),
		data: json('data').notNull(),
		version: integer('version').notNull().default(1),
		status: varchar('status', { length: 50 }).notNull().default('draft'),
		authorId: varchar('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_drafts_content_idx').on(table.contentId),
		authorIdx: index('content_drafts_author_idx').on(table.authorId),
		statusIdx: index('content_drafts_status_idx').on(table.status),
		tenantIdx: index('content_drafts_tenant_idx').on(table.tenantId)
	})
);

// Content Revisions Table
export const contentRevisions = pgTable(
	'content_revisions',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		contentId: varchar('contentId', { length: 36 }).notNull(),
		data: json('data').notNull(),
		version: integer('version').notNull().default(1),
		commitMessage: text('commitMessage'),
		authorId: varchar('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_revisions_content_idx').on(table.contentId),
		versionIdx: index('content_revisions_version_idx').on(table.version),
		authorIdx: index('content_revisions_author_idx').on(table.authorId),
		tenantIdx: index('content_revisions_tenant_idx').on(table.tenantId)
	})
);

// Themes Table
export const themes = pgTable(
	'themes',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar('name', { length: 255 }).notNull(),
		path: varchar('path', { length: 500 }).notNull(),
		isActive: boolean('isActive').notNull().default(false),
		isDefault: boolean('isDefault').notNull().default(false),
		config: json('config').notNull(),
		previewImage: text('previewImage'),
		customCss: text('customCss'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('themes_name_idx').on(table.name),
		activeIdx: index('themes_active_idx').on(table.isActive),
		tenantIdx: index('themes_tenant_idx').on(table.tenantId)
	})
);

// Widgets Table
export const widgets = pgTable(
	'widgets',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar('name', { length: 255 }).notNull(),
		isActive: boolean('isActive').notNull().default(true),
		instances: json('instances').notNull().default({}),
		dependencies: json('dependencies').$type<string[]>().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: unique('widgets_name_unique').on(table.name),
		activeIdx: index('widgets_active_idx').on(table.isActive),
		tenantIdx: index('widgets_tenant_idx').on(table.tenantId)
	})
);

// Media Items Table
export const mediaItems = pgTable(
	'media_items',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		filename: varchar('filename', { length: 500 }).notNull(),
		originalFilename: varchar('originalFilename', { length: 500 }).notNull(),
		hash: varchar('hash', { length: 255 }).notNull(),
		path: varchar('path', { length: 1000 }).notNull(),
		size: integer('size').notNull(),
		mimeType: varchar('mimeType', { length: 255 }).notNull(),
		folderId: varchar('folderId', { length: 36 }),
		originalId: varchar('originalId', { length: 36 }),
		thumbnails: json('thumbnails').notNull().default({}),
		metadata: json('metadata').notNull().default({}),
		access: varchar('access', { length: 50 }).notNull().default('public'),
		createdBy: varchar('createdBy', { length: 36 }).notNull(),
		updatedBy: varchar('updatedBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		hashIdx: index('media_items_hash_idx').on(table.hash),
		folderIdx: index('media_items_folder_idx').on(table.folderId),
		createdByIdx: index('media_items_created_by_idx').on(table.createdBy),
		tenantIdx: index('media_items_tenant_idx').on(table.tenantId)
	})
);

// System Virtual Folders Table
export const systemVirtualFolders = pgTable(
	'system_virtual_folders',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar('name', { length: 500 }).notNull(),
		path: varchar('path', { length: 1000 }).notNull(),
		parentId: varchar('parentId', { length: 36 }),
		icon: varchar('icon', { length: 100 }),
		order: integer('order').notNull().default(0),
		type: varchar('type', { length: 50 }).notNull().default('folder'),
		metadata: json('metadata'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('system_virtual_folders_path_unique').on(table.path),
		parentIdx: index('system_virtual_folders_parent_idx').on(table.parentId),
		typeIdx: index('system_virtual_folders_type_idx').on(table.type),
		tenantIdx: index('system_virtual_folders_tenant_idx').on(table.tenantId)
	})
);

// System Preferences Table
export const systemPreferences = pgTable(
	'system_preferences',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		key: varchar('key', { length: 255 }).notNull(),
		value: json('value'),
		scope: varchar('scope', { length: 50 }).notNull().default('system'),
		userId: varchar('userId', { length: 36 }),
		visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		uniqueKeyTenant: uniqueIndex('system_preferences_key_tenant_unique').on(table.key, table.tenantId),
		keyIdx: index('system_preferences_key_idx').on(table.key),
		scopeIdx: index('system_preferences_scope_idx').on(table.scope),
		userIdx: index('system_preferences_user_idx').on(table.userId),
		tenantIdx: index('system_preferences_tenant_idx').on(table.tenantId)
	})
);

// Website Tokens Table
export const websiteTokens = pgTable(
	'website_tokens',
	{
		_id: varchar('_id', { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar('name', { length: 255 }).notNull(),
		token: varchar('token', { length: 255 }).notNull(),
		createdBy: varchar('createdBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: unique('website_tokens_token_unique').on(table.token),
		nameIdx: index('website_tokens_name_idx').on(table.name),
		tenantIdx: index('website_tokens_tenant_idx').on(table.tenantId)
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
	websiteTokens
};
