/**
 * @file src/databases/mongodb/models/widget.ts
 * @description MongoDB schema and model for Widgets.
 *
 * This module defines a schema and model for widgets in the CMS.
 * Widgets are reusable components that can be placed in different areas of the site
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { Widget, DatabaseResult } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Widget schema
export const widgetSchema = new Schema<Widget>(
	{
		_id: { type: String, required: true }, // UUID as per dbInterface.ts
		name: { type: String, required: true, unique: true }, // Unique name for the widget
		isActive: { type: Boolean, default: false }, // Whether the widget is globally active
		instances: {
			type: Map,
			of: Object, // Store configurations for widget instances (type-safe if needed)
			default: {}
		},
		dependencies: [String], // Widget identifiers of dependencies
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_widgets',
		strict: true // Enforce strict schema validation
	}
);

// Indexes
widgetSchema.index({ isActive: 1 }); // Index for active widgets

// Static methods
widgetSchema.statics = {
	// Get all widgets.
	async getAllWidgets(): Promise<DatabaseResult<Widget[]>> {
		try {
			const widgets = await this.find().lean().exec();
			return { success: true, data: widgets };
		} catch (error) {
			logger.error(`Error fetching all widgets: ${error.message}`);
			return {
				success: false,
				error: { code: 'WIDGET_FETCH_ERROR', message: 'Failed to fetch widgets' }
			};
		}
	},

	// Get active widgets.
	async getActiveWidgets(): Promise<DatabaseResult<string[]>> {
		try {
			const widgets = await this.find({ isActive: true }, 'name').lean().exec();
			const activeWidgetNames = widgets.map((widget) => widget.name);
			return { success: true, data: activeWidgetNames };
		} catch (error) {
			logger.error(`Error fetching active widgets: ${error.message}`);
			return {
				success: false,
				error: { code: 'ACTIVE_WIDGETS_FETCH_ERROR', message: 'Failed to fetch active widgets' }
			};
		}
	},

	// Activate a widget by its name
	async activateWidget(widgetName: string): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				return {
					success: false,
					error: {
						code: 'WIDGET_NOT_FOUND',
						message: `Widget "${widgetName}" not found or already active.`
					}
				};
			}
			logger.info(`Widget "${widgetName}" activated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error activating widget "${widgetName}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'WIDGET_ACTIVATION_ERROR',
					message: `Failed to activate widget "${widgetName}"`
				}
			};
		}
	},

	// Deactivate a widget by its name
	async deactivateWidget(widgetName: string): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				return {
					success: false,
					error: {
						code: 'WIDGET_NOT_FOUND',
						message: `Widget "${widgetName}" not found or already inactive.`
					}
				};
			}
			logger.info(`Widget "${widgetName}" deactivated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error deactivating widget "${widgetName}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'WIDGET_DEACTIVATION_ERROR',
					message: `Failed to deactivate widget "${widgetName}"`
				}
			};
		}
	},

	// Update a widget's configuration
	async updateWidget(widgetName: string, updateData: Partial<Widget>): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				return {
					success: false,
					error: {
						code: 'WIDGET_NOT_FOUND',
						message: `Widget "${widgetName}" not found or no changes applied.`
					}
				};
			}
			logger.info(`Widget "${widgetName}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error updating widget "${widgetName}": ${error.message}`);
			return {
				success: false,
				error: { code: 'WIDGET_UPDATE_ERROR', message: `Failed to update widget "${widgetName}"` }
			};
		}
	}
};

// Create and export the Widget model
export const WidgetModel = (mongoose.models?.Widget as Model<Widget> | undefined) || mongoose.model<Widget>('Widget', widgetSchema);
