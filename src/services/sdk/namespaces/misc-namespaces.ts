/**
 * @file src/services/local-cms/misc-namespaces.ts
 * @description Miscellaneous namespaces for LocalCMS SDK.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "@utils/error-handling";
import { jobQueue } from "@src/services/background/jobs/job-queue-service";
import {
  fetchDrupalData,
  fetchWordPressData,
} from "@src/services/content/importer/source-adapters";
import { scaffoldCollectionSchema } from "@src/services/content/importer/scaffolder";
import { automationService } from "@src/services/background/automation/automation-service";
import { getHealthCheckReport } from "@src/stores/system/reporting";
import { reinitializeSystem } from "@src/databases/db";
import { aiService } from "@src/services/core/ai-service";
import * as settingsService from "@src/services/core/settings-service";
import { generateSecureToken } from "@utils/native-utils";
import { withTenant } from "@src/databases/core/db-adapter-wrapper";
import type {
  DatabaseId,
  IDBAdapter,
  ISODateString,
} from "@src/databases/db-interface";
import { MediaService } from "@utils/media/media-service.server";
import { type LocalApiOptions, type TokenOptions } from "./types";

abstract class BaseNamespace {
  constructor(protected _dbAdapter: IDBAdapter) {}
}

/**
 * Widgets Namespace
 */
export class WidgetsNamespace extends BaseNamespace {
  constructor(_dbAdapterOverride: IDBAdapter) {
    super(_dbAdapterOverride);
  }

  async getActiveWidgets() {
    if (!this._dbAdapter.system?.widgets?.getActiveWidgets)
      return { success: true, data: [] };
    return this._dbAdapter.system.widgets.getActiveWidgets();
  }

  async list(options: LocalApiOptions = {}) {
    const { tenantId = "default-tenant" } = options;
    const { widgets, getWidgetDependencies } =
      await import("@src/stores/widget-store.svelte.ts");
    await widgets.initialize(tenantId as string);
    const activeWidgetsResult =
      await this._dbAdapter.system.widgets.getActiveWidgets();
    const activeWidgetNames = (
      activeWidgetsResult.success ? activeWidgetsResult.data : []
    ).map((w: any) => (typeof w === "string" ? w : w.name));
    const widgetList = Object.entries(widgets.widgetFunctions).map(
      ([name, widgetFn]) => {
        const isActive = activeWidgetNames.includes(name);
        const isCore = widgets.coreWidgets.includes(name);
        const dependencies = getWidgetDependencies(name);
        const widget = widgetFn as unknown as Record<string, unknown>;
        return {
          name,
          icon:
            (widget.Icon as string) ||
            (isCore ? "mdi:puzzle" : "mdi:puzzle-plus"),
          description: (widget.Description as string) || "",
          isCore,
          isActive,
          dependencies,
          pillar: {
            definition: {
              name: widget.Name as string,
              description: widget.Description as string,
              icon: widget.Icon as string,
              guiSchema: widget.GuiSchema
                ? Object.keys(widget.GuiSchema as object).length
                : 0,
              aggregations: !!widget.aggregations,
            },
            input: {
              componentPath: (widget.__inputComponentPath as string) || "",
              exists: !!(widget.__inputComponentPath as string),
            },
            display: {
              componentPath: (widget.__displayComponentPath as string) || "",
              exists: !!(widget.__displayComponentPath as string),
            },
          },
          canDisable: !isCore && dependencies.length === 0,
          hasValidation: !!widget.GuiSchema,
        };
      },
    );
    widgetList.sort((a, b) => {
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return a.name.localeCompare(b.name);
    });
    return widgetList;
  }

  async activate(widgetId: string) {
    const result = await this._dbAdapter.system.widgets.activate(
      widgetId as DatabaseId,
    );
    if (!result.success) throw new AppError(result.message, 500);
    return { widgetId };
  }

  async deactivate(widgetId: string) {
    const result = await this._dbAdapter.system.widgets.deactivate(
      widgetId as DatabaseId,
    );
    if (!result.success) throw new AppError(result.message, 500);
    return { widgetId };
  }
}

/**
 * Settings Namespace (Helper for SystemNamespace)
 */
