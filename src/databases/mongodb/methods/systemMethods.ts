/**
 * @file src/databases/mongodb/methods/systemMethods.ts
 * @description System preferences and settings management for MongoDB adapter.
 * This class uses dependency injection for models to enhance testability and modularity.
 */

import type { Model } from 'mongoose';
import { logger } from '@utils/logger.svelte';
import type { Layout, SystemPreferencesDocument } from '@src/content/types';
import type { DatabaseId } from '../../dbInterface';
import type { SystemSetting } from '../models/systemSetting';
import { createDatabaseError } from './mongoDBUtils';

// Define model types for dependency injection
type SystemPreferencesModelType = Model<SystemPreferencesDocument>;
type SystemSettingModelType = Model<SystemSetting>;

export class MongoSystemMethods {
	private SystemPreferencesModel: SystemPreferencesModelType;
	private SystemSettingModel: SystemSettingModelType;

	/**
	 * Constructs the MongoSystemMethods instance with injected models.
	 * @param {SystemPreferencesModelType} systemPreferencesModel - The Mongoose model for system preferences.
	 * @param {SystemSettingModelType} systemSettingModel - The Mongoose model for system settings.
	 */
	constructor(systemPreferencesModel: SystemPreferencesModelType, systemSettingModel: SystemSettingModelType) {
		this.SystemPreferencesModel = systemPreferencesModel;
		this.SystemSettingModel = systemSettingModel;
		logger.info('MongoSystemMethods initialized with models.');
	}

	// ============================================================
	// User Preferences Methods (Layout & Widget Specific)
	// ============================================================

	/**
	 * Sets user preferences for a specific layout using an atomic upsert operation.
	 */
	async setUserPreferences(userId: string, layoutId: string, layout: Layout): Promise<void> {
		try {
			await this.SystemPreferencesModel.updateOne(
				{ userId },
				{ $set: { [`preferences.${layoutId}`]: layout }, updatedAt: new Date() },
				{ upsert: true }
			);
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCES_SAVE_ERROR', 'Failed to save user preferences');
		}
	}

	/**
	 * Gets system preferences for a user's single layout.
	 */
	async getSystemPreferences(userId: string, layoutId: string): Promise<Layout | null> {
		try {
			// Use projection to only fetch the required layout preference
			const doc = await this.SystemPreferencesModel.findOne(
				{ userId },
				{ [`preferences.${layoutId}`]: 1 } // Projection
			).lean<{ preferences: Record<string, Layout> }>();

			return doc?.preferences?.[layoutId] ?? null;
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCES_LOAD_ERROR', 'Failed to load user preferences');
		}
	}

	/**
	 * Gets the state of a specific widget within a layout using projection.
	 */
	async getWidgetState<T>(userId: string, layoutId: string, widgetId: string): Promise<T | null> {
		try {
			const layout = await this.getSystemPreferences(userId, layoutId);
			// Assuming preferences is an array of widgets with settings
			const widget = layout?.preferences?.find((w) => w.id === widgetId);
			return (widget?.settings as T) ?? null;
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_STATE_GET_ERROR', 'Failed to get widget state');
		}
	}

	/**
	 * Sets the state of a specific widget within a layout using an atomic update with arrayFilters.
	 * This is highly performant as it avoids fetching the document into application memory.
	 */
	async setWidgetState(userId: string, layoutId: string, widgetId: string, state: unknown): Promise<void> {
		try {
			const result = await this.SystemPreferencesModel.updateOne(
				{ userId },
				{ $set: { [`preferences.${layoutId}.preferences.$[widget].settings`]: state } },
				{
					arrayFilters: [{ 'widget.id': widgetId }]
				}
			);

			if (result.matchedCount === 0) {
				logger.warn(`User preferences document not found for user ${userId}. State was not set.`);
			} else if (result.modifiedCount === 0) {
				logger.warn(`Widget ${widgetId} not found in layout ${layoutId} for user ${userId}. State was not set.`);
			}
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_STATE_SAVE_ERROR', 'Failed to save widget state');
		}
	}

	/**
	 * Clears all preferences for a given user.
	 */
	async clearSystemPreferences(userId: string): Promise<void> {
		try {
			await this.SystemPreferencesModel.deleteMany({ userId });
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCES_CLEAR_ERROR', 'Failed to clear preferences');
		}
	}

	// ============================================================
	// Generic Preference Methods (Database-Agnostic Interface)
	// ============================================================

	/**
	 * Gets a single preference value by key.
	 * Returns null if not found, throws an error on database failure.
	 */
	async get<T>(key: string, scope: 'user' | 'system' = 'system', userId?: DatabaseId): Promise<T | null> {
		try {
			if (scope === 'system') {
				const setting = await this.SystemSettingModel.findOne({ key }).lean();
				return setting ? (setting.value as T) : null;
			}

			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}
			const userPrefs = await this.SystemPreferencesModel.findOne(
				{ userId: userId.toString() },
				{ [`preferences.${key}`]: 1 } // Projection
			).lean<{ preferences: Record<string, T> }>();

			return userPrefs?.preferences?.[key] ?? null;
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCE_GET_ERROR', `Failed to get preference '${key}'`);
		}
	}

	/**
	 * Sets a single preference value by key.
	 */
	async set<T>(key: string, value: T, scope: 'user' | 'system' = 'system', userId?: DatabaseId): Promise<void> {
		try {
			if (scope === 'system') {
				await this.SystemSettingModel.updateOne({ key }, { $set: { value }, updatedAt: new Date() }, { upsert: true });
				return;
			}

			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}

			await this.SystemPreferencesModel.updateOne(
				{ userId: userId.toString() },
				{ $set: { [`preferences.${key}`]: value }, updatedAt: new Date() },
				{ upsert: true }
			);
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCE_SET_ERROR', `Failed to set preference '${key}'`);
		}
	}

	/**
	 * Deletes a single preference by key.
	 */
	async delete(key: string, scope: 'user' | 'system' = 'system', userId?: DatabaseId): Promise<void> {
		try {
			if (scope === 'system') {
				const result = await this.SystemSettingModel.deleteOne({ key });
				if (result.deletedCount === 0) {
					logger.warn(`System setting '${key}' not found for deletion.`);
				}
				return;
			}

			if (!userId) {
				throw new Error('User ID is required for user-scoped preferences.');
			}

			// Use $unset for atomic removal of a field from the subdocument
			const result = await this.SystemPreferencesModel.updateOne({ userId: userId.toString() }, { $unset: { [`preferences.${key}`]: '' } });

			if (result.modifiedCount === 0) {
				logger.warn(`User preference '${key}' not found for user '${userId}' during deletion.`);
			}
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCE_DELETE_ERROR', `Failed to delete preference '${key}'`);
		}
	}

	/**
	 * Clears all preferences within a given scope.
	 */
	async clear(scope: 'user' | 'system' = 'system', userId?: DatabaseId): Promise<void> {
		try {
			if (scope === 'system') {
				await this.SystemSettingModel.deleteMany({});
				return;
			}

			if (userId) {
				// Clear for a specific user
				await this.SystemPreferencesModel.deleteMany({ userId: userId.toString() });
			} else {
				// Clear all user preferences
				await this.SystemPreferencesModel.deleteMany({});
			}
		} catch (error) {
			throw createDatabaseError(error, 'PREFERENCES_CLEAR_ERROR', `Failed to clear ${scope} preferences`);
		}
	}
}
