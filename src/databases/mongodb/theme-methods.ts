/**
 * @file src/databases/mongodb/methods/theme-methods.ts
 * @description Theme management for the MongoDB adapter.
 * This class uses Dependency Injection for the Mongoose model to ensure testability.
 */

import { logger } from "@utils/logger";
import type { Model } from "mongoose";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import type { DatabaseId, Theme, DatabaseResult } from "../db-interface";
import { CacheCategory, invalidateCategoryCache, withCache } from "./mongodb-cache-utils";
import { createDatabaseError } from "./mongodb-utils";

// Define the model type for dependency injection, making the class testable.
type ThemeModelType = Model<Theme>;

export class MongoThemeMethods {
  private readonly themeModel: ThemeModelType;

  /**
   * Constructs the MongoThemeMethods instance.
   * @param {ThemeModelType} themeModel - The Mongoose model for themes.
   */
  constructor(themeModel: ThemeModelType) {
    this.themeModel = themeModel;
    logger.trace("MongoThemeMethods initialized.");
  }

  /**
   * Retrieves the currently active theme.
   * Cached with 300s TTL since active theme is accessed on every page load
   * @returns {Promise<DatabaseResult<Theme | null>>} The active theme object or null if none is active.
   */
  async getActive(tenantId?: string | null): Promise<DatabaseResult<Theme | null>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const cacheKey = `theme:active:${effectiveTenantId === null ? "global" : effectiveTenantId}`;