export class SettingsNamespace {
  constructor(_dbAdapter: IDBAdapter) {}
  async getAll(options: LocalApiOptions = {}) {
    return settingsService.getAllSettings(options.tenantId as string);
  }
  async updateFromSnapshot(snapshot: any) {
    return settingsService.updateSettingsFromSnapshot(snapshot);
  }
  async invalidateCache(options: LocalApiOptions = {}) {
    return settingsService.invalidateSettingsCache(options.tenantId as string);
  }
  async getPublic(options: LocalApiOptions = {}) {
    const { public: p } = await settingsService.loadSettingsCache(
      options.tenantId as string,
    );
    return p;
  }
  async get(key: string, options: LocalApiOptions = {}) {
    if (key === "all")
      return settingsService.getAllSettings(options.tenantId as string);
    return settingsService.getUntypedSetting(
      key,
      "private",
      options.tenantId as string,
    );
  }
  async set(key: string, value: any, options: LocalApiOptions = {}) {
    return settingsService.setPrivateSetting(
      key as any,
      value,
      options.tenantId as string,
    );
  }
}

/**
 * Importer Namespace (Helper for SystemNamespace)
 */
export class ImporterNamespace {
  constructor(private _dbAdapter: IDBAdapter) {}
  async importData(body: any, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const {
      collectionName,
      data,
      mode = "merge",
      duplicateStrategy = "skip",
      async = false,
    } = body;
    if (!collectionName) throw new AppError("Collection name is required", 400);
    if (!Array.isArray(data)) throw new AppError("Data must be an array", 422);
    const shouldProcessInBackground = async || data.length > 50;
    if (shouldProcessInBackground) {
      let jobPayload: any = {
        collectionName,
        mode,
        duplicateStrategy,
        tenantId,
      };
      if (data.length > 1000) {
        jobPayload.tempPayloadId = await saveTempPayload(data);
      } else {
        jobPayload.data = data;
      }
      const jobId = await jobQueue.dispatch(
        "import-data",
        jobPayload,
        (tenantId || undefined) as string,
      );
      return {
        success: true,
        message: "Import started in background",
        jobId,
        total: data.length,
        status: "pending",
      };
    }
    let imported = 0,
      skipped = 0,
      errors = 0;
    if (mode === "replace")
      await this._dbAdapter.crud.deleteMany(
        collectionName,
        {},
        { tenantId: tenantId as DatabaseId },
      );
    for (const doc of data) {
      try {
        if (duplicateStrategy === "skip" && doc._id) {
          const existing = await this._dbAdapter.crud.findOne(
            collectionName,
            { _id: doc._id as DatabaseId },
            { tenantId: tenantId as DatabaseId },
          );
          if (existing.success && existing.data) {
            skipped++;
            continue;
          }
        }
        const result = doc._id
          ? await this._dbAdapter.crud.upsert(
              collectionName,
              { _id: doc._id as DatabaseId },
              doc,
              {
                tenantId: tenantId as DatabaseId,
              },
            )
          : await this._dbAdapter.crud.insert(collectionName, doc, {
              tenantId: tenantId as DatabaseId,
            });
        if (result.success) imported++;
        else errors++;
      } catch {
        errors++;
      }
    }
    return {
      success: true,
      imported,
      skipped,
      errors,
      total: data.length,
      status: "completed",
    };
  }
  async scaffold(body: any) {
    const {
      sourceType,
      sourceUrl,
      apiKey,
      sourceTypeIdentifier,
      collectionName,
    } = body;
    if (!sourceType || !sourceUrl || !sourceTypeIdentifier || !collectionName)
      throw new AppError("Missing params", 400);
    let sourceData;
    if (sourceType === "drupal")
      sourceData = await fetchDrupalData(
        sourceUrl,
        sourceTypeIdentifier,
        apiKey,
      );
    else if (sourceType === "wordpress")
      sourceData = await fetchWordPressData(
        sourceUrl,
        sourceTypeIdentifier,
        apiKey,
      );
    else throw new AppError("Unsupported source", 400);
    const schema = await scaffoldCollectionSchema(
      collectionName,
      sourceData.schema,
    );
    const collectionPath = path.join(
      process.cwd(),
      "config",
      "collections",
      `${schema.slug}.ts`,
    );
    const fileContent = `import { widgets } from '@widgets';\nimport type { Schema } from '@src/content/types';\n\nexport const schema: Schema = ${JSON.stringify(schema, null, 2).replace(/"widget":\s*"(\w+)"/g, '"widget": widgets.$1')};\n`;
    await fs.mkdir(path.dirname(collectionPath), { recursive: true });
    await fs.writeFile(collectionPath, fileContent);
    return {
      success: true,
      message: `Collection '${collectionName}' scaffolded.`,
      slug: schema.slug,
    };
  }
  async importExternal(body: any, options: LocalApiOptions = {}) {
    const {
      sourceType,
      sourceUrl,
      apiKey,
      contentType,
      targetCollection,
      mapping,
      dryRun = false,
    } = body;
    const { user, tenantId } = options;

    if (!sourceUrl || !sourceType || !contentType || !targetCollection)
      throw new AppError("Missing params", 400);
    let externalData;
    if (sourceType === "drupal")
      externalData = await fetchDrupalData(sourceUrl, contentType, apiKey);
    else if (sourceType === "wordpress")
      externalData = await fetchWordPressData(sourceUrl, contentType, apiKey);
    else throw new AppError("Unsupported source", 400);
    let finalMapping = mapping;
    if (!finalMapping) {
      const collectionsResult = await this._dbAdapter.collection.listSchemas(
        tenantId as DatabaseId,
      );
      const targetCol = collectionsResult.success
        ? collectionsResult.data.find((c: any) => c.name === targetCollection)
        : null;
      if (!targetCol) throw new AppError("Target collection not found", 404);
      finalMapping = await aiService.suggestMapping(
        externalData.schema,
        targetCol,
      );
    }
    if (dryRun)
      return {
        success: true,
        dryRun: true,
        mapping: finalMapping,
        sampleData: externalData.items.slice(0, 3),
      };
    const mediaService = new MediaService(this._dbAdapter);
    let importedCount = 0,
      errorCount = 0;
    for (const item of externalData.items) {
      try {
        const transformed: Record<string, any> = {};
        const attributes = sourceType === "drupal" ? item.attributes : item;
        for (const [sourceField, targetField] of Object.entries(finalMapping)) {
          let targetKey =
            typeof targetField === "string"
              ? targetField
              : (targetField as any).target;
          let transform =
            typeof targetField === "string"
              ? undefined
              : (targetField as any).transform;
          let value = attributes[sourceField];
          if (transform === "media" && value) {
            try {
              const media = await mediaService.saveRemoteMedia(
                value,
                (user?._id as string) || "",
                "public",
                tenantId as DatabaseId,
              );
              if (media.success) {
                value = media.data._id;
              } else {
                value = null;
              }
            } catch {
              value = null;
            }
          }
          transformed[targetKey] = value;
        }
        const result = await this._dbAdapter.crud.insert(
          `collection_${targetCollection}`,
          transformed,
          { tenantId: tenantId as DatabaseId },
        );
        if (result.success) importedCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }
    return {
      success: true,
      imported: importedCount,
      errors: errorCount,
      total: externalData.items.length,
    };
  }
}

/**
 * Website Tokens Namespace
 */
export class WebsiteTokensNamespace extends BaseNamespace {
  constructor(_dbAdapterOverride: IDBAdapter) {
    super(_dbAdapterOverride);
  }
  async list(options: TokenOptions = {}) {
    const {
      tenantId,
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
    } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        const result = await this._dbAdapter.system.websiteTokens.getAll({
          limit,
          skip: (page - 1) * limit,
          sort,
          order,
        });
        if (!result.success) throw new AppError(result.message, 500);
        return {
          data: result.data.data,
          pagination: {
            totalItems: result.data.total,
            page,
            limit,
            totalPages: Math.ceil(result.data.total / limit),
          },
        };
      },
      { collection: "websiteTokens" },
    );
  }
  async create(options: {
    name: string;
    permissions?: string[];
    expiresAt?: string;
    user: any;
    tenantId?: DatabaseId | null;
  }) {
    const { name, permissions, expiresAt, user, tenantId } = options;
    if (!name) throw new AppError("Name is required", 400);
    return withTenant(
      tenantId ?? null,
      async () => {
        const tokenValue = `sv_${generateSecureToken(24)}`;
        const result = await this._dbAdapter.system.websiteTokens.create({
          name,
          token: tokenValue,
          updatedAt: new Date().toISOString() as ISODateString,
          createdBy: user!._id,
          permissions: permissions || [],
          expiresAt: (expiresAt || undefined) as ISODateString | undefined,
        });
        if (!result.success) throw new AppError(result.message, 500);
        return result.data;
      },
      { collection: "websiteTokens" },
    );
  }
  async delete(tokenId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        const result = await this._dbAdapter.system.websiteTokens.delete(
          tokenId as any,
        );
        if (!result.success) throw new AppError(result.message, 500);
        return result.data;
      },
      { collection: "websiteTokens" },
    );
  }
}

