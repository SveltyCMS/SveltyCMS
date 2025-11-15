/**
 * @file src/databases/mongodb/models/widget.ts
 * @description MongoDB schema and model for Widgets.
 *
 * This module defines a schema and model for widgets in the CMS.
 * Widgets are reusable components that can be placed in different areas of the site
 *
 * ### Features
 * - Schema definition with fields for name, isActive, instances, dependencies, and timestamps
 * - Indexes for efficient querying by isActive and name
 * - Static methods for common operations:
 *   - getAllWidgets: Retrieve all widgets
 *   - getActiveWidgets: Retrieve names of active widgets
 *   - activateWidget: Activate a widget by name
 *   - deactivateWidget: Deactivate a widget by name
 *   - updateWidget: Update a widget's configuration
 *   - updateWidgetInstance: Atomically update a specific widget instance configuration
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { Widget, DatabaseResult } from '@src/databases/dbInterface';
import { nowISODateString } from '@utils/dateUtils';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';

// System Logger
import { logger } from '@utils/logger';

// Widget schema
export const widgetSchema = new Schema<Widget>(
	{
		_id: { type: String, required: true, default: () => generateId() }, // UUID primary key
		name: { type: String, required: true, unique: true }, // Unique name for the widget
		isActive: { type: Boolean, default: false }, // Whether the widget is globally active
		instances: {
			type: Schema.Types.Mixed, // Structured configurations (supports atomic updates via dot notation)
			default: {}
		},
		dependencies: [String], // Widget identifiers of dependencies
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_widgets',
		strict: true, // Enforce strict schema validation
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// --- Indexes ---
// Compound indexes for common query patterns
widgetSchema.index({ isActive: 1, name: 1 }); // Active widget lookup
// Note: Unique index on 'name' is already created by the 'unique: true' field option (line 20)
widgetSchema.index({ isActive: 1, updatedAt: -1 }); // Recently modified active widgets

// Static methods
widgetSchema.statics = {
	// Get all widgets.
	async getAllWidgets(): Promise<DatabaseResult<Widget[]>> {
		try {
			const widgets = await this.find().lean().exec();
			return { success: true, data: widgets };
		} catch (error) {
			const err = error as Error;
			const message = 'Failed to fetch widgets';
			logger.error(`Error fetching all widgets: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_FETCH_ERROR', message }
			};
		}
	},

	// Get active widgets.
	async getActiveWidgets(): Promise<DatabaseResult<string[]>> {
		try {
			const widgets = await this.find({ isActive: true }, 'name').lean().exec();
			const activeWidgetNames = widgets.map((widget: Widget) => widget.name);
			return { success: true, data: activeWidgetNames };
		} catch (error) {
			const err = error as Error;
			const message = 'Failed to fetch active widgets';
			logger.error(`Error fetching active widgets: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'ACTIVE_WIDGETS_FETCH_ERROR', message }
			};
		}
	},

	// Activate a widget by its name
	async activateWidget(widgetName: string): Promise<DatabaseResult<void>> {
		try {
			// Check if widget exists first
			const widget = await this.findOne({ name: widgetName }).exec();
			if (!widget) {
				const message = `Widget "${widgetName}" not found in database.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}

			// If already active, return success (idempotent operation)
			if (widget.isActive) {
				logger.info(`Widget "${widgetName}" is already active.`);
				return { success: true, data: undefined };
			}

			// Activate the widget
			await this.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: nowISODateString() } }).exec();
			logger.info(`Widget "${widgetName}" activated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const err = error as Error;
			const message = `Failed to activate widget "${widgetName}"`;
			logger.error(`Error activating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_ACTIVATION_ERROR', message }
			};
		}
	},

	// Deactivate a widget by its name
	async deactivateWidget(widgetName: string): Promise<DatabaseResult<void>> {
		try {
			// Check if widget exists first
			const widget = await this.findOne({ name: widgetName }).exec();
			if (!widget) {
				const message = `Widget "${widgetName}" not found in database.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}

			// If already inactive, return success (idempotent operation)
			if (!widget.isActive) {
				logger.info(`Widget "${widgetName}" is already inactive.`);
				return { success: true, data: undefined };
			}

			// Deactivate the widget
			await this.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: nowISODateString() } }).exec();
			logger.info(`Widget "${widgetName}" deactivated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const err = error as Error;
			const message = `Failed to deactivate widget "${widgetName}"`;
			logger.error(`Error deactivating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_DEACTIVATION_ERROR', message }
			};
		}
	},

	// Update a widget's configuration
	async updateWidget(widgetName: string, updateData: Partial<Widget>): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: nowISODateString() } }).exec();
			if (result.modifiedCount === 0) {
				const message = `Widget "${widgetName}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}
			logger.info(`Widget "${widgetName}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const err = error as Error;
			const message = `Failed to update widget "${widgetName}"`;
			logger.error(`Error updating widget "${widgetName}": ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_UPDATE_ERROR', message }
			};
		}
	},

	// Atomically update a specific widget instance configuration
	// Example: updateWidgetInstance('myWidget', 'dashboard-header', { color: 'blue', size: 'large' })
	async updateWidgetInstance(widgetName: string, instanceId: string, instanceConfig: Record<string, unknown>): Promise<DatabaseResult<void>> {
		try {
			// Use dot notation to atomically update a specific instance without fetching/parsing/writing
			// This prevents race conditions and is much more efficient
			const result = await this.updateOne(
				{ name: widgetName },
				{
					$set: {
						[`instances.${instanceId}`]: instanceConfig,
						updatedAt: nowISODateString()
					}
				}
			).exec();

			if (result.matchedCount === 0) {
				const message = `Widget "${widgetName}" not found.`;
				return {
					success: false,
					message,
					error: { code: 'WIDGET_NOT_FOUND', message }
				};
			}

			logger.info(`Widget "${widgetName}" instance "${instanceId}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const err = error as Error;
			const message = `Failed to update widget instance "${instanceId}" for widget "${widgetName}"`;
			logger.error(`Error updating widget instance: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'WIDGET_INSTANCE_UPDATE_ERROR', message }
			};
		}
	}
};

// Create and export the Widget model
export const WidgetModel = (mongoose.models?.Widget as Model<Widget> | undefined) || mongoose.model<Widget>('Widget', widgetSchema);
