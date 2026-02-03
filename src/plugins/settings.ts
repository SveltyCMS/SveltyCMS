/**
 * @file src/plugins/settings.ts
 * @description Service for managing persistent plugin settings and states
 */

import type { IDBAdapter } from '@databases/dbInterface';
import { logger } from '@utils/logger.server';
import type { PluginState } from './types';

export class PluginSettingsService {
	private readonly COLLECTION = 'pluginStates';

	constructor(private dbAdapter: IDBAdapter) {}

	// Ensure the plugin_states collection exists
	async initialize(): Promise<void> {
		try {
			const count = await this.dbAdapter.crud.count(this.COLLECTION);
			if (!count.success) {
				logger.info(`Creating ${this.COLLECTION} collection...`);
				// Create by inserting and deleting a dummy record if createCollection not explicitly available
				await this.dbAdapter.crud.insert(this.COLLECTION, {
					pluginId: '__INIT__',
					tenantId: 'system',
					enabled: false
				} as any);
				await this.dbAdapter.crud.deleteMany(this.COLLECTION, { pluginId: '__INIT__' } as any);
			}
		} catch (error) {
			logger.error(`Failed to initialize ${this.COLLECTION}`, { error });
		}
	}

	// Get state for a specific plugin and tenant
	async getPluginState(pluginId: string, tenantId: string): Promise<PluginState | null> {
		try {
			const result = await this.dbAdapter.crud.findOne<PluginState>(this.COLLECTION, {
				pluginId,
				tenantId
			} as any);

			if (result.success && result.data) {
				return result.data;
			}
			return null;
		} catch (error) {
			logger.error(`Failed to get plugin state for ${pluginId}`, { error });
			return null;
		}
	}

	// Get all plugin states for a tenant
	async getAllPluginStates(tenantId: string): Promise<PluginState[]> {
		try {
			const result = await this.dbAdapter.crud.findMany<PluginState>(this.COLLECTION, {
				tenantId
			} as any);
			return result.success && result.data ? result.data : [];
		} catch (error) {
			logger.error(`Failed to get all plugin states for tenant ${tenantId}`, { error });
			return [];
		}
	}

	// Set plugin enabled/disabled state
	async setPluginState(pluginId: string, tenantId: string, enabled: boolean, userId?: string): Promise<boolean> {
		try {
			const existing = await this.getPluginState(pluginId, tenantId);

			if (existing && existing._id) {
				// Update
				const updateResult = await this.dbAdapter.crud.update<PluginState>(this.COLLECTION, existing._id, {
					enabled,
					updatedAt: new Date(),
					updatedBy: userId
				} as any);
				return updateResult.success;
			} else {
				// Insert
				const insertResult = await this.dbAdapter.crud.insert<PluginState>(this.COLLECTION, {
					pluginId,
					tenantId,
					enabled,
					updatedBy: userId
				} as any);
				return insertResult.success;
			}
		} catch (error) {
			logger.error(`Failed to set plugin state for ${pluginId}`, { error });
			return false;
		}
	}
}
