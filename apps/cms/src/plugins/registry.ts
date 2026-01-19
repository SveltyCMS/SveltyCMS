/**
 * @file src/plugins/registry.ts
 * @description Plugin registry and service implementation
 *
 * This module provides:
 * - In-memory plugin registry (singleton)
 * - Plugin registration and lifecycle management
 * - Migration tracking and execution
 * - SSR hook coordination
 *
 * The registry is initialized during server startup via hooks.server.ts
 */

import type { Plugin, PluginRegistryEntry, IPluginService, PluginSSRHook, PluginMigrationRecord, PluginState } from './types';
import type { IDBAdapter, DatabaseResult } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';
import { PluginSettingsService } from './settings';

/**
 * Plugin Registry (Singleton)
 * Stores all registered plugins in memory
 */
class PluginRegistry implements IPluginService {
	private plugins: Map<string, PluginRegistryEntry> = new Map();
	private initialized = false;
	private settingsService: PluginSettingsService | null = null;

	/**
	 * Initialize the registry with database adapter
	 */
	async initialize(dbAdapter: IDBAdapter): Promise<void> {
		if (this.initialized) return;

		this.settingsService = new PluginSettingsService(dbAdapter);
		await this.settingsService.initialize();

		this.initialized = true;
		logger.info('✅ PluginRegistry initialized with persistence service');
	}

