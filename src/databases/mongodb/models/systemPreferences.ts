/**
 * @file src/databases/mongodb/models/systemPreferences.ts
 * @description MongoDB schema and model for System Preferences, supporting user-specific dashboard layouts.
 */

import mongoose, { Schema } from 'mongoose';
import type { DatabaseResult } from '@src/databases/dbInterface';
import type { FilterQuery, Model } from 'mongoose';
import type { Layout } from '@stores/systemPreferences.svelte';
import type { DashboardWidgetConfig } from '@config/dashboard.types';
import { logger } from '@utils/logger.svelte';

// Widget schema aligned with +server.ts
const WidgetSchema = new Schema<DashboardWidgetConfig>(
	{
		id: { type: String, required: true, unique: true },
		component: { type: String, required: true },
		label: { type: String, required: true },
		icon: { type: String, required: true },
		size: {
			w: { type: Number, required: true },
			h: { type: Number, required: true }
		},
		settings: { type: Schema.Types.Mixed, default: {} },
		gridPosition: { type: Number, required: true }
	},
	{ _id: false }
);

// Layout schema
const LayoutSchema = new Schema({
	id: { type: String, required: true },
	name: { type: String, required: true },
	preferences: { type: [WidgetSchema], default: [] }
});

// System preferences schema
const SystemPreferencesSchema = new Schema(
	{
		_id: { type: String, required: true }, // UUID as per dbInterface.ts
		userId: { type: String, ref: 'auth_users', required: false }, // Optional userId for user-scoped preferences
		layoutId: { type: String, required: true }, // Unique layout identifier
		layout: { type: LayoutSchema, required: true }, // Structured layout data
		scope: { type: String, enum: ['user', 'system', 'widget'], default: 'user' }, // Scope of the preference
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
SystemPreferencesSchema.index({ userId: 1, layoutId: 1, scope: 1 }, { unique: true }); // Unique per user and layout
SystemPreferencesSchema.index({ scope: 1, userId: 1 }); // Index for scope and userId queries
SystemPreferencesSchema.index({ scope: 1 }); // Index for scope-based queries

// Static methods
SystemPreferencesSchema.statics = {
	// Get preference by layoutId and userId
	async getPreferenceByLayout(userId: string, layoutId: string): Promise<DatabaseResult<Layout | null>> {
		try {
			const query: FilterQuery<any> = { userId, layoutId, scope: 'user' };
			const doc = await this.findOne(query).lean().exec();
			if (!doc) {
				logger.debug(`No preference found for userId: ${userId}, layoutId: ${layoutId}`);
				return { success: true, data: null };
			}
			logger.debug(`Retrieved system preference for userId: ${userId}, layoutId: ${layoutId}`);
			return { success: true, data: doc.layout };
		} catch (error) {
			logger.error(`Error retrieving system preference for userId: ${userId}, layoutId: ${layoutId}`, error);
			return {
				success: false,
				error: {
					code: 'PREFERENCE_GET_ERROR',
					message: `Failed to retrieve preference for userId: ${userId}, layoutId: ${layoutId}`
				}
			};
		}
	},

	// Set preference for a specific layout
	async setPreference(userId: string, layoutId: string, layout: Layout): Promise<DatabaseResult<void>> {
		try {
			const query: FilterQuery<SystemPreferences> = { userId, layoutId, scope: 'user' };
			// The _id for the document should be a combination of userId and layoutId for uniqueness
			const documentId = `${userId}_${layoutId}`;
			await this.updateOne(query, { $set: { layout, _id: documentId } }, { upsert: true }).exec();
			logger.debug(`Set system preference for userId: ${userId}, layoutId: ${layoutId}`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error setting system preference for userId: ${userId}, layoutId: ${layoutId}`, error);
			return {
				success: false,
				error: {
					code: 'PREFERENCE_SET_ERROR',
					message: `Failed to set preference for userId: ${userId}, layoutId: ${layoutId}`
				}
			};
		}
	},

	// Delete preferences for a user
	async deletePreferencesByUser(userId: string): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ userId, scope: 'user' }).exec();
			logger.info(`Deleted ${result.deletedCount} system preferences for userId: ${userId}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			logger.error(`Error deleting system preferences for userId: ${userId}`, error);
			return {
				success: false,
				error: {
					code: 'PREFERENCE_DELETE_ERROR',
					message: `Failed to delete preferences for userId: ${userId}`
				}
			};
		}
	}
};

// Create and export the SystemPreferencesModel
export const SystemPreferencesModel =
	(mongoose.models?.SystemPreferences as Model<any> | undefined) || mongoose.model('SystemPreferences', SystemPreferencesSchema);
