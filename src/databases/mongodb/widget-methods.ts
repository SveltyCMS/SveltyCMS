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

import type { DatabaseId, DatabaseResult, Widget } from "@src/databases/db-interface";
import { nowISODateString } from "@utils/date";
// System Logger
import { logger } from "@utils/logger";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";

// Widget schema
export const widgetSchema = new Schema<Widget>(
  {
    _id: { type: String, required: true, default: () => generateId() }, // UUID primary key
    name: { type: String, required: true, unique: true }, // Unique name for the widget
    isActive: { type: Boolean, default: false }, // Whether the widget is globally active
    instances: {
      type: Schema.Types.Mixed, // Structured configurations (supports atomic updates via dot notation)
      default: {},
    },
    dependencies: [String], // Widget identifiers of dependencies
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_widgets",
    strict: true, // Enforce strict schema validation
    _id: false, // Disable Mongoose auto-ObjectId generation
  },
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
      const message = "Failed to fetch widgets";
      logger.error(`Error fetching all widgets: ${err.message}`);
      return {
        success: false,
        message,
        error: { code: "WIDGET_FETCH_ERROR", message },
      };
    }
  },

  // Get active widgets.
  async getActiveWidgets(): Promise<DatabaseResult<string[]>> {
    try {
      const widgets = await this.find({ isActive: true }, "name").lean().exec();
      const activeWidgetNames = widgets.map((widget: Widget) => widget.name);
      return { success: true, data: activeWidgetNames };
    } catch (error) {
      const err = error as Error;
      const message = "Failed to fetch active widgets";
      logger.error(`Error fetching active widgets: ${err.message}`);
      return {
        success: false,
        message,
        error: { code: "ACTIVE_WIDGETS_FETCH_ERROR", message },
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
          error: { code: "WIDGET_NOT_FOUND", message },
        };
      }

      // If already active, return success (idempotent operation)
      if (widget.isActive) {
        logger.info(`Widget "${widgetName}" is already active.`);
        return { success: true, data: undefined };
      }

      // Activate the widget
      await this.updateOne(
        { name: widgetName },
        { $set: { isActive: true, updatedAt: nowISODateString() } },
      ).exec();
      logger.info(`Widget "${widgetName}" activated successfully.`);
      return { success: true, data: undefined };
    } catch (error) {
      const err = error as Error;
      const message = `Failed to activate widget "${widgetName}"`;
      logger.error(`Error activating widget "${widgetName}": ${err.message}`);
      return {
        success: false,
        message,
        error: { code: "WIDGET_ACTIVATION_ERROR", message },
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
          error: { code: "WIDGET_NOT_FOUND", message },
        };
      }

      // If already inactive, return success (idempotent operation)
      if (!widget.isActive) {
        logger.info(`Widget "${widgetName}" is already inactive.`);
        return { success: true, data: undefined };
      }

      // Deactivate the widget
      await this.updateOne(
        { name: widgetName },
        { $set: { isActive: false, updatedAt: nowISODateString() } },
      ).exec();
      logger.info(`Widget "${widgetName}" deactivated successfully.`);
      return { success: true, data: undefined };
    } catch (error) {
      const err = error as Error;
      const message = `Failed to deactivate widget "${widgetName}"`;
      logger.error(`Error deactivating widget "${widgetName}": ${err.message}`);
      return {
        success: false,
        message,
        error: { code: "WIDGET_DEACTIVATION_ERROR", message },
      };
    }
  },

  // Update a widget's configuration
  async updateWidget(
    widgetName: string,
    updateData: Partial<Widget>,
  ): Promise<DatabaseResult<void>> {
    try {
      const result = await this.updateOne(
        { name: widgetName },
        { $set: { ...updateData, updatedAt: nowISODateString() } },
      ).exec();
      if (result.modifiedCount === 0) {
        const message = `Widget "${widgetName}" not found or no changes applied.`;
        return {
          success: false,
          message,
          error: { code: "WIDGET_NOT_FOUND", message },
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
        error: { code: "WIDGET_UPDATE_ERROR", message },
      };
    }
  },

  // Atomically update a specific widget instance configuration
  // Example: updateWidgetInstance('myWidget', 'dashboard-header', { color: 'blue', size: 'large' })
  async updateWidgetInstance(
    widgetName: string,
    instanceId: string,
    instanceConfig: Record<string, unknown>,
  ): Promise<DatabaseResult<void>> {
    try {
      // Use dot notation to atomically update a specific instance without fetching/parsing/writing
      // This prevents race conditions and is much more efficient
      const result = await this.updateOne(
        { name: widgetName },
        {
          $set: {
            [`instances.${instanceId}`]: instanceConfig,
            updatedAt: nowISODateString(),
          },
        },
      ).exec();

      if (result.matchedCount === 0) {
        const message = `Widget "${widgetName}" not found.`;
        return {
          success: false,
          message,
          error: { code: "WIDGET_NOT_FOUND", message },
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
        error: { code: "WIDGET_INSTANCE_UPDATE_ERROR", message },
      };
    }
  },
};

// Create and export the Widget model
export const WidgetModel =
  (mongoose.models?.Widget as Model<Widget> | undefined) ||
  mongoose.model<Widget>("Widget", widgetSchema);

// --- Merged from widget.ts (model + statics) into methods for file reduction pilot ---

/**
 * @file src/databases/mongodb/methods/widget-methods.ts
 * @description Widget registration and management for the MongoDB adapter.
 * Provides methods to create, read, update, and delete widgets,
 * as well as activate/deactivate them.
 */

import {
  CacheCategory,
  invalidateCategoryCache,
  invalidateCollectionCache,
  withCache,
} from "./mongodb-cache-utils";
import { createDatabaseError, generateId } from "./mongodb-utils";

// Define the model type for dependency injection.
type WidgetModelType = Model<Widget>;

export class MongoWidgetMethods {
  private readonly widgetModel: WidgetModelType;

  /**
   * Constructs the MongoWidgetMethods instance with an injected model.
   * @param {WidgetModelType} widgetModel - The Mongoose model for widgets.
   */
  constructor(widgetModel: WidgetModelType) {
    this.widgetModel = widgetModel;
    logger.trace("MongoWidgetMethods initialized.");
  }

  /**
   * Registers (creates) a new widget in the database.
   */
  async register(
    widgetData: Omit<Widget, "_id" | "createdAt" | "updatedAt">,
  ): Promise<DatabaseResult<Widget>> {
    try {
      const widgetWithId = {
        ...widgetData,
        _id: generateId(),
      };

      const { ...logData } = widgetWithId as any;
      if (logData.config) logData.config = "[REDACTED]";

      logger.debug(`[WidgetMethods] Registering widget "${widgetData.name}" to database`, {
        widgetId: widgetWithId._id,
        collection: this.widgetModel.collection.name,
        widgetData: logData,
      });

      const newWidget = new this.widgetModel(widgetWithId);
      const savedWidget = await newWidget.save();
      const result = savedWidget.toObject();

      logger.debug(`[WidgetMethods] Widget "${widgetData.name}" saved successfully`, {
        widgetId: result._id,
        isActive: result.isActive,
        collection: this.widgetModel.collection.name,
      });

      return { success: true, data: result as Widget };
    } catch (error: any) {
      logger.error(`[WidgetMethods] Failed to register widget "${widgetData.name}"`, {
        error: error.message,
        collection: this.widgetModel.collection.name,
      });
      return {
        success: false,
        message: "Failed to register widget",
        error: createDatabaseError(error, "WIDGET_REGISTER_FAILED", "Failed to register widget"),
      };
    }
  }

  /**
   * Finds a single widget by its ID.
   */
  async findById(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
    const cacheKey = `widget:id:${widgetId}`;
    try {
      return await withCache(
        cacheKey,
        async () => {
          const result = await this.widgetModel.findById(widgetId).lean().exec();
          if (!result) {
            throw { code: "NOT_FOUND", message: "Widget not found" };
          }
          return {
            success: true,
            data: result,
          } as DatabaseResult<Widget | null>;
        },
        { category: CacheCategory.WIDGET },
      );
    } catch (error: any) {
      if (error.code === "NOT_FOUND") {
        return { success: true, data: null };
      }
      return {
        success: false,
        message: "Failed to find widget",
        error: createDatabaseError(error, "WIDGET_FETCH_FAILED", "Failed to find widget"),
      };
    }
  }

  /**
   * Activates a widget, setting its `isActive` flag to true.
   */
  async activate(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
    try {
      const result = await this.widgetModel
        .findByIdAndUpdate(widgetId, { $set: { isActive: true } } as any, {
          returnDocument: "after",
        })
        .lean()
        .exec();

      if (!result) {
        return {
          success: false,
          message: "Widget not found",
          error: { code: "NOT_FOUND", message: "Widget not found" },
        };
      }

      const tenantId = (result as any).tenantId || null;
      await Promise.all([
        invalidateCollectionCache(`widget:id:${widgetId}`),
        cacheService.delete(`widget:active:${tenantId || "global"}`),
        invalidateCategoryCache(CacheCategory.WIDGET, tenantId),
      ]);

      return { success: true, data: result as Widget };
    } catch (error) {
      return {
        success: false,
        message: "Failed to activate widget",
        error: createDatabaseError(error, "WIDGET_UPDATE_FAILED", "Failed to activate widget"),
      };
    }
  }

  /**
   * Deactivates a widget, setting its `isActive` flag to false.
   */
  async deactivate(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
    try {
      const result = await this.widgetModel
        .findByIdAndUpdate(widgetId, { $set: { isActive: false } } as any, {
          returnDocument: "after",
        })
        .lean()
        .exec();

      if (!result) {
        return {
          success: false,
          message: "Widget not found",
          error: { code: "NOT_FOUND", message: "Widget not found" },
        };
      }

      const tenantId = (result as any).tenantId || null;
      await Promise.all([
        invalidateCollectionCache(`widget:id:${widgetId}`),
        cacheService.delete(`widget:active:${tenantId || "global"}`),
        invalidateCategoryCache(CacheCategory.WIDGET, tenantId),
      ]);

      return { success: true, data: result as Widget };
    } catch (error) {
      return {
        success: false,
        message: "Failed to deactivate widget",
        error: createDatabaseError(error, "WIDGET_UPDATE_FAILED", "Failed to deactivate widget"),
      };
    }
  }

  /**
   * Updates an existing widget with new data.
   */
  async update(
    widgetId: DatabaseId,
    widgetData: Partial<Omit<Widget, "_id">>,
  ): Promise<DatabaseResult<Widget | null>> {
    try {
      logger.debug("[widget-methods.update] Starting update", {
        widgetId,
        collection: this.widgetModel.collection.name,
      });

      const result = await this.widgetModel
        .findByIdAndUpdate(widgetId, { $set: widgetData } as any, {
          returnDocument: "after",
        })
        .lean()
        .exec();

      if (!result) {
        return {
          success: false,
          message: "Widget not found",
          error: { code: "NOT_FOUND", message: "Widget not found" },
        };
      }

      const tenantId = (result as any).tenantId || null;
      await Promise.all([
        invalidateCollectionCache(`widget:id:${widgetId}`),
        cacheService.delete(`widget:active:${tenantId || "global"}`),
        invalidateCategoryCache(CacheCategory.WIDGET, tenantId),
      ]);
      return { success: true, data: result as Widget };
    } catch (error: any) {
      logger.error("[widget-methods.update] Update failed", {
        widgetId,
        error: error.message,
      });
      return {
        success: false,
        message: "Failed to update widget",
        error: createDatabaseError(error, "WIDGET_UPDATE_FAILED", "Failed to update widget"),
      };
    }
  }

  /**
   * Deletes a widget from the database.
   */
  async delete(widgetId: DatabaseId): Promise<DatabaseResult<boolean>> {
    try {
      const doc = await this.widgetModel.findById(widgetId).lean().exec();
      const result = await this.widgetModel.findByIdAndDelete(widgetId).exec();

      if (doc) {
        const tenantId = (doc as any).tenantId || null;
        await Promise.all([
          invalidateCollectionCache(`widget:id:${widgetId}`),
          invalidateCategoryCache(CacheCategory.WIDGET, tenantId),
        ]);
      }

      return { success: true, data: !!result };
    } catch (error) {
      return {
        success: false,
        message: "Failed to delete widget",
        error: createDatabaseError(error, "WIDGET_DELETE_FAILED", "Failed to delete widget"),
      };
    }
  }

  /**
   * Retrieves all widgets from the database.
   */
  async findAll(): Promise<DatabaseResult<Widget[]>> {
    try {
      const widgets = await this.widgetModel.find().lean().exec();
      return { success: true, data: widgets as Widget[] };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get all widgets",
        error: createDatabaseError(error, "WIDGET_FETCH_ALL_FAILED", "Failed to get all widgets"),
      };
    }
  }

  /**
   * Retrieves all active widgets from the database.
   */
  async findAllActive(tenantId?: string | null): Promise<DatabaseResult<Widget[]>> {
    const queryTenantId = tenantId || null;
    try {
      return await withCache(
        `widget:active:${queryTenantId || "global"}`,
        async () => {
          const widgets = await this.widgetModel
            .find({ isActive: true, tenantId: queryTenantId } as any)
            .lean()
            .exec();

          return { success: true, data: widgets } as DatabaseResult<Widget[]>;
        },
        { category: CacheCategory.WIDGET, tenantId: queryTenantId },
      );
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get active widgets",
        error: createDatabaseError(
          error,
          "WIDGET_FETCH_ACTIVE_FAILED",
          "Failed to get active widgets",
        ),
      };
    }
  }

  /**
   * Alias for findAllActive, required by db-interface.ts
   */
  async getActiveWidgets(): Promise<DatabaseResult<Widget[]>> {
    return this.findAllActive();
  }
}
