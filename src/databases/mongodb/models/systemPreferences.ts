/**
 * @file src/databases/mongodb/models/systemPreferences.ts
 * @description MongoDB schema and model for System Preferences.
 *
 * This module defines a schema and model for system-wide preferences and settings.
 */
import mongoose from 'mongoose';
const { Schema, Model, FilterQuery } = mongoose;
import type { SystemPreferences, DatabaseResult } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// System preferences schema
export const systemPreferencesSchema = new Schema<SystemPreferences>(
	{
		_id: { type: String, required: true }, // UUID as per dbInterface.ts
		key: { type: String, required: true, unique: true }, // Unique key for the preference
		value: { type: Schema.Types.Mixed }, // Value of the preference, can be any type
		scope: { type: String, enum: ['user', 'system', 'widget'], default: 'system' }, // Scope of the preference
		userId: { type: String, ref: 'auth_users', required: false }, // Optional userId for user-scoped preferences
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_preferences',
		strict: true // Enforce strict schema validation
	}
);

// Indexes
systemPreferencesSchema.index({ key: 1, scope: 1, userId: 1 }, { unique: true }); // Unique index for key, scope, userId
systemPreferencesSchema.index({ scope: 1, userId: 1 }); // Index for scope and userId queries
systemPreferencesSchema.index({ scope: 1 }); // Index for scope-based queries

// Static methods
systemPreferencesSchema.statics = {
	//Get preference by key and scope
	async getPreferenceByKeyScope(key: string, scope: string, userId?: string): Promise<DatabaseResult<SystemPreferences | null>> {
		try {
			const query: FilterQuery<SystemPreferences> = { key, scope };
			if (scope === 'user' && userId) {
				query.userId = userId;
			}
			const preferenceResult = (await this.findOne(query).lean().exec()) as SystemPreferences | null;
			if (!preferenceResult) {
				return { success: true, data: null }; // Explicitly return null for "not found" case
			}
			logger.debug(`Retrieved system preference by key: ${key}, scope: ${scope}, userId: ${userId || 'system'}`);
			return { success: true, data: preferenceResult };
		} catch (error) {
			logger.error(`Error retrieving system preference: ${error.message}`);
			return { success: false, error: { code: 'PREFERENCE_GET_ERROR', message: `Failed to retrieve preference for key: ${key}` } };
		}
	},

	// Bulk delete preferences by scope
	async bulkDeletePreferencesByScope(scope: string): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ scope }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} system preferences for scope: ${scope}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			logger.error(`Error bulk deleting system preferences by scope: ${error.message}`);
			return { success: false, error: { code: 'PREFERENCE_BULK_DELETE_ERROR', message: 'Failed to bulk delete system preferences', details: error } };
		}
	},

	// Set a preference value
	async setPreference(key: string, value: unknown, scope: string, userId?: string): Promise<DatabaseResult<void>> {
		try {
			const query: FilterQuery<SystemPreferences> = { key, scope };
			if (scope === 'user' && userId) {
				query.userId = userId;
			}
			await this.updateOne(query, { $set: { value } }, { upsert: true }).exec();
			logger.debug(`Set system preference for key: ${key}, scope: ${scope}, userId: ${userId || 'system'}`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error setting system preference: ${error.message}`);
			return { success: false, error: { code: 'PREFERENCE_SET_ERROR', message: `Failed to set preference for key: ${key}` } };
		}
	},

	// Delete a preference by key and scope
	async deletePreference(key: string, scope: string, userId?: string): Promise<DatabaseResult<void>> {
		try {
			const query: FilterQuery<SystemPreferences> = { key, scope };
			if (scope === 'user' && userId) {
				query.userId = userId;
			}
			const result = await this.deleteOne(query).exec();
			if (result.deletedCount === 0) {
				logger.warn(`Preference with key "${key}" not found for deletion (scope: ${scope}, userId: ${userId || 'system'}).`);
			}
			logger.debug(`Deleted system preference for key: ${key}, scope: ${scope}, userId: ${userId || 'system'}`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error deleting system preference: ${error.message}`);
			return { success: false, error: { code: 'PREFERENCE_DELETE_ERROR', message: `Failed to delete preference for key: ${key}` } };
		}
	}
};

// Create and export the SystemPreferencesModel
export const SystemPreferencesModel =
	(mongoose.models?.SystemPreferences as typeof Model<SystemPreferences> | undefined) ||
	mongoose.model<SystemPreferences>('SystemPreferences', systemPreferencesSchema);
