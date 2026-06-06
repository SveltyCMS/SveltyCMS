/**
 * @file src/databases/mongodb/methods/widget-methods.ts
 * @description Widget registration and management for the MongoDB adapter.
 * Provides methods to create, read, update, and delete widgets,
 * as well as activate/deactivate them.
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import type { Model } from "mongoose";
import type { DatabaseId, DatabaseResult, Widget as IWidget, Widget } from "../db-interface";
import {
  CacheCategory,
  invalidateCategoryCache,
  invalidateCollectionCache,
  withCache,
} from "./mongodb-cache-utils";
import { createDatabaseError, generateId } from "./mongodb-utils";

// Define the model type for dependency injection.
type WidgetModelType = Model<IWidget>;

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
