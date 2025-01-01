/**
 * @file src/databases/mongodb/models/widget.ts
 * @description MongoDB schema and model for Widgets.
 *
 * This module defines a schema and model for widgets in the CMS.
 * Widgets are reusable components that can be placed in different areas of the site.
 */

import { Schema } from 'mongoose';
import type { Widget } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Widget schema
export const widgetSchema = new Schema(
	{
		_id: { type: String, required: true },
		name: { type: String, required: true },
		type: { type: String, required: true },
		description: String,
		config: Schema.Types.Mixed,
		placement: {
			area: { type: String, required: true },
			order: { type: Number, default: 0 },
			conditions: [
				{
					type: { type: String },
					value: Schema.Types.Mixed
				}
			]
		},
		status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'inactive' },
		version: { type: String },
		author: String,
		permissions: {
			view: [String],
			edit: [String]
		},
		metadata: Schema.Types.Mixed,
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_widgets',
		strict: false
	}
);

// Add indexes
widgetSchema.index({ name: 1 }, { unique: true });
widgetSchema.index({ type: 1 });
widgetSchema.index({ status: 1 });
widgetSchema.index({ 'placement.area': 1, 'placement.order': 1 });

// Static methods
widgetSchema.statics = {
	// Create widget
	async createWidget(widgetData: {
		name: string;
		type: string;
		description?: string;
		config?: Schema.Types.Mixed;
		placement: {
			area: string;
			order?: number;
			conditions?: Array<{ type: string; value: Schema.Types.Mixed }>;
		};
		status?: 'active' | 'inactive' | 'draft';
		version?: string;
		author?: string;
		permissions?: {
			view?: string[];
			edit?: string[];
		};
		metadata?: Schema.Types.Mixed;
	}): Promise<Widget> {
		try {
			const widget = new this(widgetData);
			await widget.save();
			logger.info(`Created widget: ${widgetData.name}`);
			return widget;
		} catch (error) {
			logger.error(`Error creating widget: ${error.message}`);
			throw error;
		}
	},

	// Get all widgets
	async getAllWidgets(): Promise<Widget[]> {
		try {
			const widgets = await this.find().sort({ 'placement.order': 1 }).exec();
			logger.debug(`Retrieved ${widgets.length} widgets`);
			return widgets;
		} catch (error) {
			logger.error(`Error retrieving widgets: ${error.message}`);
			throw error;
		}
	},

	// Get widgets by area
	async getWidgetsByArea(area: string): Promise<Widget[]> {
		try {
			const widgets = await this.find({
				'placement.area': area,
				status: 'active'
			})
				.sort({ 'placement.order': 1 })
				.exec();
			logger.debug(`Retrieved ${widgets.length} widgets for area: ${area}`);
			return widgets;
		} catch (error) {
			logger.error(`Error retrieving widgets by area: ${error.message}`);
			throw error;
		}
	},

	// Get widget by name
	async getWidgetByName(name: string): Promise<Widget | null> {
		try {
			const widget = await this.findOne({ name }).exec();
			logger.debug(`Retrieved widget: ${name}`);
			return widget;
		} catch (error) {
			logger.error(`Error retrieving widget: ${error.message}`);
			throw error;
		}
	},

	// Update widget
	async updateWidget(name: string, updateData: Partial<Widget>): Promise<Widget | null> {
		try {
			const widget = await this.findOneAndUpdate({ name }, updateData, { new: true }).exec();
			if (widget) {
				logger.info(`Updated widget: ${name}`);
			} else {
				logger.warn(`Widget not found: ${name}`);
			}
			return widget;
		} catch (error) {
			logger.error(`Error updating widget: ${error.message}`);
			throw error;
		}
	},

	// Delete widget
	async deleteWidget(name: string): Promise<boolean> {
		try {
			const result = await this.findOneAndDelete({ name }).exec();
			if (result) {
				logger.info(`Deleted widget: ${name}`);
				return true;
			}
			logger.warn(`Widget not found for deletion: ${name}`);
			return false;
		} catch (error) {
			logger.error(`Error deleting widget: ${error.message}`);
			throw error;
		}
	},

	// Update widget order
	async updateWidgetOrder(area: string, orderUpdates: Array<{ name: string; order: number }>): Promise<boolean> {
		try {
			const bulkOps = orderUpdates.map((update) => ({
				updateOne: {
					filter: { name: update.name, 'placement.area': area },
					update: { $set: { 'placement.order': update.order } }
				}
			}));

			const result = await this.bulkWrite(bulkOps);
			logger.info(`Updated order for ${result.modifiedCount} widgets in area: ${area}`);
			return result.modifiedCount === orderUpdates.length;
		} catch (error) {
			logger.error(`Error updating widget order: ${error.message}`);
			throw error;
		}
	}
};

// Create and export the Widget model
export const WidgetModel = mongoose.models?.Widget || mongoose.model<Widget>('Widget', widgetSchema);
