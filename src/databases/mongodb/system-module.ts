/**
 * @file src/databases/mongodb/system-module.ts
 * @description Consolidated System management module for MongoDB.
 * Combines system settings, preferences, virtual folders, themes, widgets, and website tokens.
 */

import { DatabaseModule } from "../core/base-adapter";
import type { DatabaseId, DatabaseResult, ISystemAdapter } from "../db-interface";
import type { SystemPreferencesDocument } from "@src/content/types";
import { generateId } from "@src/databases/mongodb/mongodb-utils";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import mongoose, { type Model, Schema } from "mongoose";
import type { MongoAdapterCore } from "./adapter-core";
import { MongoCrudMethods } from "./crud-methods";
import { createDatabaseError } from "./mongodb-utils";
import { mediaSchema } from "./media";

export interface SystemSetting {
  _id: string;
  category: string;
  isGlobal?: boolean;
  key: string;
  scope: string;
  tenantId?: string | null;
  updatedAt?: string;
  value: unknown;
}

const SYSTEM_SETTING_SCHEMA = new Schema<SystemSetting>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    key: { type: String, required: true },
    tenantId: { type: String, default: null },
    value: { type: Schema.Types.Mixed, required: true },
    scope: { type: String, default: "system", index: true },
    category: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      index: true,
    },
    isGlobal: { type: Boolean, default: true },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_settings",
    strict: true,
    _id: false,
  },
);

SYSTEM_SETTING_SCHEMA.index({ key: 1, tenantId: 1 }, { unique: true });

export const systemSettingSchema = SYSTEM_SETTING_SCHEMA;

export const SystemSettingModel =
  (mongoose.models?.SystemSetting as mongoose.Model<SystemSetting> | undefined) ||
  mongoose.model<SystemSetting>("SystemSetting", systemSettingSchema);

export class MongoSystemMethods {
  private readonly SystemPreferencesModel: Model<SystemPreferencesDocument>;
  private readonly SystemSettingModel: Model<SystemSetting>;

  constructor(
    systemPreferencesModel: Model<SystemPreferencesDocument>,
    systemSettingModel: Model<SystemSetting>,
  ) {
    this.SystemPreferencesModel = systemPreferencesModel;
    this.SystemSettingModel = systemSettingModel;
  }

  async get<T>(
    key: string,
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<T | null>> {
    const scope = options.scope || "system";
    try {
      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        const setting = await this.SystemSettingModel.findOne({
          key,
          tenantId: queryTenantId,
        }).lean();
        return { success: true, data: setting ? (setting.value as T) : null };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_GET_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      const userPrefs = await this.SystemPreferencesModel.findOne(
        { userId: options.userId.toString() },
        { [`preferences.${key}`]: 1 },
      ).lean<{ preferences: Record<string, unknown> }>();

      if (!userPrefs?.preferences) {
        return { success: true, data: null };
      }

      const value = key
        .split(".")
        .reduce(
          (obj, k) => (obj && (obj as any)[k] !== undefined ? (obj as any)[k] : undefined),
          userPrefs.preferences as any,
        );

      return { success: true, data: (value as T) ?? null };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get preference '${key}'`,
        error: createDatabaseError(
          error,
          "PREFERENCE_GET_ERROR",
          `Failed to get preference '${key}'`,
        ),
      };
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      category?: string;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<void>> {
    try {
      const scope = options.scope || "system";
      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        const updateData: Record<string, unknown> = {
          value,
          updatedAt: new Date(),
          tenantId: queryTenantId,
        };
        if (options.category) {
          updateData.category = options.category;
        }
        await this.SystemSettingModel.updateOne(
          { key, tenantId: queryTenantId },
          { $set: updateData },
          { upsert: true },
        );
        return { success: true, data: undefined };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_SET_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      await this.SystemPreferencesModel.updateOne(
        { userId: options.userId.toString() },
        { $set: { [`preferences.${key}`]: value }, updatedAt: new Date() },
        { upsert: true },
      );
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: `Failed to set preference '${key}'`,
        error: createDatabaseError(
          error,
          "PREFERENCE_SET_ERROR",
          `Failed to set preference '${key}'`,
        ),
      };
    }
  }

  async delete(
    key: string,
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<void>> {
    try {
      const scope = options.scope || "system";
      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        const result = await this.SystemSettingModel.deleteOne({
          key,
          tenantId: queryTenantId,
        });
        if (result.deletedCount === 0) {
          logger.warn(
            `System setting '${key}' not found for deletion${queryTenantId ? ` in tenant ${queryTenantId}` : ""}.`,
          );
        }
        return { success: true, data: undefined };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_DELETE_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      const result = await this.SystemPreferencesModel.updateOne(
        { userId: options.userId.toString() },
        { $unset: { [`preferences.${key}`]: "" } },
      );

      if (result.modifiedCount === 0) {
        logger.warn(
          `User preference '${key}' not found for user '${options.userId}' during deletion.`,
        );
      }
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete preference '${key}'`,
        error: createDatabaseError(
          error,
          "PREFERENCE_DELETE_ERROR",
          `Failed to delete preference '${key}'`,
        ),
      };
    }
  }