/**
 * System Namespace
 */
export class SystemNamespace {
  public settings: SettingsNamespace;
  public importer: ImporterNamespace;
  public websiteTokens: WebsiteTokensNamespace;
  public themes: ThemeNamespace;
  constructor(private _dbAdapter: IDBAdapter) {
    this.settings = new SettingsNamespace(this._dbAdapter);
    this.importer = new ImporterNamespace(this._dbAdapter);
    this.websiteTokens = new WebsiteTokensNamespace(this._dbAdapter);
    this.themes = new ThemeNamespace();
  }
  getHealth() {
    return getHealthCheckReport();
  }
  async reinitialize(force: boolean = true) {
    return reinitializeSystem(force);
  }
  async refresh(
    options: LocalApiOptions & { skipReconciliation?: boolean } = {},
  ) {
    const { tenantId, skipReconciliation = false } = options;
    const { contentSystem } = await import("@src/content/index.server");
    return contentSystem.refresh(tenantId as string, skipReconciliation);
  }
  async getPreferences(
    keys: string[],
    options: {
      userId?: string;
      scope?: "user" | "system";
      tenantId?: string;
    } = {},
  ) {
    const { userId, scope = "system", tenantId } = options;
    return this._dbAdapter.system.preferences.getMany(keys, {
      scope,
      userId: userId as DatabaseId,
      tenantId: tenantId as DatabaseId,
    });
  }
  async setPreference(
    key: string,
    value: any,
    options: {
      userId?: string;
      scope?: "user" | "system";
      tenantId?: string;
    } = {},
  ) {
    const { userId, scope = "system", tenantId } = options;
    return this._dbAdapter.system.preferences.set(key, value, {
      scope,
      userId: userId as DatabaseId,
      tenantId: tenantId as DatabaseId,
    });
  }
  async sendMail(params: {
    recipientEmail: string;
    subject: string;
    templateName: string;
    props?: any;
    languageTag?: string;
  }) {
    const { sendMail: coreSendMail } = await import("@utils/email.server");
    return coreSendMail(params);
  }
}

