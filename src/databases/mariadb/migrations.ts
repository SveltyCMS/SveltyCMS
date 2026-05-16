/**
 * @file src/databases/mariadb/migrations.ts
 * @description Automatic schema migration for MariaDB
 *
 * Features:
 * - Create tables if they don't exist
 * - Update tables if they exist
 * - Drop tables if they exist
 */

import { logger } from "@utils/logger";
import type mysql from "mysql2/promise";

// Run migrations to create/update database schema
export async function runMigrations(
  connection: mysql.Pool,
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info("Running database migrations...");

    // For initial setup, we'll create tables directly using Drizzle's push
    // This is simpler than maintaining migration files
    // In production, you would use: await migrate(db, { migrationsFolder: './src/databases/mariadb/migrations' });

    // Create tables if they don't exist
    await createTablesIfNotExist(connection);

    logger.info("✅ Database migrations completed successfully");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Migration failed:", message);
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
			isAdmin BOOLEAN NOT NULL DEFAULT FALSE,
			firstName VARCHAR(255),
			lastName VARCHAR(255),
			avatar TEXT,
			roleIds JSON NOT NULL,
			role VARCHAR(50) NOT NULL DEFAULT 'user',
			isRegistered BOOLEAN NOT NULL DEFAULT FALSE,
			is2FAEnabled BOOLEAN NOT NULL DEFAULT FALSE,
			totpSecret VARCHAR(255),
			backupCodes JSON,
			last2FAVerification DATETIME,
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
			collectionDef JSON,
			data JSON,
			metadata JSON,
			translations JSON,
			\`order\` INT NOT NULL DEFAULT 0,
			isPublished BOOLEAN NOT NULL DEFAULT FALSE,
			publishedAt DATETIME,
			source VARCHAR(50) NOT NULL DEFAULT 'filesystem',
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
			category VARCHAR(255),
			scope VARCHAR(50) NOT NULL DEFAULT 'system',
			userId VARCHAR(36),
			visibility VARCHAR(50) NOT NULL DEFAULT 'private',
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX key_idx (\`key\`),
			INDEX category_idx (category),
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
			permissions JSON NOT NULL,
			expiresAt DATETIME,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE INDEX token_unique (token),
			INDEX name_idx (name),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Tenants
    `CREATE TABLE IF NOT EXISTS tenants (
			_id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			ownerId VARCHAR(36) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			plan VARCHAR(20) NOT NULL DEFAULT 'free',
			quota JSON NOT NULL,
			\`usage\` JSON NOT NULL,
			settings JSON,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX tenant_name_idx (name),
			INDEX tenant_owner_idx (ownerId)
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
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Audit Logs
    `CREATE TABLE IF NOT EXISTS audit_logs (
			_id VARCHAR(36) PRIMARY KEY,
			action VARCHAR(255) NOT NULL,
			actorEmail VARCHAR(255),
			actorId VARCHAR(36),
			actorRole VARCHAR(50),
			correlationId VARCHAR(36),
			details JSON NOT NULL,
			errorDetails TEXT,
			eventType VARCHAR(100) NOT NULL,
			ipAddress VARCHAR(45),
			result VARCHAR(50) NOT NULL,
			sessionId VARCHAR(36),
			severity VARCHAR(20) NOT NULL,
			targetId VARCHAR(255),
			targetType VARCHAR(100),
			timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			userAgent TEXT,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX timestamp_idx (timestamp),
			INDEX event_type_idx (eventType),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Svelty Jobs
    `CREATE TABLE IF NOT EXISTS svelty_jobs (
			_id VARCHAR(36) PRIMARY KEY,
			taskType VARCHAR(255) NOT NULL,
			payload JSON NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'pending',
			attempts INT NOT NULL DEFAULT 0,
			maxAttempts INT NOT NULL DEFAULT 3,
			nextRunAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			lastError TEXT,
			tenantId VARCHAR(36),
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX status_idx (status),
			INDEX next_run_idx (nextRunAt),
			INDEX tenant_idx (tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 404 Logs
    `CREATE TABLE IF NOT EXISTS \`404_logs\` (
			_id VARCHAR(36) PRIMARY KEY,
			path VARCHAR(500) NOT NULL,
			tenantId VARCHAR(36) NOT NULL,
			hits INT NOT NULL DEFAULT 1,
			lastHit DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			metadata JSON NOT NULL,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX path_tenant_idx (path, tenantId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Redirects MV
    `CREATE TABLE IF NOT EXISTS redirects_mv (
			_id VARCHAR(36) PRIMARY KEY,
			tenantId VARCHAR(36) NOT NULL,
			\`from\` VARCHAR(500) NOT NULL,
			\`to\` VARCHAR(2000) NOT NULL,
			type INT NOT NULL DEFAULT 301,
			isRegex BOOLEAN NOT NULL DEFAULT FALSE,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			metadata JSON NOT NULL,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX tenant_from_idx (tenantId, \`from\`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Workflow Definitions
    `CREATE TABLE IF NOT EXISTS workflow_definitions (
			_id VARCHAR(36) PRIMARY KEY,
			tenantId VARCHAR(36),
			collectionId VARCHAR(255) NOT NULL,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			states JSON NOT NULL,
			transitions JSON NOT NULL,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Workflow Instances
    `CREATE TABLE IF NOT EXISTS workflow_instances (
			_id VARCHAR(36) PRIMARY KEY,
			tenantId VARCHAR(36),
			entryId VARCHAR(36) NOT NULL,
			collectionId VARCHAR(255) NOT NULL,
			currentState VARCHAR(100) NOT NULL,
			history JSON NOT NULL,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX entry_idx (entryId, collectionId)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const query of queries) {
    await connection.query(query);
  }

  // Add isRegistered column if it doesn't exist (for existing databases)
  try {
    await connection.query(
      `ALTER TABLE auth_users ADD COLUMN isRegistered BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await connection.query(
      `ALTER TABLE auth_users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'`,
    );
    await connection.query(
      `ALTER TABLE auth_users ADD COLUMN is2FAEnabled BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await connection.query(`ALTER TABLE auth_users ADD COLUMN totpSecret VARCHAR(255)`);
    await connection.query(`ALTER TABLE auth_users ADD COLUMN backupCodes JSON`);
    await connection.query(`ALTER TABLE auth_users ADD COLUMN last2FAVerification DATETIME`);
    await connection.query(`ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS collectionDef JSON`);
    await connection.query(
      `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'filesystem'`,
    );

    // 🚀 MIGRATION: Rename 'security' to 'password' if needed (v0.0.8 compatibility)
    try {
      const [columns] = await connection.query("SHOW COLUMNS FROM auth_users LIKE 'security'");
      if (Array.isArray(columns) && columns.length > 0) {
        logger.info("[MariaDB] Migrating 'security' column to 'password' in auth_users...");
        await connection.query("ALTER TABLE auth_users CHANGE security password VARCHAR(255)");
      }
    } catch {
      // Ignore
    }
  } catch {
    // Column already exists or other error we can ignore
  }

  // 🚀 MIGRATION: Ensure 'isDeleted' column exists in all dynamic collections
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'collection_%'");
    if (Array.isArray(tables)) {
      for (const row of tables) {
        const tableName = Object.values(row as any)[0] as string;
        // MariaDB supports ADD COLUMN IF NOT EXISTS
        await connection.query(
          `ALTER TABLE \`${tableName}\` ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN NOT NULL DEFAULT FALSE`,
        );
      }
    }
  } catch {
    // Ignore
  }

  logger.info("All tables created/verified");
}
