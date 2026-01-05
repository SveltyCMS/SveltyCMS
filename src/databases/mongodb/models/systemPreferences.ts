/**
 * @file src/databases/mongodb/models/systemPreferences.ts
 * @description MongoDB schema and model for System Preferences, supporting user-specific dashboard layouts.
 *
 * ### Features
 * - Schema definition with fields for userId, layoutId, layout structure, scope, and timestamps
 * - Indexes for efficient querying by userId, layoutId, and scope
 * - Static methods for common operations:
 *   - getPreferenceByLayout: Retrieve preferences for a specific user and layout
 *   - setPreference: Create or update preferences with optional widget validation
 *   - validateLayoutWidgets: Ensure widgets in a layout are active
 *   - deletePreferencesByUser: Remove all preferences for a given user
 *
 * The model ensures data integrity and provides utility methods for managing system preferences.
 */

import type { DashboardWidgetConfig, Layout, SystemPreferencesDocument } from '@src/content/types';
import type { DatabaseResult } from '@src/databases/dbInterface';
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import { nowISODateString } from '@utils/dateUtils';

// System Logger
import { logger } from '@utils/logger';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
interface SystemPreferencesModelType extends Model<SystemPreferencesDocument> {
	getPreferenceByLayout(userId: string, layoutId: string): Promise<DatabaseResult<Layout | null>>;
	setPreference(
		userId: string,
		layoutId: string,
		layout: Layout,
		options?: {
			validateWidgets?: boolean;
			getActiveWidgets?: () => Promise<string[]>;
		}
	): Promise<DatabaseResult<{ layout: Layout; warnings?: string[] }>>;
	validateLayoutWidgets(layout: Layout, activeWidgets: string[]): { layout: Layout; warnings: string[] };
	deletePreferencesByUser(userId: string): Promise<DatabaseResult<number>>;
}

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
		gridPosition: { type: Number, required: false }, // Optional to match TypeScript types
		order: { type: Number, required: false } // Optional order field used by dashboard
	},
	{ _id: false }
);

// Layout schema
const LayoutSchema = new Schema({
	id: { type: String, required: true },
	name: { type: String, required: true },
	preferences: { type: [WidgetSchema], default: [] }
});

const SystemPreferencesSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() }, // UUID as per dbInterface.ts
		userId: { type: String, ref: 'auth_users', required: false }, // Optional userId for user-scoped preferences
		layoutId: { type: String, required: false }, // Optional layout identifier
		layout: { type: LayoutSchema, required: false }, // Optional structured layout data
		preferences: { type: Schema.Types.Mixed, default: {} }, // Generic key-value preferences
		scope: { type: String, enum: ['user', 'system', 'widget'], default: 'user' }, // Scope of the preference
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_preferences',
		strict: true, // Enforce strict schema validation
		_id: false // Disable Mongoose auto-ObjectId generation
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
			const query: any = { userId, layoutId, scope: 'user' };
			const doc = await this.findOne(query).lean().exec();
			if (!doc) {
				logger.debug(`No preference found for userId: ${userId}, layoutId: ${layoutId}`);
				return { success: true, data: null };
			}
			logger.debug(`Retrieved system preference for userId: ${userId}, layoutId: ${layoutId}`);
			return { success: true, data: doc.layout };
		} catch (error) {
			const message = `Failed to retrieve preference for userId: ${userId}, layoutId: ${layoutId}`;
			logger.error(`Error retrieving system preference for userId: ${userId}, layoutId: ${layoutId}`, error);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_GET_ERROR',
					message
				}
			};
		}
	},

	// Set preference for a specific layout with optional widget validation
	async setPreference(
		userId: string,
		layoutId: string,
		layout: Layout,
		options?: {
			validateWidgets?: boolean;
			getActiveWidgets?: () => Promise<string[]>;
		}
	): Promise<DatabaseResult<{ layout: Layout; warnings?: string[] }>> {
		try {
			let finalLayout = layout;
			const warnings: string[] = [];

			// Widget validation if requested and function provided
			if (options?.validateWidgets && options?.getActiveWidgets) {
				const activeWidgets = await options.getActiveWidgets();
				const validatedResult = (this as unknown as SystemPreferencesModelType).validateLayoutWidgets(layout, activeWidgets);
				finalLayout = validatedResult.layout;
				warnings.push(...validatedResult.warnings);
			}

			const query: any = { userId, layoutId, scope: 'user' };
			// The _id for the document should be a combination of userId and layoutId for uniqueness
			const documentId = `${userId}_${layoutId}`;
			await this.updateOne(query, { $set: { layout: finalLayout, _id: documentId } }, { upsert: true }).exec();
			logger.debug(`Set system preference for userId: ${userId}, layoutId: ${layoutId}`);

			return {
				success: true,
				data: { layout: finalLayout, warnings: warnings.length > 0 ? warnings : undefined }
			};
		} catch (error) {
			const message = `Failed to set preference for userId: ${userId}, layoutId: ${layoutId}`;
			logger.error(`Error setting system preference for userId: ${userId}, layoutId: ${layoutId}`, error);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_SET_ERROR',
					message
				}
			};
		}
	},

	// Validate widgets in a layout
	validateLayoutWidgets(layout: Layout, activeWidgets: string[]): { layout: Layout; warnings: string[] } {
		const warnings: string[] = [];
		const validatedPreferences: DashboardWidgetConfig[] = [];

		for (const widget of layout.preferences) {
			if (!activeWidgets.includes(widget.component)) {
				warnings.push(`Widget '${widget.component}' is not active, removing from layout`);
				continue;
			}
			validatedPreferences.push(widget);
		}

		return {
			layout: {
				...layout,
				preferences: validatedPreferences
			},
			warnings
		};
	},

	// Delete preferences for a user
	async deletePreferencesByUser(userId: string): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ userId, scope: 'user' }).exec();
			logger.info(`Deleted ${result.deletedCount} system preferences for userId: ${userId}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			const message = `Failed to delete preferences for userId: ${userId}`;
			logger.error(`Error deleting system preferences for userId: ${userId}`, error);
			return {
				success: false,
				message,
				error: {
					code: 'PREFERENCE_DELETE_ERROR',
					message
				}
			};
		}
	}
};

// Create and export the SystemPreferencesModel
export const SystemPreferencesModel =
	(mongoose.models?.SystemPreferences as unknown as SystemPreferencesModelType | undefined) ||
	(mongoose.model<SystemPreferencesDocument>('SystemPreferences', SystemPreferencesSchema) as unknown as SystemPreferencesModelType);
