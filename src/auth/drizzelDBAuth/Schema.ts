/**
 * @file src/auth/drizzelDBAuth/Schema.ts
 * @description Drizzle ORM schema definitions for authentication-related tables.
 *
 * This module defines the database schema for:
 * - Users
 * - Roles
 * - Permissions
 * - Sessions
 * - Tokens
 *
 * Features:
 * - Table definitions using Drizzle ORM syntax
 * - Relationships between tables
 * - Index definitions for optimized queries
 *
 * Usage:
 * Imported by the Drizzle auth adapter to create and interact with the database schema
 */

import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Define the Users table
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	password: text('password'),
	role: text('role').notNull(),
	username: text('username'),
	firstName: text('first_name'),
	lastName: text('last_name'),
	locale: text('locale'),
	avatar: text('avatar'),
	lastAuthMethod: text('last_auth_method'),
	lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }),
	isRegistered: integer('is_registered', { mode: 'boolean' }),
	failedAttempts: integer('failed_attempts').default(0),
	blocked: integer('blocked', { mode: 'boolean' }).default(false),
	resetRequestedAt: integer('reset_requested_at', { mode: 'timestamp' }),
	resetToken: text('reset_token'),
	lockoutUntil: integer('lockout_until', { mode: 'timestamp' }),
	is2FAEnabled: integer('is_2fa_enabled', { mode: 'boolean' }).default(false),
	totpSecret: text('totp_secret'),
	backupCodes: text('backup_codes'), // JSON array of hashed backup codes
	last2FAVerification: integer('last_2fa_verification', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the Roles table
export const roles = sqliteTable('roles', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	description: text('description'),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the Permissions table
export const permissions = sqliteTable('permissions', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	action: text('action').notNull(),
	contextId: text('context_id').notNull(),
	contextType: text('context_type').notNull(),
	description: text('description'),
	requiredRole: text('required_role').notNull(),
	requires2FA: integer('requires_2fa', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the RolePermissions junction table
export const rolePermissions = sqliteTable(
	'role_permissions',
	{
		roleId: text('role_id')
			.notNull()
			.references(() => roles.id),
		permissionId: text('permission_id')
			.notNull()
			.references(() => permissions.id),
		createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => ({
		pk: primaryKey(table.roleId, table.permissionId) // Composite primary key for role-permission mapping
	})
);

// Define the Sessions table
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	expires: integer('expires', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Define the Tokens table
export const tokens = sqliteTable('tokens', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	token: text('token').notNull(),
	type: text('type').notNull(),
	expires: integer('expires', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

// Create indexes for optimizing queries
export const indexes = {
	userIndex: index(users, ['email']),
	roleIndex: index(roles, ['name']),
	permissionIndex: index(permissions, ['name']),
	sessionUserIdIndex: index(sessions, ['userId']),
	tokenUserIdIndex: index(tokens, ['userId'])
};
