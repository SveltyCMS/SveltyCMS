CREATE TABLE `audit_logs` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`actorEmail` text,
	`actorId` text,
	`actorRole` text,
	`correlationId` text,
	`details` text DEFAULT '{}' NOT NULL,
	`errorDetails` text,
	`eventType` text NOT NULL,
	`ipAddress` text,
	`result` text NOT NULL,
	`sessionId` text,
	`severity` text NOT NULL,
	`targetId` text,
	`targetType` text,
	`timestamp` integer NOT NULL,
	`userAgent` text,
	`tenantId` text(36),
	`previousHash` text,
	`chainHash` text,
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorId`);--> statement-breakpoint
CREATE INDEX `audit_logs_type_idx` ON `audit_logs` (`eventType`);--> statement-breakpoint
CREATE INDEX `audit_tenant_idx` ON `audit_logs` (`tenantId`);--> statement-breakpoint
CREATE TABLE `auth_api_keys` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`hash` text(255) NOT NULL,
	`prefix` text(12) NOT NULL,
	`userId` text(36) NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`usageCount` integer DEFAULT 0 NOT NULL,
	`lastUsedAt` integer,
	`lastUsedIp` text,
	`expiresAt` integer,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_keys_user_idx` ON `auth_api_keys` (`userId`);--> statement-breakpoint
