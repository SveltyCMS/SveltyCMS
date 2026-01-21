/**
 * @file src/plugins/registry.ts
 * @description Central registry for managing CMS plugins
 */

import { logger } from '@utils/logger.server';
import { nowISODateString } from '@utils/dateUtils';
import type { IDBAdapter, DatabaseResult } from '@databases/dbInterface';
import type { Plugin, PluginRegistryEntry, PluginMigrationRecord, PluginSSRHook, IPluginService } from './types';
import { PluginSettingsService } from './settings';

class PluginRegistry implements IPluginService {
	private plugins: Map<string, PluginRegistryEntry> = new Map();
	private settingsService: PluginSettingsService | null = null;
	private initialized = false;

	// Register a new plugin
	async register(plugin: Plugin): Promise<DatabaseResult<void>> {
		try {
			if (this.plugins.has(plugin.metadata.id)) {
				logger.warn(`Plugin ${plugin.metadata.id} is already registered. Overwriting.`);
			}

			this.plugins.set(plugin.metadata.id, {
				plugin,
				registeredAt: nowISODateString()
			});

			logger.debug(`🔌 Plugin registered: ${plugin.metadata.name} (${plugin.metadata.id}) v${plugin.metadata.version}`);

			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to register plugin ${plugin.metadata.id}`, { error });
			return {
				success: false,
				message: `Failed to register plugin ${plugin.metadata.id}`,
				error: {
					code: 'REGISTRATION_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	// Get all registered plugins
	getAll(): Plugin[] {
		return Array.from(this.plugins.values()).map((entry) => entry.plugin);
	}

	// Get a specific plugin by ID
	get(pluginId: string): Plugin | undefined {
		return this.plugins.get(pluginId)?.plugin;
	}

	// Initialize the plugin settings service
	async initializeSettings(dbAdapter: IDBAdapter): Promise<void> {
		this.settingsService = new PluginSettingsService(dbAdapter);
		await this.settingsService.initialize();
	}

	// Run pending migrations for a specific plugin
	async runMigrations(pluginId: string, dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>> {
		try {
			const entry = this.plugins.get(pluginId);
			if (!entry) {
				return {
					success: false,
					message: `Plugin ${pluginId} not found`,
					error: { code: 'NOT_FOUND', message: `Plugin ${pluginId} not found` }
				};
			}

			const plugin = entry.plugin;
			if (!plugin.migrations || plugin.migrations.length === 0) {
				return { success: true, data: undefined };
			}

			// Ensure metadata/migrations table exists
			await this.ensureMigrationTable(dbAdapter);

			// Get applied migrations
			const appliedResult = await this.getAppliedMigrations(dbAdapter, pluginId, tenantId);
			const appliedIds = new Set(appliedResult.success ? appliedResult.data.map((m) => m.migrationId) : []);

			// Sort and run pending migrations
			const pending = plugin.migrations.filter((m) => !appliedIds.has(m.id)).sort((a, b) => a.version - b.version);

			for (const migration of pending) {
				logger.info(`📝 Running plugin migration: ${pluginId} -> ${migration.id} (v${migration.version})`);
				await migration.up(dbAdapter);
				await this.recordMigration(dbAdapter, pluginId, migration.id, migration.version, tenantId);
			}

			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to run migrations for plugin ${pluginId}`, { error });
			return {
				success: false,
				message: `Failed to run migrations for plugin ${pluginId}`,
				error: {
					code: 'MIGRATION_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	// Run migrations for all registered plugins
	async runAllMigrations(dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>> {
		try {
			logger.debug('🚀 Running all pending plugin migrations...');

			for (const pluginId of this.plugins.keys()) {
				const result = await this.runMigrations(pluginId, dbAdapter, tenantId);
				if (!result.success) {
					logger.error(`Migration failed for plugin ${pluginId}`, { error: result.error });
					// Continue with others or stop? For now continue
					continue;
				}
			}

			logger.info(`✅ All plugin migrations checked/completed`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error('Failed to run all plugin migrations', { error });
			return {
				success: false,
				message: 'Failed to run all migrations',
				error: {
					code: 'MIGRATION_RUNNER_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	// Get SSR hooks for plugins enabled on a collection
	async getSSRHooks(collectionId: string, tenantId?: string, schema?: any): Promise<PluginSSRHook[]> {
		const hooks: PluginSSRHook[] = [];
		const activeTenantId = tenantId || 'default';

		for (const entry of this.plugins.values()) {
			const plugin = entry.plugin;

			// Check if plugin is enabled for this collection
			if (!(await this.isEnabledForCollection(plugin.metadata.id, collectionId, activeTenantId, schema))) {
				continue;
			}

			if (!plugin.ssrHook) {
				continue;
			}

			hooks.push(plugin.ssrHook);
		}

		return hooks;
	}

	// Check if a plugin is enabled for a specific collection and tenant
	async isEnabledForCollection(pluginId: string, collectionId: string, tenantId?: string, schema?: any): Promise<boolean> {
		const plugin = this.get(pluginId);
		if (!plugin) return false;

		// 1. Check persistent state
		let enabled = plugin.metadata.enabled; // Default from metadata

		if (this.settingsService && tenantId) {
			const state = await this.settingsService.getPluginState(pluginId, tenantId);
			if (state) {
				enabled = state.enabled;
			}
		}

		if (!enabled) return false;

		// 2. Check enabledCollections whitelist in plugin metadata (global lock)
		if (plugin.enabledCollections && plugin.enabledCollections.length > 0) {
			if (!plugin.enabledCollections.includes(collectionId)) {
				return false;
			}
		}

		// 3. Check schema-level overrides if provided (granular override)
		if (schema && schema.plugins) {
			return schema.plugins.includes(pluginId);
		}

		return true;
	}

	// Get state for a specific plugin and tenant
	async getPluginState(pluginId: string, tenantId: string) {
		if (!this.settingsService) {
			logger.warn('PluginSettingsService not initialized');
			return null;
		}
		return await this.settingsService.getPluginState(pluginId, tenantId);
	}

	// Toggle a plugin's enabled state
	async togglePlugin(pluginId: string, enabled: boolean, tenantId: string, userId?: string): Promise<boolean> {
		if (!this.settingsService) {
			logger.warn('PluginSettingsService not initialized');
			return false;
		}

		return await this.settingsService.setPluginState(pluginId, tenantId, enabled, userId);
	}

	// Mark registry as initialized
	markInitialized() {
		this.initialized = true;
	}

	// Check if registry is initialized
	isInitialized(): boolean {
		return this.initialized;
	}

	// Ensure migration table exists
	private async ensureMigrationTable(dbAdapter: IDBAdapter): Promise<void> {
		const table = 'plugin_migrations';
		try {
			const count = await dbAdapter.crud.count(table);
			if (count.success) return;
		} catch (error) {
			// Expected if table doesn't exist
		}

		logger.info(`Creating ${table} database collection...`);
		await dbAdapter.crud.insert(table, {
			pluginId: '__INIT__',
			migrationId: '__INIT__',
			version: 0,
			appliedAt: nowISODateString(),
			tenantId: 'system'
		} as any);
		await dbAdapter.crud.deleteMany(table, { pluginId: '__INIT__' } as any);
	}

	// Get applied migrations from database
	private async getAppliedMigrations(dbAdapter: IDBAdapter, pluginId: string, tenantId: string): Promise<DatabaseResult<PluginMigrationRecord[]>> {
		try {
			const result = await dbAdapter.crud.findMany<PluginMigrationRecord>('plugin_migrations', {
				pluginId,
				tenantId
			} as any);
			return result as DatabaseResult<PluginMigrationRecord[]>;
		} catch (error) {
			return {
				success: false,
				message: 'Failed to get applied migrations',
				error: {
					code: 'QUERY_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	// Record a successful migration
	private async recordMigration(dbAdapter: IDBAdapter, pluginId: string, migrationId: string, version: number, tenantId: string): Promise<void> {
		await dbAdapter.crud.insert('plugin_migrations', {
			pluginId,
			migrationId,
			version,
			tenantId,
			appliedAt: nowISODateString()
		} as any);
	}
}

export const pluginRegistry = new PluginRegistry();