    try {
      return await withCache(
        cacheKey,
        async () => {
          const theme = await this.themeModel
            .findOne({ isActive: true, tenantId: effectiveTenantId } as any)
            .lean()
            .exec();
          return { success: true, data: (theme as Theme) || null };
        },
        { category: CacheCategory.THEME, tenantId: effectiveTenantId },
      );
    } catch (error) {
      return {
        success: false,
        message: "Failed to get active theme",
        error: createDatabaseError(error, "THEME_FETCH_FAILED", "Failed to get active theme"),
      };
    }
  }

  /**
   * Retrieves the default theme.
   * @param {string} tenantId - Optional tenant ID.
   * @returns {Promise<DatabaseResult<Theme>>} The default theme.
   */
  async getDefaultTheme(tenantId?: string | null): Promise<DatabaseResult<Theme>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const cacheKey = `theme:default:${effectiveTenantId === null ? "global" : effectiveTenantId}`;

    return withCache(
      cacheKey,
      async () => {
        try {
          const theme = await this.themeModel
            .findOne({ isDefault: true, tenantId: effectiveTenantId } as any)
            .lean()
            .exec();
          if (!theme) {
            return {
              success: false,
              message: "Default theme not found",
              error: {
                code: "THEME_NOT_FOUND",
                message: "Default theme not found",
              },
            };
          }
          return { success: true, data: theme as Theme };
        } catch (error) {
          return {
            success: false,
            message: "Failed to get default theme",
            error: createDatabaseError(error, "THEME_FETCH_FAILED", "Failed to get default theme"),
          };
        }
      },
      { category: CacheCategory.THEME, tenantId: effectiveTenantId },
    );
  }

  // Wrapper methods to match DatabaseResult interface requirement if needed by IDBAdapter
  async getActiveTheme(tenantId?: string | null): Promise<DatabaseResult<Theme>> {
    const result = await this.getActive(tenantId);
    if (!result.success || !result.data) {
      return {
        success: false,
        message: "Active theme not found",
        error: { code: "THEME_NOT_FOUND", message: "Active theme not found" },
      };
    }
    return { success: true, data: result.data };
  }

  /**
   * Retrieves all themes from the database, sorted by order.
   * Cached with 300s TTL since theme list is frequently accessed in admin UI
   * @returns {Promise<DatabaseResult<Theme[]>>} An array of theme objects.
   */
  async getAllThemes(tenantId?: string | null): Promise<DatabaseResult<Theme[]>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const cacheKey = `theme:all:${effectiveTenantId === null ? "global" : effectiveTenantId}`;

    try {
      return await withCache(
        cacheKey,
        async () => {
          const themes = await this.themeModel
            .find({ tenantId: effectiveTenantId } as any)
            .sort({ order: 1 })
            .lean()
            .exec();
          return { success: true, data: themes as Theme[] };
        },
        { category: CacheCategory.THEME, tenantId: effectiveTenantId },
      );
    } catch (error) {
      return {
        success: false,
        message: "Failed to get all themes",
        error: createDatabaseError(error, "THEME_FETCH_ALL_FAILED", "Failed to get all themes"),
      };
    }
  }

  /**
   * Retrieves a specific theme by name.
   * @param {string} themeName - The name of the theme to retrieve.
   * @param {string} [tenantId] - Optional tenant ID.
   * @returns {Promise<DatabaseResult<Theme | null>>} The theme object or null if not found.
   */
  async getTheme(
    themeName: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<Theme | null>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const cacheKey = `theme:${themeName}:${effectiveTenantId === null ? "global" : effectiveTenantId}`;

    return withCache(
      cacheKey,
      async () => {
        try {
          const theme = await this.themeModel
            .findOne({ name: themeName, tenantId: effectiveTenantId } as any)
            .lean()
            .exec();
          return { success: true, data: (theme as Theme) || null };
        } catch (error) {
          return {
            success: false,
            message: `Failed to get theme ${themeName}`,
            error: createDatabaseError(error, "THEME_FETCH_FAILED", "Failed to fetch theme"),
          };
        }
      },
      { category: CacheCategory.THEME, tenantId: effectiveTenantId },
    );
  }

  /**
   * Stores multiple themes in the database.
   * @param {Theme[]} themes - The themes to store.
   */
  async storeThemes(themes: Theme[]): Promise<DatabaseResult<void>> {
    try {
      for (const theme of themes) {
        await this.installOrUpdate(theme);
      }
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Failed to store themes",
        error: createDatabaseError(error, "THEME_STORE_FAILED", "Failed to store themes"),
      };
    }
  }

  /**
   * Placeholder for setupThemeModels if needed.
   */
  async setupThemeModels(tenantId?: string | null): Promise<DatabaseResult<void>> {
    logger.trace(`setupThemeModels called (MongoDB) for tenant: ${tenantId || "global"}`);
    return { success: true, data: undefined };
  }

  /**
   * Sets a specific theme as the active one. This will deactivate any other active theme.
   * @param {DatabaseId} themeId The ID of the theme to activate.
   * @returns {Promise<DatabaseResult<Theme | null>>} The updated theme object or null if not found.
   */
  async setActive(
    themeId: DatabaseId,
    tenantId?: string | null,
  ): Promise<DatabaseResult<Theme | null>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const result = await this._setUniqueFlag(themeId, "isActive", effectiveTenantId);
    await invalidateCategoryCache(CacheCategory.THEME, effectiveTenantId);
    return result;
  }

  /**
   * Sets a specific theme as the default one. This will unset any other default theme.
   * @param {DatabaseId} themeId The ID of the theme to set as default.
   * @returns {Promise<DatabaseResult<Theme | null>>} The updated theme object or null if not found.
   */
  async setDefault(
    themeId: DatabaseId,
    tenantId?: string | null,
  ): Promise<DatabaseResult<Theme | null>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    const result = await this._setUniqueFlag(themeId, "isDefault", effectiveTenantId);
    await invalidateCategoryCache(CacheCategory.THEME, effectiveTenantId);
    return result;
  }

  /**
   * Installs (creates) a new theme in the database.
   * @param {Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>} themeData - The theme data to install.
   * @returns {Promise<DatabaseResult<Theme>>} The newly created theme object.
   */
  async install(
    themeData: Omit<Theme, "_id" | "createdAt" | "updatedAt">,
  ): Promise<DatabaseResult<Theme>> {
    try {
      const newTheme = new this.themeModel(themeData);
      const savedTheme = await newTheme.save();
      await invalidateCategoryCache(CacheCategory.THEME, (themeData as any).tenantId || null);
      return { success: true, data: savedTheme.toObject() };
    } catch (error) {
      return {
        success: false,
        message: "Failed to install theme",
        error: createDatabaseError(error, "THEME_INSTALL_FAILED", "Failed to install theme"),
      };
    }
  }

  /**
   * Ensures a theme exists in the database.
   * Atomic upsert: query by name, only insert if not exists.
   * @param {Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>} themeData - The theme data.
   * @returns {Promise<DatabaseResult<Theme>>} The theme object.
   */
  async ensure(
    themeData: Omit<Theme, "_id" | "createdAt" | "updatedAt">,
  ): Promise<DatabaseResult<Theme>> {
    try {
      const {
        _id,
        createdAt: _,
        updatedAt: __,
        ...rest
      } = themeData as unknown as Record<string, unknown>;
      const result = await this.themeModel
        .findOneAndUpdate(
          { name: themeData.name, tenantId: (themeData as any).tenantId || null } as any,
          { $setOnInsert: { ...rest, _id: _id || uuidv4().replace(/-/g, "") } },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        )
        .lean()
        .exec();

      await invalidateCategoryCache(CacheCategory.THEME, (themeData as any).tenantId || null);
      return { success: true, data: result as Theme };
    } catch (error) {
      return {
        success: false,
        message: "Failed to ensure theme",
        error: createDatabaseError(error, "THEME_ENSURE_FAILED", "Failed to ensure theme"),
      };
    }
  }

  /**
   * Installs or updates a theme using atomic upsert operation.
   * @param {Theme} themeData - The complete theme data including _id.
   * @returns {Promise<DatabaseResult<Theme>>} The created or updated theme object.
   */
  async installOrUpdate(themeData: Theme): Promise<DatabaseResult<Theme>> {
    try {
      const result = await this.themeModel
        .findOneAndUpdate({ _id: themeData._id } as any, themeData, {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        })
        .lean()
        .exec();

      await invalidateCategoryCache(CacheCategory.THEME, themeData.tenantId || null);
      return { success: true, data: result as Theme };
    } catch (error) {
      return {
        success: false,
        message: "Failed to install or update theme",
        error: createDatabaseError(
          error,
          "THEME_UPSERT_FAILED",
          "Failed to install or update theme",
        ),
      };
    }
  }

  /**
   * Uninstalls (deletes) a theme from the database.
   * @param {DatabaseId} themeId - The ID of the theme to uninstall.
   * @returns {Promise<DatabaseResult<boolean>>} True if a theme was deleted, false otherwise.
   */
  async uninstall(themeId: DatabaseId): Promise<DatabaseResult<boolean>> {
    try {
      const doc = await this.themeModel.findById(themeId).lean().exec();
      const result = await this.themeModel.findByIdAndDelete(themeId).exec();
      if (doc) {
        await invalidateCategoryCache(CacheCategory.THEME, doc.tenantId || null);
      }
      return { success: true, data: !!result };
    } catch (error) {
      return {
        success: false,
        message: "Failed to uninstall theme",
        error: createDatabaseError(error, "THEME_UNINSTALL_FAILED", "Failed to uninstall theme"),
      };
    }
  }

  /**
   * Updates an existing theme's data.
   * @param {DatabaseId} themeId - The ID of the theme to update.
   * @param {Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>} themeData - The fields to update.
   * @returns {Promise<DatabaseResult<Theme | null>>} The updated theme object, or null if not found.
   */
  async update(
    themeId: DatabaseId,
    themeData: Partial<Omit<Theme, "_id" | "createdAt" | "updatedAt">>,
    tenantId?: string | null,
  ): Promise<DatabaseResult<Theme | null>> {
    try {
      const effectiveTenantId = tenantId === undefined ? null : tenantId;
      const result = await this.themeModel
        .findOneAndUpdate(
          { _id: themeId, tenantId: effectiveTenantId } as any,
          { $set: { ...themeData, updatedAt: new Date() } },
          { returnDocument: "after" },
        )
        .lean()
        .exec();

      await invalidateCategoryCache(CacheCategory.THEME, effectiveTenantId);
      return { success: true, data: (result as Theme) || null };
    } catch (error) {
      return {
        success: false,
        message: "Failed to update theme",
        error: createDatabaseError(error, "THEME_UPDATE_FAILED", "Failed to update theme"),
      };
    }
  }

  /**
   * A private helper to atomically set a unique boolean flag on a document.
   */
  private async _setUniqueFlag(
    themeId: DatabaseId,
    flag: "isActive" | "isDefault",
    tenantId?: string | null,
  ): Promise<DatabaseResult<Theme | null>> {
    const effectiveTenantId = tenantId === undefined ? null : tenantId;
    try {
      await this.themeModel.bulkWrite([
        {
          updateMany: {
            filter: { _id: { $ne: themeId }, tenantId: effectiveTenantId } as any,
            update: { $set: { [flag]: false } },
          },
        },
        {
          updateOne: {
            filter: { _id: themeId, tenantId: effectiveTenantId } as any,
            update: { $set: { [flag]: true } },
          },
        },
      ]);

      const updatedTheme = await this.themeModel
        .findOne({ _id: themeId, tenantId: effectiveTenantId } as any)
        .lean()
        .exec();
      return { success: true, data: (updatedTheme as Theme) || null };
    } catch (error) {
      return {
        success: false,
        message: `Failed to set the '${flag}' flag`,
        error: createDatabaseError(
          error,
          "THEME_FLAG_UPDATE_FAILED",
          `Failed to set the '${flag}' flag for theme ${themeId} in tenant ${effectiveTenantId || "global"}`,
        ),
      };
    }
  }
}
