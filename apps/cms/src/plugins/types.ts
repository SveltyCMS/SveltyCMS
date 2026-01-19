/**
 * @file src/plugins/types.ts
 * @description Type definitions for the SveltyCMS plugin system
 *
 * This module defines the core types for:
 * - Plugin metadata and registration
 * - Plugin hooks (server-side SSR enrichment)
 * - Plugin migrations (database schema management)
 * - Plugin configuration (public/private settings)
 *
 * Design principles:
 * - Language-aware: All plugin data includes language context
 * - Multi-tenant: All plugin tables store tenantId
 * - Nx-friendly: Clean boundaries for future monorepo migration
 * - Secure: Separate public/private settings, enforce authz
 */

import type { IDBAdapter, DatabaseResult, DatabaseId, ISODateString } from '@shared/database/dbInterface';
import type { User } from '@shared/database/auth/types';
import type { Schema } from '@cms/content/types';

/**
 * Plugin metadata and registration info
 */
export interface PluginMetadata {
	/** Unique plugin identifier (e.g., 'pagespeed', 'seo-audit') */
	id: string;

	/** Human-readable plugin name */
	name: string;

	/** Plugin version (semver) */
	version: string;

	/** Short description of plugin functionality */
	description: string;

	/** Plugin author */
	author?: string;

	/** Plugin icon (Iconify string) */
	icon?: string;

	/** Whether plugin is currently enabled globally */
	enabled: boolean;
}

/**
 * Plugin migration definition
 * Plugins use migrations to manage their database tables/collections
 */
export interface PluginMigration {
	/** Unique migration identifier (e.g., '001_create_results_table') */
	id: string;

	/** Plugin ID this migration belongs to */
	pluginId: string;

	/** Migration version (for ordering) */
	version: number;

	/** Description of what this migration does */
	description: string;

	/** Migration execution function */
	up: (dbAdapter: IDBAdapter) => Promise<void>;

	/** Rollback function (optional, for future use) */
	down?: (dbAdapter: IDBAdapter) => Promise<void>;
}

/**
 * Plugin configuration schema
 * Defines both public and private settings for a plugin
 */
export interface PluginConfig {
	/** Public settings (visible to client) */
	public?: Record<string, unknown>;

	/** Private settings (server-only, e.g., API keys) */
	private?: Record<string, unknown>;
}

/**
 * Context passed to plugin hooks
 * Contains all information needed for language-aware, multi-tenant operations
 */
export interface PluginContext {
	/** Current user making the request */
	user: User;

	/** Tenant ID (or 'default' when MULTI_TENANT disabled) */
	tenantId: string;

	/** Content language from route params */
	language: string;

	/** Database adapter for plugin operations */
	dbAdapter: IDBAdapter;

	/** Collection schema being viewed */
	collectionSchema: Schema;
}

/**
 * Entry data enrichment result from plugins
 * Plugins return additional data to display in EntryList columns
 */
export interface PluginEntryData {
	/** Entry ID this data belongs to */
	entryId: string;

	/** Plugin-specific data (structure determined by plugin) */
	data: Record<string, unknown>;

	/** When this data was last updated */
	updatedAt: Date;
}

/**
 * SSR hook for enriching entry list data
 * Called during +page.server.ts load to add plugin data to entries
 */
export type PluginSSRHook = (context: PluginContext, entries: Array<Record<string, unknown>>) => Promise<PluginEntryData[]>;

/**
 * UI column definition for plugin data display
 */
export interface PluginColumn {
	/** Column identifier */
	id: string;

	/** Column header label (localization key or static text) */
	label: string;

	/** Column width (CSS value) */
	width?: string;

	/** Whether column is sortable */
	sortable?: boolean;
}

/**
 * Plugin UI contribution
 * Defines how plugin data appears in EntryList
 */
export interface PluginUIContribution {
	/** Additional columns to display */
	columns?: PluginColumn[];

	/** Actions/buttons to add per entry */
	actions?: Array<{
		id: string;
		label: string;
		icon?: string;
		handler: string; // Name of the client-side action handler
	}>;
}

/**
 * Complete plugin definition
 * Registered plugins must implement this interface
 */
export interface Plugin {
	/** Plugin metadata */
	metadata: PluginMetadata;

	/** Plugin migrations (executed in version order) */
	migrations?: PluginMigration[];

	/** SSR hook for data enrichment (optional) */
	ssrHook?: PluginSSRHook;

	/** UI contributions (optional) */
	ui?: PluginUIContribution;

	/** Plugin configuration schema */
	config?: PluginConfig;

	/** Which collections this plugin is enabled for (empty = all) */
	enabledCollections?: string[]; // Collection IDs
}

/**
 * Plugin registry storage format
 * Tracks which plugins are registered and their state
 */
export interface PluginRegistryEntry {
	plugin: Plugin;
	registeredAt: Date;
	lastMigration?: string; // ID of last executed migration
}

/**
 * Migration tracking record
 * Stored in plugin_migrations collection to track applied migrations
 */
export interface PluginMigrationRecord {
	_id: DatabaseId;
	pluginId: string;
	migrationId: string;
	version: number;
	appliedAt: Date;
	tenantId: string;
	createdAt: ISODateString;
	updatedAt: ISODateString;
}

/**
 * Plugin state record
 * Stored in plugin_states collection
 */
export interface PluginState {
	_id: DatabaseId;
	pluginId: string;
	tenantId: string;
	enabled: boolean;
	settings?: Record<string, any>;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	updatedBy?: string;
}

/**
 * Plugin service interface
 * Main API for interacting with the plugin system
 */
export interface IPluginService {
	/** Register a new plugin */
	register(plugin: Plugin): Promise<DatabaseResult<void>>;

	/** Get all registered plugins */
	getAll(): Plugin[];

	/** Get a specific plugin by ID */
	get(pluginId: string): Plugin | undefined;

	/** Run pending migrations for a plugin */
	runMigrations(pluginId: string, dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>>;

	/** Run all pending migrations for all plugins */
	runAllMigrations(dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>>;

	/** Get SSR hooks for enabled plugins on a collection */
	getSSRHooks(collectionId: string, tenantId?: string): Promise<PluginSSRHook[]>;

	/** Check if a plugin is enabled for a collection */
	isEnabledForCollection(pluginId: string, collectionId: string, tenantId?: string): Promise<boolean>;

	/** Toggle plugin enabled state */
	togglePlugin(pluginId: string, enabled: boolean, tenantId: string, userId?: string): Promise<boolean>;
}