	/**
	 * Register a plugin with the registry
	 */
	async register(plugin: Plugin): Promise<DatabaseResult<void>> {
		try {
			// Validate plugin
			if (!plugin.metadata?.id) {
				return {
					success: false,
					message: 'Plugin must have metadata.id',
					error: {
						code: 'INVALID_PLUGIN',
						message: 'Plugin metadata.id is required'
					}
				};
			}

			// Check for duplicate
			if (this.plugins.has(plugin.metadata.id)) {
				logger.warn(`Plugin ${plugin.metadata.id} is already registered, skipping`);
				return { success: true, data: undefined };
			}

			// Register plugin
			this.plugins.set(plugin.metadata.id, {
				plugin,
				registeredAt: new Date()
			});

			logger.info(`✅ Plugin registered: ${plugin.metadata.id} v${plugin.metadata.version}`);

			return { success: true, data: undefined };
		} catch (error) {
			logger.error('Failed to register plugin', { error, pluginId: plugin.metadata?.id });
			return {
				success: false,
				message: 'Failed to register plugin',
				error: {
					code: 'REGISTRATION_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	/**
	 * Get all registered plugins
	 */
	getAll(): Plugin[] {
		return Array.from(this.plugins.values()).map((entry) => entry.plugin);
	}

	/**
	 * Get a specific plugin by ID
	 */
	get(pluginId: string): Plugin | undefined {
		return this.plugins.get(pluginId)?.plugin;
	}

	/**
	 * Run pending migrations for a specific plugin
	 */
	async runMigrations(pluginId: string, dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>> {
		try {
			const entry = this.plugins.get(pluginId);
			if (!entry) {
				return {
					success: false,
					message: `Plugin ${pluginId} not found`,
					error: { code: 'PLUGIN_NOT_FOUND', message: `Plugin ${pluginId} not registered` }
				};
			}

			const plugin = entry.plugin;
			if (!plugin.migrations || plugin.migrations.length === 0) {
				logger.debug(`No migrations for plugin ${pluginId}`);
				return { success: true, data: undefined };
			}

			// Sort migrations by version
			const sortedMigrations = [...plugin.migrations].sort((a, b) => a.version - b.version);

			// Get applied migrations from database
			const appliedMigrationsResult = await this.getAppliedMigrations(dbAdapter, pluginId, tenantId);
			if (!appliedMigrationsResult.success) {
				return appliedMigrationsResult as DatabaseResult<void>;
			}

			const appliedMigrationIds = new Set(appliedMigrationsResult.data?.map((m: PluginMigrationRecord) => m.migrationId) || []);

			// Execute pending migrations
			let executedCount = 0;
			for (const migration of sortedMigrations) {
				if (appliedMigrationIds.has(migration.id)) {
					logger.debug(`Migration ${migration.id} already applied, skipping`);
					continue;
				}

				logger.info(`📦 Running migration: ${pluginId}/${migration.id} - ${migration.description}`);

				try {
					await migration.up(dbAdapter);

					// Record migration as applied
					await this.recordMigration(dbAdapter, pluginId, migration.id, migration.version, tenantId);

					executedCount++;
					logger.info(`✅ Migration completed: ${pluginId}/${migration.id}`);
				} catch (error) {
					logger.error(`Failed to execute migration ${migration.id}`, { error, pluginId });
					return {
						success: false,
						message: `Migration ${migration.id} failed`,
						error: {
							code: 'MIGRATION_ERROR',
							message: error instanceof Error ? error.message : 'Unknown error'
						}
					};
				}
			}

			if (executedCount > 0) {
				logger.info(`✅ Plugin ${pluginId}: ${executedCount} migrations executed`);
			}

			return { success: true, data: undefined };
		} catch (error) {
			logger.error('Failed to run plugin migrations', { error, pluginId });
			return {
				success: false,
				message: 'Failed to run migrations',
				error: {
					code: 'MIGRATION_RUNNER_ERROR',
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			};
		}
	}

	/**
	 * Run all pending migrations for all registered plugins
	 */
	async runAllMigrations(dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>> {
		try {
			logger.info('🔄 Running plugin migrations...');

			// Ensure plugin_migrations table exists
			await this.ensureMigrationTable(dbAdapter);

			const plugins = this.getAll();
			let totalExecuted = 0;

			for (const plugin of plugins) {
				if (!plugin.metadata.enabled) {
					logger.debug(`Plugin ${plugin.metadata.id} is disabled, skipping migrations`);
					continue;
				}

				const result = await this.runMigrations(plugin.metadata.id, dbAdapter, tenantId);
				if (!result.success) {
					logger.error(`Failed to run migrations for ${plugin.metadata.id}`, { error: (result as any).error });
					// Continue with other plugins even if one fails
					continue;
				}
			}

			if (totalExecuted > 0) {
				logger.info(`✅ All plugin migrations completed`);
			} else {
				logger.debug('No pending plugin migrations');
			}

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

	/**
	 * Get SSR hooks for plugins enabled on a collection
	 */
	/**
	 * Get SSR hooks for plugins enabled on a collection
	 */
	async getSSRHooks(collectionId: string, tenantId?: string): Promise<PluginSSRHook[]> {
		const hooks: PluginSSRHook[] = [];
		const activeTenantId = tenantId || 'default'; // Ensure we have a tenant ID for checks

		for (const entry of this.plugins.values()) {
			const plugin = entry.plugin;

			// Check if plugin is enabled for this collection
			if (!(await this.isEnabledForCollection(plugin.metadata.id, collectionId, activeTenantId))) {
				continue;
			}

			if (!plugin.ssrHook) {
				continue;
			}

			hooks.push(plugin.ssrHook);
		}

		return hooks;
	}

	/**
	 * Check if a plugin is enabled for a specific collection
	 */
	/**
	 * Check if a plugin is enabled for a specific collection and tenant
	 */
	async isEnabledForCollection(pluginId: string, collectionId: string, tenantId?: string): Promise<boolean> {
		const plugin = this.get(pluginId);
		if (!plugin) return false;

		// 1. Check persistent state if service available
		let enabled = plugin.metadata.enabled; // Default to metadata

		if (this.settingsService && tenantId) {
			const state = await this.settingsService.getPluginState(pluginId, tenantId);
			if (state) {
				enabled = state.enabled;
			}
		}

		if (!enabled) return false;

		// 2. Check enabledCollections whitelist
		// If no enabledCollections specified, plugin is enabled for all collections
		if (!plugin.enabledCollections || plugin.enabledCollections.length === 0) {
			return true;
		}

		// Check if collection is in the enabled list
		return plugin.enabledCollections.includes(collectionId);
	}

	/**
	 * Toggle a plugin's enabled state for a tenant
	 */
	async togglePlugin(pluginId: string, enabled: boolean, tenantId: string, userId?: string): Promise<boolean> {
		if (!this.settingsService) {
			logger.warn('PluginSettingsService not initialized');
			return false;
		}

		return await this.settingsService.setPluginState(pluginId, tenantId, enabled, userId);
	}

	/**
	 * Get state for a plugin
	 */
	async getPluginState(pluginId: string, tenantId: string): Promise<PluginState | null> {
		if (!this.settingsService) return null;
		return await this.settingsService.getPluginState(pluginId, tenantId);
	}

	/**
	 * Mark registry as initialized
	 */
	markInitialized() {
		this.initialized = true;
	}

	/**
	 * Check if registry is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Ensure plugin_migrations table exists
	 */
	private async ensureMigrationTable(dbAdapter: IDBAdapter): Promise<void> {
		try {
			// Try to query the table - if it fails, create it
			const testQuery = await dbAdapter.crud.count('plugin_migrations');
			if (testQuery.success) {
				logger.debug('plugin_migrations table already exists');
				return;
			}
		} catch (error) {
			// Table doesn't exist, create it
			logger.info('Creating plugin_migrations table');
			try {
				if (dbAdapter.collection && typeof (dbAdapter.collection as any).createCollection === 'function') {
					await (dbAdapter.collection as any).createCollection('plugin_migrations');
				}
			} catch (creationError) {
				logger.warn('Explicit collection creation failed (might be auto-created by insert)', creationError);
			}
		}

		// Create the table using the database adapter
		// Note: This is a simple approach. In production, you might want a more
		// sophisticated schema definition system
		const createResult = await dbAdapter.crud.insert<PluginMigrationRecord>('plugin_migrations', {
			pluginId: '__INIT__',
			migrationId: '__INIT__',
			version: 0,
			appliedAt: new Date(),
			tenantId: 'system'
		});

		if (!createResult.success) {
			logger.error('Failed to create plugin_migrations table', { error: createResult });
			throw new Error(`Failed to create plugin_migrations table: ${createResult.message}`);
		}

		if (createResult.success) {
			// Delete the init record
			await dbAdapter.crud.deleteMany('plugin_migrations', {
				pluginId: '__INIT__'
			} as any);
			logger.info('✅ plugin_migrations table created');
		}
	}

	/**
	 * Get applied migrations for a plugin
	 */
	private async getAppliedMigrations(dbAdapter: IDBAdapter, pluginId: string, tenantId: string): Promise<DatabaseResult<PluginMigrationRecord[]>> {
		try {
			const result = await dbAdapter.crud.findMany<PluginMigrationRecord>('plugin_migrations', {
				pluginId,
				tenantId
			});

			return result as DatabaseResult<PluginMigrationRecord[]>;
		} catch (error) {
			logger.error('Failed to get applied migrations', { error, pluginId });
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

	/**
	 * Record a migration as applied
	 */
	private async recordMigration(dbAdapter: IDBAdapter, pluginId: string, migrationId: string, version: number, tenantId: string): Promise<void> {
		const now = new Date();
		await dbAdapter.crud.insert<PluginMigrationRecord>('plugin_migrations', {
			pluginId,
			migrationId,
			version,
			tenantId,
			appliedAt: now
		});
	}
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();
