/**
 * @file src/databases/mongodb/models/widget.ts
 * @description MongoDB schema and model for Widgets.
 *
 * This module defines a schema and model for widgets in the CMS.
 * Widgets are reusable components that can be placed in different areas of the site.
 */


import mongoose, { Schema } from 'mongoose';
import type { Widget } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Widget schema 
import type { DatabaseId, ISODateString } from '@src/databases/dbInterface';

export const widgetSchema = new Schema<Widget>(
  {
    _id: { type: DatabaseId, required: true }, // Using String type for _id as in dbInterface, refine to DatabaseId
    name: { type: String, required: true, unique: true }, // Unique name/identifier for widget type
    identifier: { type: String, required: true, unique: true }, // Unique identifier (e.g., 'core/input', 'custom/my-widget')
    isActive: { type: Boolean, default: false }, // Is the widget globally active?
    instances: [{ // WidgetConfig[] - Array of widget instance configurations
      position: { type: String },
      settings: { // WidgetSettings
        layout: String,
        colorScheme: String,
      },
    }],
    dependencies: [String], // Widget identifiers of dependencies
    isCore: { type: Boolean, default: false }, // Is it a core widget?
  },
  {
    timestamps: true,
    collection: 'system_widgets',
    strict: false // Allow for potential extra fields in config and widget
  }
);

// Indexes (Simplified - adjust based on common queries)
widgetSchema.index({ name: 1 }); // Index on name/identifier for lookups
widgetSchema.index({ identifier: 1, isActive: 1 }); // Index for active widget retrieval

// Static methods (Simplified - focused on specialized queries if needed)
widgetSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, update, delete, and activate/deactivate
  // are primarily handled by the MongoDBAdapter using core CRUD methods.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get widget by name (identifier) - Keep for direct access if needed
  async getWidgetByIdentifier(identifier: string): Promise<Widget | null> {
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const result = await this.dbAdapter.queryBuilder<Widget>('Widget')
        .where({ identifier })
        .findOne();

      if (!result.success) {
        logger.error(`Error retrieving widget by identifier: ${identifier}: ${result.error?.message}`);
        return null;
      }
      const widget = result.data;
      logger.debug(`Retrieved widget by identifier: ${identifier}`);
      return widget;
    } catch (error) {
      logger.error(`Error retrieving widget by identifier: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations (Example - adjust if needed) ---
  // Example: Bulk activate widgets - Adjust or remove if not needed
  async bulkActivateWidgets(widgetIdentifiers: string[]): Promise<DatabaseResult<number>> { // Using DatabaseResult for consistency
    try {
      const result = await this.updateMany({ identifier: { $in: widgetIdentifiers } }, { isActive: true }).exec();
      logger.info(`Bulk activated ${result.modifiedCount} widgets.`);
      return { success: true, data: result.modifiedCount };
    } catch (error) {
      logger.error(`Error bulk activating widgets: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk activate widgets', details: error } as DatabaseError }; // Using DatabaseError type
    }
  },
};

// Create and export the Widget model
export const WidgetModel = (mongoose.models?.Widget as Model<Widget> | undefined) || mongoose.model<Widget>('Widget', widgetSchema);
