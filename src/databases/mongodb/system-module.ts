/**
 * @file src/databases/mongodb/modules/system-module.ts
 * @description System management module for MongoDB.
 */

import { DatabaseModule } from "../core/base-adapter";
import type { ISystemAdapter, DatabaseResult, DatabaseId } from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { MongoCrudMethods } from "./crud-methods";

export class MongoSystemModule extends DatabaseModule<MongoAdapterCore> implements ISystemAdapter {
  private _methods: any = null;

  private async _getMethods() {
    if (this._methods) return this._methods;

    const { MongoSystemMethods } = await import("./system-methods");
    const { MongoThemeMethods } = await import("./theme-methods");
    const { MongoSystemVirtualFolderMethods } = await import("./system-virtual-folder-methods");
    const { MongoWidgetMethods } = await import("./widget-methods");

    const { MongoWebsiteTokenMethods } = await import("./website-token-methods");
    const { websiteTokenSchema } = await import("./website-token-methods"); // Merged pilot: schema now in methods file

    const SystemSettingModel = (this.adapter as any)._getOrCreateModel("SystemSetting");
    const SystemPreferencesModel = (this.adapter as any)._getOrCreateModel("SystemPreferences");
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
      preferences: new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel),
      themes: new MongoThemeMethods(ThemeModel),
      virtualFolder: new MongoSystemVirtualFolderMethods(),
      widgets: new MongoWidgetMethods(WidgetModel),
      websiteTokens: new MongoWebsiteTokenMethods(WebsiteTokenModel, this.adapter),
      tenants: {
        create: (t: any) => tenantRepo.insert(t),
        getById: (id: DatabaseId) => tenantRepo.findOne({ _id: id } as any),
        update: (id: DatabaseId, d: any) => tenantRepo.update(id, d),
        delete: (id: DatabaseId) => tenantRepo.delete(id),
        list: (o: any) => tenantRepo.findMany(o?.filter || {}, o),
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
            } as any,
          ),
        list: (o: any) => jobRepo.findMany(o?.filter || {}, o),
        count: (f: any) => jobRepo.count(f),
        update: (id: DatabaseId, d: any) => jobRepo.update(id, d),
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
    update: async (id: DatabaseId, data: any) => (await this._getMethods()).jobs.update(id, data),
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
