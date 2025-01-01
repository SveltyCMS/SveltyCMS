/**
* @file src/databases/mongodb/models/systemPreferences.ts
* @description MongoDB schema and model for System Preferences.
*
* This module defines a schema and model for system-wide preferences and settings.
*/

import { Schema } from 'mongoose';
import type { SystemPreferences } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// System preferences schema
export const systemPreferencesSchema = new Schema(
	{
		_id: { type: String, required: true },
		key: { type: String, required: true, unique: true },
		value: Schema.Types.Mixed,
		category: { type: String, required: true },
		description: String,
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_preferences',
		strict: false
	}
);

// Add indexes
systemPreferencesSchema.index({ category: 1 });

// Static methods
systemPreferencesSchema.statics = {
	// Get all preferences
	async getAllPreferences(): Promise<SystemPreferences[]> {
		try {
			const prefs = await this.find().exec();
			logger.debug(`Retrieved ${prefs.length} system preferences`);
			return prefs;
		} catch (error) {
			logger.error(`Error retrieving system preferences: ${error.message}`);
			throw error;
		}
	},

	// Get preference by key
	async getPreference(key: string): Promise<SystemPreferences | null> {
		try {
			const pref = await this.findOne({ key }).exec();
			logger.debug(`Retrieved system preference: ${key}`);
			return pref;
		} catch (error) {
			logger.error(`Error retrieving system preference: ${error.message}`);
			throw error;
		}
	},

	// Get preferences by category
	async getPreferencesByCategory(category: string): Promise<SystemPreferences[]> {
		try {
			const prefs = await this.find({ category }).exec();
			logger.debug(`Retrieved ${prefs.length} preferences for category: ${category}`);
			return prefs;
		} catch (error) {
			logger.error(`Error retrieving preferences by category: ${error.message}`);
			throw error;
		}
	},

	// Set preference
	async setPreference(key: string, value: Schema.Types.Mixed, category: string, description?: string): Promise<SystemPreferences> {
		try {
			const pref = await this.findOneAndUpdate({ key }, { value, category, description, updatedAt: new Date() }, { upsert: true, new: true }).exec();
			logger.info(`Updated system preference: ${key}`);
			return pref;
		} catch (error) {
			logger.error(`Error setting system preference: ${error.message}`);
			throw error;
		}
	},

	// Delete preference
	async deletePreference(key: string): Promise<boolean> {
		try {
			const result = await this.findOneAndDelete({ key }).exec();
			if (result) {
				logger.info(`Deleted system preference: ${key}`);
				return true;
			}
			logger.warn(`System preference not found for deletion: ${key}`);
			return false;
		} catch (error) {
			logger.error(`Error deleting system preference: ${error.message}`);
			throw error;
		}
	}
};

// Create and export the SystemPreferences model
export const SystemPreferencesModel =
	mongoose.models?.SystemPreferences || mongoose.model<SystemPreferences>('SystemPreferences', systemPreferencesSchema);
