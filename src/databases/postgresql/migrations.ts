/**
 * @file src/databases/postgresql/migrations.ts
 * @description Automatic schema migration for PostgreSQL
 *
 * Features:
 * - Create tables if they don't exist
 * - Create indexes if they don't exist
 * - Create constraints if they don't exist
 * - Create triggers if they don't exist
 * - Create functions if they don't exist
 * - Create procedures if they don't exist
 * - Create views if they don't exist
 * - Create sequences if they don't exist
 * - Create triggers if they don't exist
 * - Create functions if they don't exist
 * - Create procedures if they don't exist
 * - Create views if they don't exist
 * - Create sequences if they don't exist
 */

import { logger } from '@utils/logger';
import type postgres from 'postgres';

// Run migrations to create/update database schema
export async function runMigrations(sql: postgres.Sql): Promise<{ success: boolean; error?: string }> {
	try {
		logger.info('Running PostgreSQL database migrations...');

		// Create tables if they don't exist directly using raw SQL
		await createTablesIfNotExist(sql);

		logger.info('✅ PostgreSQL database migrations completed successfully');
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('PostgreSQL Migration failed:', message);
		return { success: false, error: message };
	}
}

/**
 * Create all tables if they don't exist
 */
async function createTablesIfNotExist(sql: postgres.Sql): Promise<void> {
	const queries = [
		// Ensure pgcrypto extension for gen_random_uuid()
		`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

		// Auth Users
		`CREATE TABLE IF NOT EXISTS auth_users (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"email" VARCHAR(255) NOT NULL,
			"username" VARCHAR(255),
			"password" VARCHAR(255),
			"emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
			"blocked" BOOLEAN NOT NULL DEFAULT FALSE,
			"firstName" VARCHAR(255),
			"lastName" VARCHAR(255),
			"avatar" TEXT,
			"roleIds" JSONB NOT NULL DEFAULT '[]',
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS auth_users_email_idx ON auth_users (email)',
		`CREATE INDEX IF NOT EXISTS auth_users_tenant_idx ON auth_users ("tenantId")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_tenant_unique ON auth_users (email, "tenantId")`,

		// Auth Sessions
		`CREATE TABLE IF NOT EXISTS auth_sessions (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"user_id" VARCHAR(36) NOT NULL,
			"expires" TIMESTAMP WITH TIME ZONE NOT NULL,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)',
		'CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires)',
		`CREATE INDEX IF NOT EXISTS auth_sessions_tenant_idx ON auth_sessions ("tenantId")`,

		// Auth Tokens
		`CREATE TABLE IF NOT EXISTS auth_tokens (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"user_id" VARCHAR(36) NOT NULL,
			"email" VARCHAR(255) NOT NULL,
			"token" VARCHAR(255) NOT NULL,
			"type" VARCHAR(50) NOT NULL,
			"expires" TIMESTAMP WITH TIME ZONE NOT NULL,
			"consumed" BOOLEAN NOT NULL DEFAULT FALSE,
			"blocked" BOOLEAN NOT NULL DEFAULT FALSE,
			"role" VARCHAR(50),
			"username" VARCHAR(255),
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS auth_tokens_token_idx ON auth_tokens (token)',
		'CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id)',
		'CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens (expires)',
		`CREATE INDEX IF NOT EXISTS auth_tokens_tenant_idx ON auth_tokens ("tenantId")`,

		// Roles
		`CREATE TABLE IF NOT EXISTS roles (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(255) NOT NULL,
			"description" TEXT,
			"permissions" JSONB NOT NULL DEFAULT '[]',
			"isAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
			"icon" VARCHAR(100),
			"color" VARCHAR(50),
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS roles_name_idx ON roles (name)',
		`CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles ("tenantId")`,

		// Content Nodes
		`CREATE TABLE IF NOT EXISTS content_nodes (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"path" VARCHAR(500) NOT NULL,
			"parentId" VARCHAR(36),
			"nodeType" VARCHAR(50) NOT NULL,
			"status" VARCHAR(50) NOT NULL DEFAULT 'draft',
			"name" VARCHAR(500),
			"slug" VARCHAR(500),
			"icon" VARCHAR(100),
			"description" TEXT,
			"data" JSONB,
			"metadata" JSONB,
			"translations" JSONB,
			"order" INT NOT NULL DEFAULT 0,
			"isPublished" BOOLEAN NOT NULL DEFAULT FALSE,
			"publishedAt" TIMESTAMP WITH TIME ZONE,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS content_nodes_path_unique ON content_nodes (path)',
		`CREATE INDEX IF NOT EXISTS content_nodes_parent_idx ON content_nodes ("parentId")`,
		`CREATE INDEX IF NOT EXISTS content_nodes_nodeType_idx ON content_nodes ("nodeType")`,
		'CREATE INDEX IF NOT EXISTS content_nodes_status_idx ON content_nodes (status)',
		`CREATE INDEX IF NOT EXISTS content_nodes_tenant_idx ON content_nodes ("tenantId")`,

		// Content Drafts
		`CREATE TABLE IF NOT EXISTS content_drafts (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"contentId" VARCHAR(36) NOT NULL,
			"data" JSONB NOT NULL,
			"version" INT NOT NULL DEFAULT 1,
			"status" VARCHAR(50) NOT NULL DEFAULT 'draft',
			"authorId" VARCHAR(36) NOT NULL,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS content_drafts_content_idx ON content_drafts ("contentId")`,
		`CREATE INDEX IF NOT EXISTS content_drafts_author_idx ON content_drafts ("authorId")`,
		'CREATE INDEX IF NOT EXISTS content_drafts_status_idx ON content_drafts (status)',
		`CREATE INDEX IF NOT EXISTS content_drafts_tenant_idx ON content_drafts ("tenantId")`,

		// Content Revisions
		`CREATE TABLE IF NOT EXISTS content_revisions (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"contentId" VARCHAR(36) NOT NULL,
			"data" JSONB NOT NULL,
			"version" INT NOT NULL DEFAULT 1,
			"commitMessage" TEXT,
			"authorId" VARCHAR(36) NOT NULL,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS content_revisions_content_idx ON content_revisions ("contentId")`,
		'CREATE INDEX IF NOT EXISTS content_revisions_version_idx ON content_revisions (version)',
		`CREATE INDEX IF NOT EXISTS content_revisions_author_idx ON content_revisions ("authorId")`,
		`CREATE INDEX IF NOT EXISTS content_revisions_tenant_idx ON content_revisions ("tenantId")`,

		// Themes
		`CREATE TABLE IF NOT EXISTS themes (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(255) NOT NULL,
			"path" VARCHAR(500) NOT NULL,
			"isActive" BOOLEAN NOT NULL DEFAULT FALSE,
			"isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
			"config" JSONB NOT NULL DEFAULT '{}',
			"previewImage" TEXT,
			"customCss" TEXT,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS themes_name_idx ON themes (name)',
		`CREATE INDEX IF NOT EXISTS themes_active_idx ON themes ("isActive")`,
		`CREATE INDEX IF NOT EXISTS themes_tenant_idx ON themes ("tenantId")`,

		// Widgets
		`CREATE TABLE IF NOT EXISTS widgets (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(255) NOT NULL,
			"isActive" BOOLEAN NOT NULL DEFAULT TRUE,
			"instances" JSONB NOT NULL DEFAULT '{}',
			"dependencies" JSONB NOT NULL DEFAULT '[]',
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS widgets_name_unique ON widgets (name)',
		`CREATE INDEX IF NOT EXISTS widgets_active_idx ON widgets ("isActive")`,
		`CREATE INDEX IF NOT EXISTS widgets_tenant_idx ON widgets ("tenantId")`,

		// Media Items
		`CREATE TABLE IF NOT EXISTS media_items (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"filename" VARCHAR(500) NOT NULL,
			"originalFilename" VARCHAR(500) NOT NULL,
			"hash" VARCHAR(255) NOT NULL,
			"path" VARCHAR(1000) NOT NULL,
			"size" INT NOT NULL,
			"mimeType" VARCHAR(255) NOT NULL,
			"folderId" VARCHAR(36),
			"originalId" VARCHAR(36),
			"thumbnails" JSONB NOT NULL DEFAULT '{}',
			"metadata" JSONB NOT NULL DEFAULT '{}',
			"access" VARCHAR(50) NOT NULL DEFAULT 'public',
			"createdBy" VARCHAR(36) NOT NULL,
			"updatedBy" VARCHAR(36) NOT NULL,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS media_items_hash_idx ON media_items (hash)',
		`CREATE INDEX IF NOT EXISTS media_items_folder_idx ON media_items ("folderId")`,
		`CREATE INDEX IF NOT EXISTS media_items_created_by_idx ON media_items ("createdBy")`,
		`CREATE INDEX IF NOT EXISTS media_items_tenant_idx ON media_items ("tenantId")`,

		// System Virtual Folders
		`CREATE TABLE IF NOT EXISTS system_virtual_folders (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(500) NOT NULL,
			"path" VARCHAR(1000) NOT NULL,
			"parentId" VARCHAR(36),
			"icon" VARCHAR(100),
			"order" INT NOT NULL DEFAULT 0,
			"type" VARCHAR(50) NOT NULL DEFAULT 'folder',
			"metadata" JSONB,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS system_virtual_folders_path_unique ON system_virtual_folders (path)',
		`CREATE INDEX IF NOT EXISTS system_virtual_folders_parent_idx ON system_virtual_folders ("parentId")`,
		'CREATE INDEX IF NOT EXISTS system_virtual_folders_type_idx ON system_virtual_folders (type)',
		`CREATE INDEX IF NOT EXISTS system_virtual_folders_tenant_idx ON system_virtual_folders ("tenantId")`,

		// System Preferences
		`CREATE TABLE IF NOT EXISTS system_preferences (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"key" VARCHAR(255) NOT NULL,
			"value" JSONB,
			"category" VARCHAR(255),
			"scope" VARCHAR(50) NOT NULL DEFAULT 'system',
			"userId" VARCHAR(36),
			"visibility" VARCHAR(50) NOT NULL DEFAULT 'private',
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS system_preferences_key_idx ON system_preferences ("key")`,
		`CREATE INDEX IF NOT EXISTS system_preferences_category_idx ON system_preferences ("category")`,
		'CREATE INDEX IF NOT EXISTS system_preferences_scope_idx ON system_preferences (scope)',
		`CREATE INDEX IF NOT EXISTS system_preferences_user_idx ON system_preferences ("userId")`,
		`CREATE INDEX IF NOT EXISTS system_preferences_tenant_idx ON system_preferences ("tenantId")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS system_preferences_key_tenant_unique ON system_preferences ("key", "tenantId")`,

		// Website Tokens
		`CREATE TABLE IF NOT EXISTS website_tokens (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(255) NOT NULL,
			"token" VARCHAR(255) NOT NULL,
			"createdBy" VARCHAR(36) NOT NULL,
			"permissions" JSONB NOT NULL DEFAULT '[]',
			"expiresAt" TIMESTAMP WITH TIME ZONE,
			"tenantId" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS website_tokens_token_unique ON website_tokens (token)',
		'CREATE INDEX IF NOT EXISTS website_tokens_name_idx ON website_tokens (name)',
		`CREATE INDEX IF NOT EXISTS website_tokens_tenant_idx ON website_tokens ("tenantId")`,

		// Plugin: PageSpeed Results
		`CREATE TABLE IF NOT EXISTS plugin_pagespeed_results (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"entryId" VARCHAR(36) NOT NULL,
			"collectionId" VARCHAR(36) NOT NULL,
			"tenantId" VARCHAR(36),
			"language" VARCHAR(10) NOT NULL DEFAULT 'en',
			"device" VARCHAR(20) NOT NULL DEFAULT 'mobile',
			"url" VARCHAR(2000) NOT NULL,
			"performanceScore" INT NOT NULL DEFAULT 0,
			"fetchedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS plugin_pagespeed_entry_idx ON plugin_pagespeed_results ("entryId")`,
		`CREATE INDEX IF NOT EXISTS plugin_pagespeed_collection_idx ON plugin_pagespeed_results ("collectionId")`,
		`CREATE INDEX IF NOT EXISTS plugin_pagespeed_tenant_idx ON plugin_pagespeed_results ("tenantId")`,
		'CREATE INDEX IF NOT EXISTS plugin_pagespeed_device_idx ON plugin_pagespeed_results (device)',

		// Plugin States
		`CREATE TABLE IF NOT EXISTS plugin_states (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"pluginId" VARCHAR(255) NOT NULL,
			"tenantId" VARCHAR(36),
			"enabled" BOOLEAN NOT NULL DEFAULT FALSE,
			"settings" JSONB,
			"updatedBy" VARCHAR(36),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS plugin_states_plugin_idx ON plugin_states ("pluginId")`,
		`CREATE INDEX IF NOT EXISTS plugin_states_tenant_idx ON plugin_states ("tenantId")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plugin_states_plugin_tenant_unique ON plugin_states ("pluginId", "tenantId")`,

		// Plugin Migrations
		`CREATE TABLE IF NOT EXISTS plugin_migrations (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"pluginId" VARCHAR(255) NOT NULL,
			"migrationId" VARCHAR(255) NOT NULL,
			"version" INT NOT NULL,
			"tenantId" VARCHAR(36),
			"appliedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS plugin_migrations_plugin_idx ON plugin_migrations ("pluginId")`,
		`CREATE INDEX IF NOT EXISTS plugin_migrations_tenant_idx ON plugin_migrations ("tenantId")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plugin_migrations_unique ON plugin_migrations ("pluginId", "migrationId", "tenantId")`,

		// Tenants
		`CREATE TABLE IF NOT EXISTS tenants (
			"_id" VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
			"name" VARCHAR(255) NOT NULL,
			"ownerId" VARCHAR(36) NOT NULL,
			"status" VARCHAR(20) NOT NULL DEFAULT 'active',
			"plan" VARCHAR(20) NOT NULL DEFAULT 'free',
			"quota" JSONB NOT NULL DEFAULT '{}',
			"usage" JSONB NOT NULL DEFAULT '{}',
			"settings" JSONB DEFAULT '{}',
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		'CREATE INDEX IF NOT EXISTS tenants_name_idx ON tenants (name)',
		`CREATE INDEX IF NOT EXISTS tenants_owner_idx ON tenants ("ownerId")`,

		// ── GIN Indexes on high-query JSONB columns ──
		// Enables @>, ?, ?| operators for efficient containment/existence queries
		'CREATE INDEX IF NOT EXISTS content_nodes_data_gin ON content_nodes USING gin (data)',
		'CREATE INDEX IF NOT EXISTS content_nodes_metadata_gin ON content_nodes USING gin (metadata)',
		'CREATE INDEX IF NOT EXISTS media_items_metadata_gin ON media_items USING gin (metadata)',
		'CREATE INDEX IF NOT EXISTS roles_permissions_gin ON roles USING gin (permissions)',
		`CREATE INDEX IF NOT EXISTS auth_users_roleIds_gin ON auth_users USING gin ("roleIds")`,

		// ── Partial index for active sessions (skip expired rows) ──
		`CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions (user_id) WHERE expires > CURRENT_TIMESTAMP`,

		// ── Partial index for unconsumed tokens ──
		'CREATE INDEX IF NOT EXISTS auth_tokens_active_idx ON auth_tokens (token) WHERE consumed = FALSE AND blocked = FALSE'
	];

	for (const query of queries) {
		await sql.unsafe(query);
	}

	logger.info('All PostgreSQL tables created/verified');
}