/**
 * Theme Namespace — zero-overhead server-side theme operations via LocalCMS SDK
 */
export class ThemeNamespace {
  async getAdminTheme(tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.getAdminTheme(tenantId);
  }
  async saveAdminTheme(settings: any, tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.saveAdminTheme(settings, tenantId);
  }
  async listThemes(tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.listThemes(tenantId);
  }
  async createTheme(name: string, settings?: any, tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.createTheme(name, settings, tenantId);
  }
  async activateTheme(themeId: string, tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.activateTheme(themeId, tenantId);
  }
  async deleteTheme(themeId: string, tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.deleteTheme(themeId, tenantId);
  }
  async cloneTheme(
    sourceId: string,
    newName: string,
    tenantId?: string | null,
  ) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.cloneTheme(sourceId, newName, tenantId);
  }
  async resetToDefaults(tenantId?: string | null) {
    const { adminThemeService } =
      await import("@src/services/core/admin-theme-service");
    return adminThemeService.resetToDefaults(tenantId);
  }
}

/**
 * Automation Namespace
 */
export class AutomationNamespace extends BaseNamespace {
  async getFlow(id: string, options: LocalApiOptions = {}) {
    return automationService.getFlow(id, options.tenantId as string);
  }
  async getLogs(flowId: string, options: any = {}) {
    return automationService.getLogs(flowId, options);
  }
  async executeFlow(
    id: string,
    triggerData: any = {},
    options: LocalApiOptions = {},
  ) {
    const { tenantId } = options;
    const flow = await this.getFlow(id, options);
    if (!flow) throw new Error(`Flow ${id} not found`);
    return automationService.executeFlow(flow, {
      event: "manual_trigger",
      tenantId: tenantId as string,
      ...triggerData,
    });
  }
}

export class TelemetryNamespace extends BaseNamespace {
  async checkUpdateStatus(options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(tenantId ?? null, async () => {
      const result = await (
        this._dbAdapter.system as any
      ).health.getUpdateStatus();
      if (!result.success) throw new AppError(result.message, 500);
      return result.data;
    });
  }
}

function saveTempPayload(data: any): any {
  const { saveTempPayload: save } = require("@utils/temp-store");
  return save(data);
}