  async getMany<T>(
    keys: string[],
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<Record<string, T>>> {
    try {
      if (keys.length === 0) {
        return { success: true, data: {} };
      }

      const scope = options.scope || "system";
      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        const settings = await this.SystemSettingModel.find({
          key: { $in: keys },
          tenantId: queryTenantId,
        }).lean();
        const result = settings.reduce(
          (acc, setting) => {
            acc[setting.key] = setting.value as T;
            return acc;
          },
          {} as Record<string, T>,
        );
        return { success: true, data: result };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_GET_MANY_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      const projection = keys.reduce(
        (acc, key) => {
          acc[`preferences.${key}`] = 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const userPrefs = await this.SystemPreferencesModel.findOne(
        { userId: options.userId.toString() },
        projection,
      ).lean<{ preferences: Record<string, T> }>();

      if (!userPrefs?.preferences) {
        return { success: true, data: {} };
      }

      const result = keys.reduce(
        (acc, key) => {
          if (key in userPrefs.preferences) {
            acc[key] = userPrefs.preferences[key];
          }
          return acc;
        },
        {} as Record<string, T>,
      );
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get multiple preferences",
        error: createDatabaseError(
          error,
          "PREFERENCE_GET_MANY_ERROR",
          "Failed to get multiple preferences",
        ),
      };
    }
  }

  async getByCategory<T>(
    category: string,
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<Record<string, T>>> {
    try {
      const scope = options.scope || "system";
      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        const settings = await this.SystemSettingModel.find({
          category,
          tenantId: queryTenantId,
        }).lean();
        const result = settings.reduce(
          (acc, setting) => {
            acc[setting.key] = setting.value as T;
            return acc;
          },
          {} as Record<string, T>,
        );
        return { success: true, data: result };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_GET_BY_CATEGORY_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      const userPrefs = await this.SystemPreferencesModel.findOne({
        userId: options.userId.toString(),
      }).lean<{ preferences?: Record<string, unknown> }>();

      if (!userPrefs?.preferences) {
        return { success: true, data: {} };
      }

      const result: Record<string, T> = {};
      const prefix = `${category}.`;
      for (const [key, val] of Object.entries(userPrefs.preferences)) {
        if (key.startsWith(prefix)) {
          result[key.slice(prefix.length)] = val as T;
        }
      }
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get preferences for category '${category}'`,
        error: createDatabaseError(
          error,
          "PREFERENCE_GET_BY_CATEGORY_ERROR",
          `Failed to get preferences for category '${category}'`,
        ),
      };
    }
  }

  async setMany<T>(
    preferences: Array<{
      key: string;
      value: T;
      scope?: "user" | "system";
      userId?: DatabaseId;
      category?: string;
    }>,
  ): Promise<DatabaseResult<void>> {
    try {
      if (preferences.length === 0) {
        return { success: true, data: undefined };
      }

      const systemPrefs = preferences.filter((p) => (p.scope || "system") === "system");
      const userPrefs = preferences.filter((p) => p.scope === "user");

      if (systemPrefs.length > 0) {
        const operations = systemPrefs.map((pref: any) => {
          const queryTenantId = pref.tenantId || null;
          const updateData: Record<string, unknown> = {
            value: pref.value,
            updatedAt: new Date().toISOString(),
            tenantId: queryTenantId,
          };
          if (pref.category) {
            updateData.category = pref.category;
          }
          return {
            updateOne: {
              filter: { key: pref.key, tenantId: queryTenantId },
              update: { $set: updateData },
              upsert: true,
            },
          };
        });
        await this.SystemSettingModel.bulkWrite(operations);
      }

      if (userPrefs.length > 0) {
        const prefsByUser = userPrefs.reduce(
          (acc, pref) => {
            if (!pref.userId) {
              throw createDatabaseError(
                new Error("MISSING_USER_ID"),
                "VALIDATION_ERROR",
                "User ID is required for user-scoped preferences.",
              );
            }
            const userIdStr = pref.userId.toString();
            if (!acc[userIdStr]) {
              acc[userIdStr] = [];
            }
            acc[userIdStr].push(pref);
            return acc;
          },
          {} as Record<string, typeof userPrefs>,
        );

        const operations = Object.entries(prefsByUser).map(([userIdStr, prefs]) => {
          const setFields = prefs.reduce(
            (acc, pref) => {
              acc[`preferences.${pref.key}`] = pref.value;
              return acc;
            },
            { updatedAt: new Date() } as Record<string, unknown>,
          );

          return {
            updateOne: {
              filter: { userId: userIdStr },
              update: { $set: setFields },
              upsert: true,
            },
          };
        });
        await this.SystemPreferencesModel.bulkWrite(operations);
      }
      return { success: true, data: undefined };
    } catch (error: any) {
      logger.error("❌ MongoDB setMany failed:", {
        error: error.message,
        code: error.code,
        writeErrors: error.writeErrors?.length,
        firstError: error.writeErrors?.[0]?.errmsg,
      });
      return {
        success: false,
        message: "Failed to set multiple preferences",
        error: createDatabaseError(
          error,
          "PREFERENCE_SET_MANY_ERROR",
          error.message || "Failed to set multiple preferences",
        ),
      };
    }
  }

  async deleteMany(
    keys: string[],
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<void>> {
    const scope = options.scope || "system";
    try {
      if (keys.length === 0) {
        return { success: true, data: undefined };
      }

      if (scope === "system") {
        const queryTenantId = options.tenantId || null;
        await this.SystemSettingModel.deleteMany({
          key: { $in: keys },
          tenantId: queryTenantId,
        });
        return { success: true, data: undefined };
      }

      if (!options.userId) {
        return {
          success: false,
          message: "User ID is required for user-scoped preferences.",
          error: createDatabaseError(
            new Error("Missing User ID"),
            "PREFERENCE_DELETE_MANY_ERROR",
            "User ID is required for user-scoped preferences.",
          ),
        };
      }

      const unsetFields = keys.reduce(
        (acc, key) => {
          acc[`preferences.${key}`] = "";
          return acc;
        },
        {} as Record<string, string>,
      );

      await this.SystemPreferencesModel.updateOne(
        { userId: options.userId.toString() },
        { $unset: unsetFields },
      );
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Failed to delete multiple preferences",
        error: createDatabaseError(
          error,
          "PREFERENCE_DELETE_MANY_ERROR",
          "Failed to delete multiple preferences",
        ),
      };
    }
  }

  async clear(
    options: {
      scope?: "user" | "system";
      userId?: DatabaseId;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<DatabaseResult<void>> {
    const scope = options.scope || "system";
    try {
      if (scope === "system") {
        const queryTenantId = options.tenantId === undefined ? null : options.tenantId;
        await this.SystemSettingModel.deleteMany({ tenantId: queryTenantId });
        return { success: true, data: undefined };
      }

      if (!options.userId && !options.tenantId) {
        return {
          success: false,
          message:
            "User ID or Tenant ID is required for user-scoped clear operation to prevent global data loss.",
          error: {
            code: "SECURITY_BLOCK",
            message: "Global user preference purge rejected",
          },
        };
      }

      if (options.userId) {
        await this.SystemPreferencesModel.deleteMany({
          userId: options.userId.toString(),
        });
      } else if (options.tenantId !== undefined) {
        await this.SystemPreferencesModel.deleteMany({
          tenantId: options.tenantId,
        });
      } else {
        return {
          success: false,
          message: "Invalid arguments for user-scoped clear operation.",
          error: {
            code: "INVALID_ARGUMENTS",
            message: "Either User ID or Tenant ID must be provided for user-scoped clear.",
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear ${scope} preferences`,
        error: createDatabaseError(
          error,
          "PREFERENCES_CLEAR_ERROR",
          `Failed to clear ${scope} preferences`,
        ),
      };
    }
  }
}

export class MongoSystemModule extends DatabaseModule<MongoAdapterCore> implements ISystemAdapter {
  private _methods: any = null;

  private async _getMethods() {
    if (this._methods) return this._methods;

    const { MongoThemeMethods } = await import("./theme");
    const { MongoSystemVirtualFolderMethods, systemVirtualFolderSchema } =
      await import("./system-virtual-folder");
    const { MongoWidgetMethods } = await import("./widget");
    const { MongoWebsiteTokenMethods, websiteTokenSchema } = await import("./website-token");

    const SystemSettingModelLocal = (this.adapter as any)._getOrCreateModel(
      "SystemSetting",
      systemSettingSchema,
    );
    const SystemPreferencesModelLocal = (this.adapter as any)._getOrCreateModel(
      "SystemPreferences",
    );
    const ThemeModel = (this.adapter as any)._getOrCreateModel("Theme");
    const WidgetModel = (this.adapter as any)._getOrCreateModel("Widget");
    const TenantModel = (this.adapter as any)._getOrCreateModel("Tenant");
    const JobModel = (this.adapter as any)._getOrCreateModel("Job");
    const WebsiteTokenModel = (this.adapter as any)._getOrCreateModel(
      "WebsiteToken",
      websiteTokenSchema,
    );

    const tenantRepo = new MongoCrudMethods(TenantModel, this.adapter);
    const jobRepo = new MongoCrudMethods(JobModel, this.adapter);

    this._methods = {
      preferences: new MongoSystemMethods(SystemPreferencesModelLocal, SystemSettingModelLocal),
      themes: new MongoThemeMethods(ThemeModel),
      virtualFolder: new MongoSystemVirtualFolderMethods(
        (this.adapter as any)._getOrCreateModel("SystemVirtualFolder", systemVirtualFolderSchema),
        (this.adapter as any)._getOrCreateModel("media", mediaSchema),
      ),
      widgets: new MongoWidgetMethods(WidgetModel),
      websiteTokens: new MongoWebsiteTokenMethods(WebsiteTokenModel, this.adapter),
      tenants: {
        create: (t: any) => tenantRepo.insert(t),
        getById: (id: DatabaseId) => tenantRepo.findOne({ _id: id } as any),
        update: (id: DatabaseId, d: any) => tenantRepo.update(id, d),
        delete: (id: DatabaseId) => tenantRepo.delete(id),
        list: (o: any) =>
          tenantRepo.findMany(o?.filter || {}, { ...o, systemScope: o?.systemScope }),
      },
      jobs: {
        create: (j: any) => jobRepo.insert(j),
        getById: (id: DatabaseId) => jobRepo.findOne({ _id: id } as any),
        getNextReady: (limit: number, options?: any) =>
          jobRepo.findMany(
            {
              status: "pending",
              nextRunAt: { $lte: new Date().toISOString() },
            } as any,
            {
              limit,
              tenantId: options?.tenantId,
              bypassTenantCheck: options?.bypassTenantCheck,
              systemScope: options?.systemScope,
            } as any,
          ),
        list: (o: any) => jobRepo.findMany(o?.filter || {}, o),
        count: (f: any) => jobRepo.count(f),
        update: (id: DatabaseId, d: any, o?: any) => jobRepo.update(id, d, o),
        delete: (id: DatabaseId) => jobRepo.delete(id),
        cleanup: async (olderThan: Date) => {
          const res = await jobRepo.deleteMany(
            { createdAt: { $lt: olderThan.toISOString() } } as any,
            { permanent: true },
          );
          return res.success ? { success: true, data: res.data.deletedCount } : (res as any);
        },
      },
    };
    return this._methods;
  }

  preferences = {
    get: async <T>(
      key: string,
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<T | null>> =>
      (await this._getMethods()).preferences.get(key, options),

    getMany: async <T>(
      keys: string[],
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<Record<string, T>>> =>
      (await this._getMethods()).preferences.getMany(keys, options),

    getByCategory: async <T>(
      category: string,
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<Record<string, T>>> =>
      (await this._getMethods()).preferences.getByCategory(category, options),

    set: async <T>(
      key: string,
      value: T,
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        category?: string;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.set(key, value, options),

    setMany: async <T>(
      prefs: Array<{
        key: string;
        value: T;
        scope?: "user" | "system";
        userId?: DatabaseId;
        category?: string;
      }>,
      options: {
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.setMany(prefs, options),

    delete: async (
      key: string,
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<void>> => (await this._getMethods()).preferences.delete(key, options),

    deleteMany: async (
      keys: string[],
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.deleteMany(keys, options),

    clear: async (
      options: {
        scope?: "user" | "system";
        userId?: DatabaseId;
        tenantId?: DatabaseId | null;
      } = {},
    ): Promise<DatabaseResult<void>> => (await this._getMethods()).preferences.clear(options),
  };

  tenants = {
    create: async (tenant: any) => (await this._getMethods()).tenants.create(tenant),
    getById: async (id: DatabaseId) => (await this._getMethods()).tenants.getById(id),
    update: async (id: DatabaseId, data: any) =>
      (await this._getMethods()).tenants.update(id, data),
    delete: async (id: DatabaseId) => (await this._getMethods()).tenants.delete(id),
    list: async (options?: any) => (await this._getMethods()).tenants.list(options),
  };

  themes = {
    setupThemeModels: async (options?: any) =>
      (await this._getMethods()).themes.setupThemeModels(options),
    getActive: async (options?: any) => (await this._getMethods()).themes.getActive(options),
    setDefault: async (themeId: DatabaseId, options?: any) =>
      (await this._getMethods()).themes.setDefault(themeId, options),
    install: async (theme: any, options?: any) =>
      (await this._getMethods()).themes.install(theme, options),
    uninstall: async (themeId: DatabaseId, options?: any) =>
      (await this._getMethods()).themes.uninstall(themeId, options),
    update: async (themeId: DatabaseId, theme: any, options?: any) =>
      (await this._getMethods()).themes.update(themeId, theme, options),
    getAllThemes: async (options?: any) => {
      const r = await (await this._getMethods()).themes.getAllThemes(options);
      return Array.isArray(r) ? r : ((r as any)?.data ?? r);
    },
    storeThemes: async (themes: any[], options?: any) =>
      (await this._getMethods()).themes.storeThemes(themes, options),
    ensure: async (theme: any, options?: any) => {
      const r = await (await this._getMethods()).themes.ensure(theme, options);
      return (r as any)?.data !== undefined ? (r as any).data : r;
    },
    getDefaultTheme: async (options?: any) =>
      (await this._getMethods()).themes.getDefaultTheme(
        options && typeof options === "object" && !Array.isArray(options)
          ? options
          : { tenantId: options },
      ),
  };

  widgets = {
    setupWidgetModels: async () => (await this._getMethods()).widgets.setupWidgetModels(),
    register: async (widget: any) => (await this._getMethods()).widgets.register(widget),
    findAll: async () => (await this._getMethods()).widgets.findAll(),
    getActiveWidgets: async () => (await this._getMethods()).widgets.getActiveWidgets(),
    activate: async (widgetId: DatabaseId) => (await this._getMethods()).widgets.activate(widgetId),
    deactivate: async (widgetId: DatabaseId) =>
      (await this._getMethods()).widgets.deactivate(widgetId),
    update: async (widgetId: DatabaseId, widget: any) =>
      (await this._getMethods()).widgets.update(widgetId, widget),
    delete: async (widgetId: DatabaseId) => (await this._getMethods()).widgets.delete(widgetId),
  };

  jobs = {
    create: async (job: any) => (await this._getMethods()).jobs.create(job),
    getById: async (id: DatabaseId) => (await this._getMethods()).jobs.getById(id),
    getNextReady: async (limit?: number, options?: any) =>
      (await this._getMethods()).jobs.getNextReady(limit, options),
    list: async (options?: any) => (await this._getMethods()).jobs.list(options),
    count: async (filter?: any) => (await this._getMethods()).jobs.count(filter),
    update: async (id: DatabaseId, data: any, options?: any) =>
      (await this._getMethods()).jobs.update(id, data, options),
    delete: async (id: DatabaseId) => (await this._getMethods()).jobs.delete(id),
    cleanup: async (olderThan: Date) => (await this._getMethods()).jobs.cleanup(olderThan),
  };

  virtualFolder = {
    create: async (folder: any, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.create(folder, tenantId),
    getById: async (id: DatabaseId, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.getById(id, tenantId),
    getByParentId: async (parentId: DatabaseId | null, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.getByParentId(parentId, tenantId),
    getAll: async (tenantId?: any) => (await this._getMethods()).virtualFolder.getAll(tenantId),
    update: async (id: DatabaseId, data: any, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.update(id, data, tenantId),
    addToFolder: async (contentId: DatabaseId, path: string, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.addToFolder(contentId, path, tenantId),
    getContents: async (path: string, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.getContents(path, tenantId),
    ensure: async (folder: any, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.ensure(folder, tenantId),
    delete: async (id: DatabaseId, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.delete(id, tenantId),
    exists: async (path: string, tenantId?: any) =>
      (await this._getMethods()).virtualFolder.exists(path, tenantId),
  };

  websiteTokens = {
    create: async (token: any, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.create(token, tenantId),
    getAll: async (options: any, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.getAll(options, tenantId),
    getByName: async (name: string, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.getByName(name, tenantId),
    getByToken: async (token: string, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.getByToken(token, tenantId),
    getByTokenHash: async (tokenHash: string, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.getByTokenHash(tokenHash, tenantId),
    getById: async (id: DatabaseId, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.getById(id, tenantId),
    delete: async (id: DatabaseId, tenantId?: any) =>
      (await this._getMethods()).websiteTokens.delete(id, tenantId),
  };

  public readonly health = {
    getUpdateStatus: async (): Promise<
      DatabaseResult<{ updateAvailable: boolean; latestVersion?: string }>
    > => {
      return {
        success: true,
        data: {
          updateAvailable: false,
        },
      };
    },
  };
}
