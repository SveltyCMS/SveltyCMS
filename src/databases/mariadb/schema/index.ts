/**
 * @file src/databases/mariadb/schema/index.ts
 * @description Drizzle schema definitions for MariaDB tables
 * 
 * This file defines the relational schema for SveltyCMS using Drizzle ORM.
 * All tables include multi-tenant support via nullable tenantId columns.
 * Date fields are stored as DATETIME and converted to ISODateString at boundaries.
 */

import { mysqlTable, varchar, text, datetime, boolean, int, json, index, unique } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// Helper to create UUID primary key
const uuidPk = () => varchar('_id', { length: 36 }).primaryKey();

// Helper for timestamps
const timestamps = {
	createdAt: datetime('createdAt').notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedAt: datetime('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
};

// Helper for tenantId (nullable for multi-tenant support)
const tenantField = () => varchar('tenantId', { length: 36 });

/**
 * Auth Users Table
 */
export const authUsers = mysqlTable('auth_users', {
	_id: uuidPk(),
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
}, (table) => ({
	emailIdx: index('email_idx').on(table.email),
	tenantIdx: index('tenant_idx').on(table.tenantId),
	emailTenantUnique: unique('email_tenant_unique').on(table.email, table.tenantId)
}));

/**
 * Auth Sessions Table
 */
export const authSessions = mysqlTable('auth_sessions', {
	_id: uuidPk(),
	user_id: varchar('user_id', { length: 36 }).notNull(),
	expires: datetime('expires').notNull(),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	userIdx: index('user_idx').on(table.user_id),
	expiresIdx: index('expires_idx').on(table.expires),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Auth Tokens Table
 */
export const authTokens = mysqlTable('auth_tokens', {
	_id: uuidPk(),
	user_id: varchar('user_id', { length: 36 }).notNull(),
	email: varchar('email', { length: 255 }).notNull(),
	token: varchar('token', { length: 255 }).notNull(),
	type: varchar('type', { length: 50 }).notNull(),
	expires: datetime('expires').notNull(),
	consumed: boolean('consumed').notNull().default(false),
	blocked: boolean('blocked').notNull().default(false),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	tokenIdx: index('token_idx').on(table.token),
	userIdx: index('user_idx').on(table.user_id),
	expiresIdx: index('expires_idx').on(table.expires),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Roles Table
 */
export const roles = mysqlTable('roles', {
	_id: uuidPk(),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description'),
	permissions: json('permissions').$type<string[]>().notNull().default([]),
	isAdmin: boolean('isAdmin').notNull().default(false),
	icon: varchar('icon', { length: 100 }),
	color: varchar('color', { length: 50 }),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	nameIdx: index('name_idx').on(table.name),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Content Nodes Table (Pages/Collections)
 */
export const contentNodes = mysqlTable('content_nodes', {
	_id: uuidPk(),
	path: varchar('path', { length: 500 }).notNull(),
	parentId: varchar('parentId', { length: 36 }),
	type: varchar('type', { length: 50 }).notNull(),
	status: varchar('status', { length: 50 }).notNull().default('draft'),
	title: varchar('title', { length: 500 }),
	slug: varchar('slug', { length: 500 }),
	data: json('data'),
	metadata: json('metadata'),
	order: int('order').notNull().default(0),
	isPublished: boolean('isPublished').notNull().default(false),
	publishedAt: datetime('publishedAt'),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	pathIdx: unique('path_unique').on(table.path),
	parentIdx: index('parent_idx').on(table.parentId),
	typeIdx: index('type_idx').on(table.type),
	statusIdx: index('status_idx').on(table.status),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Content Drafts Table
 */
export const contentDrafts = mysqlTable('content_drafts', {
	_id: uuidPk(),
	contentId: varchar('contentId', { length: 36 }).notNull(),
	data: json('data').notNull(),
	version: int('version').notNull().default(1),
	status: varchar('status', { length: 50 }).notNull().default('draft'),
	authorId: varchar('authorId', { length: 36 }).notNull(),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	contentIdx: index('content_idx').on(table.contentId),
	authorIdx: index('author_idx').on(table.authorId),
	statusIdx: index('status_idx').on(table.status),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Content Revisions Table
 */
export const contentRevisions = mysqlTable('content_revisions', {
	_id: uuidPk(),
	contentId: varchar('contentId', { length: 36 }).notNull(),
	data: json('data').notNull(),
	version: int('version').notNull().default(1),
	commitMessage: text('commitMessage'),
	authorId: varchar('authorId', { length: 36 }).notNull(),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	contentIdx: index('content_idx').on(table.contentId),
	versionIdx: index('version_idx').on(table.version),
	authorIdx: index('author_idx').on(table.authorId),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Themes Table
 */
export const themes = mysqlTable('themes', {
	_id: uuidPk(),
	name: varchar('name', { length: 255 }).notNull(),
	path: varchar('path', { length: 500 }).notNull(),
	isActive: boolean('isActive').notNull().default(false),
	isDefault: boolean('isDefault').notNull().default(false),
	config: json('config').notNull(),
	previewImage: text('previewImage'),
	customCss: text('customCss'),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	nameIdx: index('name_idx').on(table.name),
	activeIdx: index('active_idx').on(table.isActive),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Widgets Table
 */
export const widgets = mysqlTable('widgets', {
	_id: uuidPk(),
	name: varchar('name', { length: 255 }).notNull(),
	isActive: boolean('isActive').notNull().default(true),
	instances: json('instances').notNull().default({}),
	dependencies: json('dependencies').$type<string[]>().notNull().default([]),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	nameIdx: unique('name_unique').on(table.name),
	activeIdx: index('active_idx').on(table.isActive),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Media Items Table
 */
export const mediaItems = mysqlTable('media_items', {
	_id: uuidPk(),
	filename: varchar('filename', { length: 500 }).notNull(),
	originalFilename: varchar('originalFilename', { length: 500 }).notNull(),
	hash: varchar('hash', { length: 255 }).notNull(),
	path: varchar('path', { length: 1000 }).notNull(),
	size: int('size').notNull(),
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
}, (table) => ({
	hashIdx: index('hash_idx').on(table.hash),
	folderIdx: index('folder_idx').on(table.folderId),
	createdByIdx: index('created_by_idx').on(table.createdBy),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * System Virtual Folders Table
 */
export const systemVirtualFolders = mysqlTable('system_virtual_folders', {
	_id: uuidPk(),
	name: varchar('name', { length: 500 }).notNull(),
	path: varchar('path', { length: 1000 }).notNull(),
	parentId: varchar('parentId', { length: 36 }),
	icon: varchar('icon', { length: 100 }),
	order: int('order').notNull().default(0),
	type: varchar('type', { length: 50 }).notNull().default('folder'),
	metadata: json('metadata'),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	pathIdx: unique('path_unique').on(table.path),
	parentIdx: index('parent_idx').on(table.parentId),
	typeIdx: index('type_idx').on(table.type),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * System Preferences Table
 */
export const systemPreferences = mysqlTable('system_preferences', {
	_id: uuidPk(),
	key: varchar('key', { length: 255 }).notNull(),
	value: json('value'),
	scope: varchar('scope', { length: 50 }).notNull().default('system'),
	userId: varchar('userId', { length: 36 }),
	visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
	tenantId: tenantField(),
	...timestamps
}, (table) => ({
	keyIdx: index('key_idx').on(table.key),
	scopeIdx: index('scope_idx').on(table.scope),
	userIdx: index('user_idx').on(table.userId),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

/**
 * Website Tokens Table
 */
export const websiteTokens = mysqlTable('website_tokens', {
	_id: uuidPk(),
	name: varchar('name', { length: 255 }).notNull(),
	token: varchar('token', { length: 255 }).notNull(),
	createdBy: varchar('createdBy', { length: 36 }).notNull(),
	tenantId: tenantField(),
	createdAt: datetime('createdAt').notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
	tokenIdx: unique('token_unique').on(table.token),
	nameIdx: index('name_idx').on(table.name),
	tenantIdx: index('tenant_idx').on(table.tenantId)
}));

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
