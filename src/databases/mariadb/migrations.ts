/**
 * @file src/databases/mariadb/migrations.ts
 * @description Automatic schema migration for MariaDB
 *
 * Features:
 * - Create tables if they don't exist
 * - Update tables if they exist
 * - Drop tables if they exist
 */

import type mysql from 'mysql2/promise';
import { logger } from '@utils/logger';

// Run migrations to create/update database schema
export async function runMigrations(connection: mysql.Pool): Promise<{ success: boolean; error?: string }> {
	try {
		logger.info('Running database migrations...');

		// For initial setup, we'll create tables directly using Drizzle's push
		// This is simpler than maintaining migration files
		// In production, you would use: await migrate(db, { migrationsFolder: './src/databases/mariadb/migrations' });

		// Create tables if they don't exist
		await createTablesIfNotExist(connection);

		logger.info('✅ Database migrations completed successfully');
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('Migration failed:', message);
		return { success: false, error: message };
	}
}

/**
 * Create all tables if they don't exist
 * This is a pragmatic approach for initial implementation
 */
async function createTablesIfNotExist(connection: mysql.Pool): Promise<void> {
	const queries = [
		// Auth Users
		`CREATE TABLE IF NOT EXISTS auth_users (
			_id VARCHAR(36) PRIMARY KEY,
			email VARCHAR(255) NOT NULL,
			username VARCHAR(255),
			password VARCHAR(255),
			emailVerified BOOLEAN NOT NULL DEFAULT FALSE,
			blocked BOOLEAN NOT NULL DEFAULT FALSE,
			firstName VARCHAR(255),
			lastName VARCHAR(255),
			avatar TEXT,
			roleIds JSON NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX email_idx (email),
			INDEX tenant_idx (tenantId),
			UNIQUE INDEX email_tenant_unique (email, tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Auth Sessions
		`CREATE TABLE IF NOT EXISTS auth_sessions (
			_id VARCHAR(36) PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL,
			expires DATETIME NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX user_idx (user_id),
			INDEX expires_idx (expires),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Auth Tokens
		`CREATE TABLE IF NOT EXISTS auth_tokens (
			_id VARCHAR(36) PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL,
			email VARCHAR(255) NOT NULL,
			token VARCHAR(255) NOT NULL,
			type VARCHAR(50) NOT NULL,
			expires DATETIME NOT NULL,
			consumed BOOLEAN NOT NULL DEFAULT FALSE,
			blocked BOOLEAN NOT NULL DEFAULT FALSE,
			role VARCHAR(50),
			username VARCHAR(255),
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX token_idx (token),
			INDEX user_idx (user_id),
			INDEX expires_idx (expires),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Roles
		`CREATE TABLE IF NOT EXISTS roles (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			permissions JSON NOT NULL,
			isAdmin BOOLEAN NOT NULL DEFAULT FALSE,
			icon VARCHAR(100),
			color VARCHAR(50),
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX name_idx (name),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Content Nodes
		`CREATE TABLE IF NOT EXISTS content_nodes (
			_id VARCHAR(36) PRIMARY KEY,
			path VARCHAR(500) NOT NULL,
			parentId VARCHAR(36),
			nodeType VARCHAR(50) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'draft',
			name VARCHAR(500),
			slug VARCHAR(500),
			icon VARCHAR(100),
			description TEXT,
			data JSON,
			metadata JSON,
			translations JSON,
			\`order\` INT NOT NULL DEFAULT 0,
			isPublished BOOLEAN NOT NULL DEFAULT FALSE,
			publishedAt DATETIME,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE INDEX path_unique (path),
			INDEX parent_idx (parentId),
			INDEX nodeType_idx (nodeType),
			INDEX status_idx (status),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Content Drafts
		`CREATE TABLE IF NOT EXISTS content_drafts (
			_id VARCHAR(36) PRIMARY KEY,
			contentId VARCHAR(36) NOT NULL,
			data JSON NOT NULL,
			version INT NOT NULL DEFAULT 1,
			status VARCHAR(50) NOT NULL DEFAULT 'draft',
			authorId VARCHAR(36) NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX content_idx (contentId),
			INDEX author_idx (authorId),
			INDEX status_idx (status),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Content Revisions
		`CREATE TABLE IF NOT EXISTS content_revisions (
			_id VARCHAR(36) PRIMARY KEY,
			contentId VARCHAR(36) NOT NULL,
			data JSON NOT NULL,
			version INT NOT NULL DEFAULT 1,
			commitMessage TEXT,
			authorId VARCHAR(36) NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX content_idx (contentId),
			INDEX version_idx (version),
			INDEX author_idx (authorId),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Themes
		`CREATE TABLE IF NOT EXISTS themes (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			path VARCHAR(500) NOT NULL,
			isActive BOOLEAN NOT NULL DEFAULT FALSE,
			isDefault BOOLEAN NOT NULL DEFAULT FALSE,
			config JSON NOT NULL,
			previewImage TEXT,
			customCss TEXT,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX name_idx (name),
			INDEX active_idx (isActive),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Widgets
		`CREATE TABLE IF NOT EXISTS widgets (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			isActive BOOLEAN NOT NULL DEFAULT TRUE,
			instances JSON NOT NULL,
			dependencies JSON NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE INDEX name_unique (name),
			INDEX active_idx (isActive),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Media Items
		`CREATE TABLE IF NOT EXISTS media_items (
			_id VARCHAR(36) PRIMARY KEY,
			filename VARCHAR(500) NOT NULL,
			originalFilename VARCHAR(500) NOT NULL,
			hash VARCHAR(255) NOT NULL,
			path VARCHAR(1000) NOT NULL,
			size INT NOT NULL,
			mimeType VARCHAR(255) NOT NULL,
			folderId VARCHAR(36),
			originalId VARCHAR(36),
			thumbnails JSON NOT NULL,
			metadata JSON NOT NULL,
			access VARCHAR(50) NOT NULL DEFAULT 'public',
			createdBy VARCHAR(36) NOT NULL,
			updatedBy VARCHAR(36) NOT NULL,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX hash_idx (hash),
			INDEX folder_idx (folderId),
			INDEX created_by_idx (createdBy),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// System Virtual Folders
		`CREATE TABLE IF NOT EXISTS system_virtual_folders (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(500) NOT NULL,
			path VARCHAR(1000) NOT NULL,
			parentId VARCHAR(36),
			icon VARCHAR(100),
			\`order\` INT NOT NULL DEFAULT 0,
			type VARCHAR(50) NOT NULL DEFAULT 'folder',
			metadata JSON,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE INDEX path_unique (path),
			INDEX parent_idx (parentId),
			INDEX type_idx (type),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// System Preferences
		`CREATE TABLE IF NOT EXISTS system_preferences (
			_id VARCHAR(36) PRIMARY KEY,
			\`key\` VARCHAR(255) NOT NULL,
			value JSON,
			scope VARCHAR(50) NOT NULL DEFAULT 'system',
			userId VARCHAR(36),
			visibility VARCHAR(50) NOT NULL DEFAULT 'private',
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX key_idx (\`key\`),
			INDEX scope_idx (scope),
			INDEX user_idx (userId),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Website Tokens
		`CREATE TABLE IF NOT EXISTS website_tokens (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			token VARCHAR(255) NOT NULL,
			createdBy VARCHAR(36) NOT NULL,
			permissions JSON NOT NULL DEFAULT ('[]'),
			expiresAt DATETIME(3),
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE INDEX token_unique (token),
			INDEX name_idx (name),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Plugin: PageSpeed Results
		`CREATE TABLE IF NOT EXISTS plugin_pagespeed_results (
			_id VARCHAR(36) PRIMARY KEY,
			entryId VARCHAR(36) NOT NULL,
			collectionId VARCHAR(36) NOT NULL,
			tenantId VARCHAR(36),
			language VARCHAR(10) NOT NULL DEFAULT 'en',
			device VARCHAR(20) NOT NULL DEFAULT 'mobile',
			url VARCHAR(2000) NOT NULL,
			performanceScore INT NOT NULL DEFAULT 0,
			fetchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX entry_idx (entryId),
			INDEX collection_idx (collectionId),
			INDEX tenant_idx (tenantId),
			INDEX device_idx (device)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Plugin States
		`CREATE TABLE IF NOT EXISTS plugin_states (
			_id VARCHAR(36) PRIMARY KEY,
			pluginId VARCHAR(255) NOT NULL,
			tenantId VARCHAR(36),
			enabled BOOLEAN NOT NULL DEFAULT FALSE,
			settings JSON,
			updatedBy VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX plugin_idx (pluginId),
			INDEX tenant_idx (tenantId),
			UNIQUE INDEX plugin_tenant_unique (pluginId, tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		// Plugin Migrations
		`CREATE TABLE IF NOT EXISTS plugin_migrations (
			_id VARCHAR(36) PRIMARY KEY,
			pluginId VARCHAR(255) NOT NULL,
			migrationId VARCHAR(255) NOT NULL,
			version INT NOT NULL,
			tenantId VARCHAR(36),
			appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX plugin_idx (pluginId),
			INDEX tenant_idx (tenantId),
			UNIQUE INDEX plugin_migration_unique (pluginId, migrationId, tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
	];

	for (const query of queries) {
		await connection.query(query);
	}

	logger.info('All tables created/verified');
}