CREATE INDEX `api_key_tenant_idx` ON `auth_api_keys` (`tenantId`);--> statement-breakpoint
CREATE INDEX `api_keys_tenant_hash_idx` ON `auth_api_keys` (`tenantId`,`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_unique` ON `auth_api_keys` (`hash`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`expires` integer NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_idx` ON `auth_sessions` (`expires`);--> statement-breakpoint
CREATE INDEX `auth_sessions_tenant_idx` ON `auth_sessions` (`tenantId`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`email` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`type` text(50) NOT NULL,
	`expires` integer NOT NULL,
	`consumed` integer DEFAULT false NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`role` text(50),
	`username` text(255),
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_token_idx` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_tokens_expires_idx` ON `auth_tokens` (`expires`);--> statement-breakpoint
CREATE INDEX `auth_tokens_tenant_idx` ON `auth_tokens` (`tenantId`);--> statement-breakpoint
CREATE INDEX `auth_tokens_tenant_token_idx` ON `auth_tokens` (`tenantId`,`token`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`username` text(255),
	`password` text(255),
	`emailVerified` integer DEFAULT false NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`firstName` text(255),
	`lastName` text(255),
	`avatar` text,
	`roleIds` text DEFAULT '[]' NOT NULL,
	`role` text(50) DEFAULT 'user' NOT NULL,
	`isAdmin` integer DEFAULT false NOT NULL,
	`isRegistered` integer DEFAULT false NOT NULL,
	`is2FAEnabled` integer DEFAULT false NOT NULL,
	`totpSecret` text,
	`backupCodes` text,
	`last2FAVerification` integer,
	`authenticators` text,
	`failedAttempts` integer DEFAULT 0 NOT NULL,
	`lockoutUntil` integer,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_users_email_idx` ON `auth_users` (`email`);--> statement-breakpoint
CREATE INDEX `auth_users_tenant_idx` ON `auth_users` (`tenantId`);--> statement-breakpoint
CREATE INDEX `auth_users_tenant_email_idx` ON `auth_users` (`tenantId`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_tenant_unique` ON `auth_users` (`email`,`tenantId`);--> statement-breakpoint
CREATE TABLE `content_drafts` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`contentId` text(36) NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text(50) DEFAULT 'draft' NOT NULL,
	`authorId` text(36) NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_drafts_content_idx` ON `content_drafts` (`contentId`);--> statement-breakpoint
CREATE INDEX `content_drafts_author_idx` ON `content_drafts` (`authorId`);--> statement-breakpoint
CREATE INDEX `content_drafts_status_idx` ON `content_drafts` (`status`);--> statement-breakpoint
CREATE INDEX `content_drafts_tenant_idx` ON `content_drafts` (`tenantId`);--> statement-breakpoint
CREATE TABLE `content_nodes` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`path` text(500) NOT NULL,
	`parentId` text(36),
	`nodeType` text(50) NOT NULL,
	`status` text(50) DEFAULT 'draft' NOT NULL,
	`name` text(500),
	`slug` text(500),
	`icon` text(100),
	`description` text,
	`collectionDef` text,
	`data` text,
	`metadata` text,
	`translations` text DEFAULT '[]',
	`position` integer DEFAULT 0 NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` integer,
	`isDeleted` integer DEFAULT false NOT NULL,
	`deletedAt` integer,
	`source` text DEFAULT 'filesystem' NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_nodes_parent_idx` ON `content_nodes` (`parentId`);--> statement-breakpoint
CREATE INDEX `content_nodes_nodetype_idx` ON `content_nodes` (`nodeType`);--> statement-breakpoint
CREATE INDEX `content_nodes_status_idx` ON `content_nodes` (`status`);--> statement-breakpoint
CREATE INDEX `content_nodes_tenant_idx` ON `content_nodes` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_nodes_path_tenant_unique` ON `content_nodes` (`path`,`tenantId`);--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`contentId` text(36) NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`commitMessage` text,
	`authorId` text(36) NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_revisions_content_idx` ON `content_revisions` (`contentId`);--> statement-breakpoint
CREATE INDEX `content_revisions_version_idx` ON `content_revisions` (`version`);--> statement-breakpoint
CREATE INDEX `content_revisions_author_idx` ON `content_revisions` (`authorId`);--> statement-breakpoint
CREATE INDEX `content_revisions_tenant_idx` ON `content_revisions` (`tenantId`);--> statement-breakpoint
CREATE TABLE `404_logs` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`tenantId` text(36),
	`hits` integer DEFAULT 1 NOT NULL,
	`lastHit` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`metadata` text,
	`createdAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `four_oh_four_path_idx` ON `404_logs` (`path`);--> statement-breakpoint
CREATE INDEX `four_oh_four_tenant_idx` ON `404_logs` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_404_logs_path_tenant` ON `404_logs` (`path`,`tenantId`);--> statement-breakpoint
CREATE TABLE `media_items` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`filename` text(500) NOT NULL,
	`originalFilename` text(500) NOT NULL,
	`hash` text(255) NOT NULL,
	`path` text(1000) NOT NULL,
	`size` integer NOT NULL,
	`mimeType` text(255) NOT NULL,
	`folderId` text(36),
	`originalId` text(36),
	`thumbnails` text DEFAULT '{}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`access` text(50) DEFAULT 'public' NOT NULL,
	`createdBy` text(36) NOT NULL,
	`updatedBy` text(36) NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_items_hash_idx` ON `media_items` (`hash`);--> statement-breakpoint
CREATE INDEX `media_items_folder_idx` ON `media_items` (`folderId`);--> statement-breakpoint
CREATE INDEX `media_items_created_by_idx` ON `media_items` (`createdBy`);--> statement-breakpoint
CREATE INDEX `media_items_tenant_idx` ON `media_items` (`tenantId`);--> statement-breakpoint
CREATE TABLE `plugin_migrations` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`pluginId` text(255) NOT NULL,
	`migrationId` text(255) NOT NULL,
	`version` integer NOT NULL,
	`tenantId` text(36),
	`appliedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_migrations_plugin_idx` ON `plugin_migrations` (`pluginId`);--> statement-breakpoint
CREATE INDEX `plugin_migrations_tenant_idx` ON `plugin_migrations` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_migrations_unique` ON `plugin_migrations` (`pluginId`,`migrationId`,`tenantId`);--> statement-breakpoint
CREATE TABLE `plugin_pagespeed_results` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`entryId` text(36) NOT NULL,
	`collectionId` text(36) NOT NULL,
	`tenantId` text(36),
	`language` text(10) DEFAULT 'en' NOT NULL,
	`device` text(20) DEFAULT 'mobile' NOT NULL,
	`url` text(2000) NOT NULL,
	`performanceScore` integer DEFAULT 0 NOT NULL,
	`fetchedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pagespeed_entry_idx` ON `plugin_pagespeed_results` (`entryId`);--> statement-breakpoint
CREATE INDEX `pagespeed_collection_idx` ON `plugin_pagespeed_results` (`collectionId`);--> statement-breakpoint
CREATE INDEX `pagespeed_tenant_idx` ON `plugin_pagespeed_results` (`tenantId`);--> statement-breakpoint
CREATE INDEX `pagespeed_device_idx` ON `plugin_pagespeed_results` (`device`);--> statement-breakpoint
CREATE TABLE `plugin_states` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`pluginId` text(255) NOT NULL,
	`tenantId` text(36),
	`enabled` integer DEFAULT false NOT NULL,
	`settings` text,
	`updatedBy` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_states_plugin_idx` ON `plugin_states` (`pluginId`);--> statement-breakpoint
CREATE INDEX `plugin_states_tenant_idx` ON `plugin_states` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_states_tenant_unique` ON `plugin_states` (`pluginId`,`tenantId`);--> statement-breakpoint
CREATE TABLE `redirects_mv` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`tenantId` text(36) NOT NULL,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`type` integer DEFAULT 301 NOT NULL,
	`isRegex` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`metadata` text,
	`createdAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `redirects_mv_tenant_idx` ON `redirects_mv` (`tenantId`);--> statement-breakpoint
CREATE INDEX `redirects_mv_source_idx` ON `redirects_mv` (`source`);--> statement-breakpoint
CREATE TABLE `roles` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`isAdmin` integer DEFAULT false NOT NULL,
	`icon` text(100),
	`color` text(50),
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roles_name_idx` ON `roles` (`name`);--> statement-breakpoint
CREATE INDEX `roles_tenant_idx` ON `roles` (`tenantId`);--> statement-breakpoint
CREATE TABLE `svelty_jobs` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`taskType` text(255) NOT NULL,
	`payload` text NOT NULL,
	`status` text(50) DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 3 NOT NULL,
	`nextRunAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`lastError` text,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `svelty_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_next_run_idx` ON `svelty_jobs` (`nextRunAt`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_idx` ON `svelty_jobs` (`tenantId`);--> statement-breakpoint
CREATE TABLE `system_preferences` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`key` text(255) NOT NULL,
	`value` text,
	`scope` text(50) DEFAULT 'system' NOT NULL,
	`userId` text(36),
	`visibility` text(50) DEFAULT 'private' NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_prefs_key_idx` ON `system_preferences` (`key`);--> statement-breakpoint
CREATE INDEX `system_prefs_scope_idx` ON `system_preferences` (`scope`);--> statement-breakpoint
CREATE INDEX `system_prefs_user_idx` ON `system_preferences` (`userId`);--> statement-breakpoint
CREATE INDEX `system_prefs_tenant_idx` ON `system_preferences` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `system_prefs_key_tenant_unique` ON `system_preferences` (`key`,`tenantId`);--> statement-breakpoint
CREATE TABLE `system_virtual_folders` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(500) NOT NULL,
	`path` text(1000) NOT NULL,
	`parentId` text(36),
	`icon` text(100),
	`position` integer DEFAULT 0 NOT NULL,
	`type` text(50) DEFAULT 'folder' NOT NULL,
	`metadata` text,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_folders_parent_idx` ON `system_virtual_folders` (`parentId`);--> statement-breakpoint
CREATE INDEX `system_folders_type_idx` ON `system_virtual_folders` (`type`);--> statement-breakpoint
CREATE INDEX `system_folders_tenant_idx` ON `system_virtual_folders` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `system_folders_path_unique` ON `system_virtual_folders` (`path`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`ownerId` text(36) NOT NULL,
	`status` text(20) DEFAULT 'active' NOT NULL,
	`plan` text(20) DEFAULT 'free' NOT NULL,
	`quota` text DEFAULT '{"maxUsers":10,"maxStorageBytes":1073741824,"maxCollections":20,"maxApiRequestsPerMonth":10000}' NOT NULL,
	`usage` text DEFAULT '{"usersCount":0,"storageBytes":0,"collectionsCount":0,"apiRequestsMonth":0,"lastUpdated":"2026-07-03T09:11:46.679Z"}' NOT NULL,
	`settings` text DEFAULT '{}',
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tenants_tenant_name_idx` ON `tenants` (`name`);--> statement-breakpoint
CREATE INDEX `tenants_owner_idx` ON `tenants` (`ownerId`);--> statement-breakpoint
CREATE TABLE `themes` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`path` text(500) NOT NULL,
	`isActive` integer DEFAULT false NOT NULL,
	`isDefault` integer DEFAULT false NOT NULL,
	`config` text NOT NULL,
	`previewImage` text,
	`customCss` text,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `themes_active_idx` ON `themes` (`isActive`);--> statement-breakpoint
CREATE INDEX `themes_tenant_idx` ON `themes` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `themes_name_tenant_unique` ON `themes` (`name`,`tenantId`);--> statement-breakpoint
CREATE TABLE `website_tokens` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`expiresAt` integer,
	`createdBy` text(36) NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `website_tokens_name_idx` ON `website_tokens` (`name`);--> statement-breakpoint
CREATE INDEX `website_tokens_tenant_idx` ON `website_tokens` (`tenantId`);--> statement-breakpoint
CREATE INDEX `website_tokens_tenant_name_idx` ON `website_tokens` (`tenantId`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `website_tokens_token_unique` ON `website_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `widgets` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`instances` text DEFAULT '{}' NOT NULL,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`tenantId` text(36),
	`createdAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `widgets_active_idx` ON `widgets` (`isActive`);--> statement-breakpoint
CREATE INDEX `widgets_tenant_idx` ON `widgets` (`tenantId`);--> statement-breakpoint
CREATE UNIQUE INDEX `widgets_name_unique` ON `widgets` (`name`);--> statement-breakpoint
CREATE TABLE `workflow_definitions` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`tenantId` text(36),
	`collectionId` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`states` text DEFAULT '[]' NOT NULL,
	`transitions` text DEFAULT '[]' NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_def_tenant_idx` ON `workflow_definitions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `workflow_def_collection_idx` ON `workflow_definitions` (`collectionId`);--> statement-breakpoint
CREATE TABLE `workflow_instances` (
	`_id` text(36) PRIMARY KEY NOT NULL,
	`tenantId` text(36),
	`entryId` text(36) NOT NULL,
	`collectionId` text(255) NOT NULL,
	`currentState` text(255) NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	`createdAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL,
	`updatedAt` integer DEFAULT (strftime('%s','now')*1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_inst_tenant_idx` ON `workflow_instances` (`tenantId`);--> statement-breakpoint
CREATE INDEX `workflow_inst_entry_idx` ON `workflow_instances` (`entryId`);