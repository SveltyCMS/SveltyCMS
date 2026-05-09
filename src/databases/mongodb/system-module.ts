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
    const { websiteTokenSchema } = await import("./website-token");

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
        getNextReady: (limit: number, tenantId?: string) =>
          jobRepo.findMany(
            { status: "pending", nextRunAt: { $lte: new Date().toISOString() } } as any,
            { limit, tenantId } as any,
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
      scope?: "user" | "system",
      userId?: DatabaseId,
    ): Promise<DatabaseResult<T | null>> =>
      (await this._getMethods()).preferences.get(key, scope, userId),
    getMany: async <T>(
      keys: string[],
      scope?: "user" | "system",
      userId?: DatabaseId,
    ): Promise<DatabaseResult<Record<string, T>>> =>
      (await this._getMethods()).preferences.getMany(keys, scope, userId),
    getByCategory: async <T>(
      category: string,
      scope?: "user" | "system",
      userId?: DatabaseId,
    ): Promise<DatabaseResult<Record<string, T>>> =>
      (await this._getMethods()).preferences.getByCategory(category, scope, userId),
    set: async <T>(
      key: string,
      value: T,
      scope?: "user" | "system",
      userId?: DatabaseId,
      category?: string,
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.set(key, value, scope, userId, category),
    setMany: async <T>(
      prefs: Array<{
        key: string;
        value: T;
        scope?: "user" | "system";
        userId?: DatabaseId;
        category?: string;
      }>,
    ): Promise<DatabaseResult<void>> => (await this._getMethods()).preferences.setMany(prefs),
    delete: async (
      key: string,
      scope?: "user" | "system",
      userId?: DatabaseId,
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.delete(key, scope, userId),
    deleteMany: async (
      keys: string[],
      scope?: "user" | "system",
      userId?: DatabaseId,
    ): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.deleteMany(keys, scope, userId),
    clear: async (scope?: "user" | "system", userId?: DatabaseId): Promise<DatabaseResult<void>> =>
      (await this._getMethods()).preferences.clear(scope, userId),
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
    setupThemeModels: async () => (await this._getMethods()).themes.setupThemeModels(),
    getActive: async () => (await this._getMethods()).themes.getActive(),
    setDefault: async (themeId: DatabaseId) =>
      (await this._getMethods()).themes.setDefault(themeId),
    install: async (theme: any) => (await this._getMethods()).themes.install(theme),
    uninstall: async (themeId: DatabaseId) => (await this._getMethods()).themes.uninstall(themeId),
    update: async (themeId: DatabaseId, theme: any) =>
      (await this._getMethods()).themes.update(themeId, theme),
    getAllThemes: async () =>
      (await this._getMethods()).themes.getAllThemes().then((r: any) => r.data),
    storeThemes: async (themes: any[]) => (await this._getMethods()).themes.storeThemes(themes),
    ensure: async (theme: any) =>
      (await this._getMethods()).themes.ensure(theme).then((r: any) => r.data),
    getDefaultTheme: async (tenantId?: any) =>
      (await this._getMethods()).themes.getDefaultTheme(tenantId),
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
    getNextReady: async (limit?: number, tenantId?: any) =>
      (await this._getMethods()).jobs.getNextReady(limit, tenantId),
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
    create: async (token: any) => (await this._getMethods()).websiteTokens.create(token),
    getAll: async (options: any) => (await this._getMethods()).websiteTokens.getAll(options),
    getByName: async (name: string) => (await this._getMethods()).websiteTokens.getByName(name),
    delete: async (id: DatabaseId) => (await this._getMethods()).websiteTokens.delete(id),
  };
}
