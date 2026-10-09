/**
 * @file src/databases/mongodb/schema.ts
 * @description Centralized Mongoose schema definitions for MongoDB system and core collections.
 *
 * Provides architectural parity with SQLite, PostgreSQL, and MariaDB `schema.ts` modules.
 * Ensures consistent UUID identifiers, indexing, timestamps, and multi-tenant scoping.
 */

import mongoose, { type Model, Schema, type Document as MongooseDocument } from "mongoose";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  DatabaseError,
  SystemVirtualFolder,
  Theme,
  TenantQuota,
  TenantUsage,
} from "../db-interface";
import type {
  ContentNode,
  Translation,
  WebsiteToken,
  DashboardWidgetConfig,
  Layout,
  SystemPreferencesDocument,
} from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import type { OutboxEvent } from "@src/services/outbox/outbox-service";
import { generateId } from "./mongodb-utils";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";

// ============================================================================
// 1. Transactional Outbox Schema
// ============================================================================

export const outboxSchema = new Schema<OutboxEvent>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    tenantId: { type: String, required: true },
    eventType: { type: String, required: true },
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
    },
    createdAt: { type: String, default: () => nowISODateString() },
    deliveredAt: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "svelty_outbox",
    strict: true,
    _id: false,
  },
);

outboxSchema.index({ status: 1, createdAt: 1 });
outboxSchema.index({ tenantId: 1, status: 1 });
outboxSchema.index({ eventType: 1 });

// ============================================================================
// 2. Plugin Storage Schema
// ============================================================================

export interface PluginStorageDoc {
  _id: string;
  plugin: string;
  collectionName: string;
  tenantId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const pluginStorageSchema = new Schema<PluginStorageDoc>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    plugin: { type: String, required: true, index: true },
    collectionName: { type: String, required: true, index: true },
    tenantId: { type: String, default: null, index: true },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: false,
    collection: "plugin_storage",
    strict: true,
    _id: false,
  },
);

pluginStorageSchema.index({ plugin: 1, collectionName: 1, tenantId: 1 });
pluginStorageSchema.index({ plugin: 1, collectionName: 1 });

// ============================================================================
// 3. Multi-Tenant Organization Schema
// ============================================================================

export interface Tenant extends BaseEntity {
  _id: DatabaseId;
  name: string;
  ownerId: DatabaseId;
  plan: "free" | "pro" | "enterprise";
  quota: TenantQuota;
  settings?: Record<string, unknown>;
  status: "active" | "suspended" | "archived";
  usage: TenantUsage;
}

export const tenantSchema = new Schema<Tenant>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["active", "suspended", "archived"],
      default: "active",
      index: true,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    quota: {
      maxUsers: { type: Number, default: 5 },
      maxStorageBytes: { type: Number, default: 1024 * 1024 * 100 },
      maxCollections: { type: Number, default: 10 },
      maxApiRequestsPerMonth: { type: Number, default: 10_000 },
    },
    usage: {
      usersCount: { type: Number, default: 1 },
      storageBytes: { type: Number, default: 0 },
      collectionsCount: { type: Number, default: 0 },
      apiRequestsMonth: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },
    settings: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    _id: false,
  },
);

tenantSchema.index({ "usage.storageBytes": 1 });
tenantSchema.index({ "usage.lastUpdated": 1 });

export const TenantModel = mongoose.models.Tenant || mongoose.model<Tenant>("Tenant", tenantSchema);

// ============================================================================
// 4. Content Drafts Schema
// ============================================================================

export interface ContentDraft extends BaseEntity {
  _id: DatabaseId;
  authorId: DatabaseId;
  contentId: DatabaseId;
  data: Record<string, unknown>;
  status: "draft" | "review" | "archived";
  version: number;
}

export const draftSchema = new Schema<ContentDraft>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    contentId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["draft", "review", "archived"],
      default: "draft",
    },
    authorId: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "content_drafts",
    strict: true,
  },
);

draftSchema.index({ contentId: 1, version: -1 });
draftSchema.index({ authorId: 1, status: 1, updatedAt: -1 });
draftSchema.index({ status: 1, updatedAt: -1 });
draftSchema.index({ contentId: 1, status: 1, updatedAt: -1 });
draftSchema.index({ authorId: 1, createdAt: -1 });

draftSchema.statics = {
  async getDraftsForContent(contentId: string): Promise<DatabaseResult<ContentDraft[]>> {
    try {
      const drafts = await this.find({ contentId } as any)
        .lean()
        .exec();
      return { success: true, data: drafts };
    } catch (error: any) {
      const message = `Failed to retrieve drafts for content ID: ${contentId}`;
      logger.error(`Error retrieving drafts for content ID: ${contentId}: ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "DRAFT_FETCH_ERROR", message },
      };
    }
  },

  async bulkDeleteDraftsForContent(contentIds: string[]): Promise<DatabaseResult<number>> {
    try {
      const result = await this.deleteMany({
        contentId: { $in: contentIds },
      } as any).exec();
      logger.info(
        `Bulk deleted ${result.deletedCount} drafts for content IDs: ${contentIds.join(", ")}`,
      );
      return { success: true, data: result.deletedCount };
    } catch (error: any) {
      const message = "Failed to bulk delete drafts";
      logger.error(`Error bulk deleting drafts for content IDs: ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "DRAFT_BULK_DELETE_ERROR", message, details: error },
      };
    }
  },

  async createDraft(
    draftData: Omit<ContentDraft, "_id" | "createdAt" | "updatedAt">,
  ): Promise<DatabaseResult<ContentDraft>> {
    try {
      const newDraft = await this.create(draftData);
      return { success: true, data: newDraft.toObject() as unknown as ContentDraft };
    } catch (error: any) {
      const message = "Failed to create draft";
      logger.error(`Error creating draft: ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "DRAFT_CREATE_ERROR", message, details: error },
      };
    }
  },

  async updateDraft(
    draftId: DatabaseId,
    updateData: Partial<ContentDraft>,
  ): Promise<DatabaseResult<void>> {
    try {
      const result = await this.updateOne({ _id: draftId }, { $set: updateData }).exec();
      if (result.modifiedCount === 0) {
        const message = `Draft with ID "${draftId}" not found or no changes applied.`;
        return { success: false, message, error: { code: "DRAFT_UPDATE_NOT_FOUND", message } };
      }
      logger.info(`Draft "${draftId}" updated successfully.`);
      return { success: true, data: undefined };
    } catch (error: any) {
      const message = `Failed to update draft "${draftId}"`;
      logger.error(`Error updating draft "${draftId}": ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "DRAFT_UPDATE_ERROR", message, details: error },
      };
    }
  },

  async deleteDraft(draftId: DatabaseId): Promise<DatabaseResult<void>> {
    try {
      const result = await this.deleteOne({ _id: draftId }).exec();
      if (result.deletedCount === 0) {
        const message = `Draft with ID "${draftId}" not found.`;
        return { success: false, message, error: { code: "DRAFT_DELETE_NOT_FOUND", message } };
      }
      logger.info(`Draft "${draftId}" deleted successfully.`);
      return { success: true, data: undefined };
    } catch (error: any) {
      const message = `Failed to delete draft "${draftId}"`;
      logger.error(`Error deleting draft "${draftId}": ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "DRAFT_DELETE_ERROR", message, details: error },
      };
    }
  },
};

export const DraftModel =
  (mongoose.models?.Draft as Model<ContentDraft> | undefined) ||
  mongoose.model<ContentDraft>("Draft", draftSchema);

// ============================================================================
// 5. Content Revisions Schema
// ============================================================================

export interface ContentRevision extends BaseEntity {
  _id: DatabaseId;
  authorId: DatabaseId;
  commitMessage?: string;
  contentId: DatabaseId;
  data: Record<string, unknown>;
  version: number;
}

export const revisionSchema = new Schema<ContentRevision>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    contentId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, required: true },
    commitMessage: String,
    authorId: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "content_revisions",
    strict: true,
  },
);

revisionSchema.index({ contentId: 1, version: -1, createdAt: -1 });
revisionSchema.index({ authorId: 1, createdAt: -1 });
revisionSchema.index({ contentId: 1, authorId: 1, createdAt: -1 });
revisionSchema.index({ createdAt: -1 });

revisionSchema.statics = {
  async getRevisionHistory(contentId: string): Promise<DatabaseResult<ContentRevision[]>> {
    try {
      const revisions = await this.find({ contentId } as any)
        .sort({ version: -1 })
        .lean()
        .exec();
      return { success: true, data: revisions };
    } catch (error: any) {
      const message = `Failed to retrieve revision history for content ID: ${contentId}`;
      logger.error(`Error retrieving revision history: ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "REVISION_FETCH_ERROR", message },
      };
    }
  },

  async bulkDeleteRevisionsForContent(contentIds: string[]): Promise<DatabaseResult<number>> {
    try {
      const result = await this.deleteMany({
        contentId: { $in: contentIds },
      } as any).exec();
      logger.info(
        `Bulk deleted ${result.deletedCount} revisions for content IDs: ${contentIds.join(", ")}`,
      );
      return { success: true, data: result.deletedCount };
    } catch (error: any) {
      const message = "Failed to bulk delete revisions";
      logger.error(`Error bulk deleting revisions: ${error.message}`);
      return {
        success: false,
        message,
        error: { code: "REVISION_BULK_DELETE_ERROR", message, details: error },
      };
    }
  },
};

export const RevisionModel =
  (mongoose.models?.Revision as Model<ContentRevision> | undefined) ||
  mongoose.model<ContentRevision>("Revision", revisionSchema);

// ============================================================================
// 6. System Theme Schema
// ============================================================================

export const themeSchema = new Schema<Theme>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    path: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    config: {
      tailwindConfigPath: String,
      assetsPath: String,
      properties: {
        type: Map,
        of: String,
        default: {},
      },
    },
    previewImage: String,
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_theme",
    strict: true,
  },
);

themeSchema.index({ isActive: 1 });
themeSchema.index({ name: 1 }, { unique: true });

export const ThemeModel =
  (mongoose.models?.system_theme as Model<Theme> | undefined) ||
  mongoose.model<Theme>("system_theme", themeSchema);

// ============================================================================
// 7. System Setting Schema
// ============================================================================

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

export const systemSettingSchema = new Schema<SystemSetting>(
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

systemSettingSchema.index({ key: 1, tenantId: 1 }, { unique: true });

export const SystemSettingModel =
  (mongoose.models?.SystemSetting as mongoose.Model<SystemSetting> | undefined) ||
  mongoose.model<SystemSetting>("SystemSetting", systemSettingSchema);

// ============================================================================
// 8. System Preferences Schema
// ============================================================================

interface SystemPreferencesModelType extends Model<SystemPreferencesDocument> {
  deletePreferencesByUser(userId: string): Promise<DatabaseResult<number>>;
  getPreferenceByLayout(userId: string, layoutId: string): Promise<DatabaseResult<Layout | null>>;
  setPreference(
    userId: string,
    layoutId: string,
    layout: Layout,
    options?: {
      validateWidgets?: boolean;
      getActiveWidgets?: () => Promise<string[]>;
    },
  ): Promise<DatabaseResult<{ layout: Layout; warnings?: string[] }>>;
  validateLayoutWidgets(
    layout: Layout,
    activeWidgets: string[],
  ): { layout: Layout; warnings: string[] };
}

const widgetSubSchema = new Schema<DashboardWidgetConfig>(
  {
    id: { type: String, required: true, unique: true },
    component: { type: String, required: true },
    label: { type: String, required: true },
    icon: { type: String, required: true },
    size: {
      w: { type: Number, required: true },
      h: { type: Number, required: true },
    },
    settings: { type: Schema.Types.Mixed, default: {} },
    gridPosition: { type: Number, required: false },
    order: { type: Number, required: false },
  },
  { _id: false },
);

const layoutSubSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  preferences: { type: [widgetSubSchema], default: [] },
});

export const systemPreferencesSchema = new Schema(
  {
    _id: { type: String, required: true, default: () => generateId() },
    userId: { type: String, ref: "auth_users", required: false },
    layoutId: { type: String, required: false },
    layout: { type: layoutSubSchema, required: false },
    preferences: { type: Schema.Types.Mixed, default: {} },
    scope: {
      type: String,
      enum: ["user", "system", "widget"],
      default: "user",
    },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_preferences",
    strict: true,
    _id: false,
  },
);

systemPreferencesSchema.index({ userId: 1, layoutId: 1, scope: 1 }, { unique: true });
systemPreferencesSchema.index({ scope: 1, userId: 1 });
systemPreferencesSchema.index({ scope: 1 });

systemPreferencesSchema.statics = {
  async getPreferenceByLayout(
    userId: string,
    layoutId: string,
  ): Promise<DatabaseResult<Layout | null>> {
    try {
      const query = { userId, layoutId, scope: "user" };
      const doc = await this.findOne(query).lean().exec();
      if (!doc) {
        logger.debug(`No preference found for userId: ${userId}, layoutId: ${layoutId}`);
        return { success: true, data: null };
      }
      return { success: true, data: (doc as any).layout };
    } catch (error) {
      const message = `Failed to retrieve preference for userId: ${userId}, layoutId: ${layoutId}`;
      logger.error(message, error);
      return { success: false, message, error: { code: "PREFERENCE_GET_ERROR", message } };
    }
  },

  async setPreference(
    userId: string,
    layoutId: string,
    layout: Layout,
    options?: {
      validateWidgets?: boolean;
      getActiveWidgets?: () => Promise<string[]>;
    },
  ): Promise<DatabaseResult<{ layout: Layout; warnings?: string[] }>> {
    try {
      let finalLayout = layout;
      const warnings: string[] = [];

      if (options?.validateWidgets && options?.getActiveWidgets) {
        const activeWidgets = await options.getActiveWidgets();
        const validatedResult = (
          this as unknown as SystemPreferencesModelType
        ).validateLayoutWidgets(layout, activeWidgets);
        finalLayout = validatedResult.layout;
        warnings.push(...validatedResult.warnings);
      }

      const query = { userId, layoutId, scope: "user" };
      const documentId = `${userId}_${layoutId}`;
      await this.updateOne(
        query,
        { $set: { layout: finalLayout, _id: documentId } },
        { upsert: true },
      ).exec();

      return {
        success: true,
        data: {
          layout: finalLayout,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      };
    } catch (error) {
      const message = `Failed to set preference for userId: ${userId}, layoutId: ${layoutId}`;
      logger.error(message, error);
      return { success: false, message, error: { code: "PREFERENCE_SET_ERROR", message } };
    }
  },

  validateLayoutWidgets(
    layout: Layout,
    activeWidgets: string[],
  ): { layout: Layout; warnings: string[] } {
    const warnings: string[] = [];
    const validatedPreferences: DashboardWidgetConfig[] = [];

    for (const widget of layout.preferences) {
      if (!activeWidgets.includes(widget.component)) {
        warnings.push(`Widget '${widget.component}' is not active, removing from layout`);
        continue;
      }
      validatedPreferences.push(widget);
    }

    return {
      layout: {
        ...layout,
        preferences: validatedPreferences,
      },
      warnings,
    };
  },

  async deletePreferencesByUser(userId: string): Promise<DatabaseResult<number>> {
    try {
      const result = await this.deleteMany({ userId, scope: "user" }).exec();
      logger.info(`Deleted ${result.deletedCount} system preferences for userId: ${userId}`);
      return { success: true, data: result.deletedCount };
    } catch (error) {
      const message = `Failed to delete preferences for userId: ${userId}`;
      logger.error(message, error);
      return { success: false, message, error: { code: "PREFERENCE_DELETE_ERROR", message } };
    }
  },
};

export const SystemPreferencesModel =
  (mongoose.models?.SystemPreferences as unknown as SystemPreferencesModelType | undefined) ||
  (mongoose.model<SystemPreferencesDocument>(
    "SystemPreferences",
    systemPreferencesSchema,
  ) as unknown as SystemPreferencesModelType);

// ============================================================================
// 9. Content Structure Schema & Discriminators
// ============================================================================

export interface ContentStructureDocument
  extends Omit<ContentNode, "collectionDef" | "_id" | "children" | "nodeType">, MongooseDocument {
  _id: any;
  collectionDef?: import("@src/content/types").Schema;
  description?: string;
  links?: string[];
  livePreview?: boolean | string;
  nodeType: "category" | "collection";
  permissions?: Record<string, Record<string, boolean>>;
  revision?: boolean;
  slug?: string;
  status?: import("@src/content/types").StatusType;
  strict?: boolean;
}

export interface CategoryDocument extends ContentStructureDocument {
  nodeType: "category";
}

export interface CollectionDocument extends ContentStructureDocument {
  nodeType: "collection";
}

export interface ContentStructureReorderItem {
  id: string;
  order: number;
  parentId: string | null;
  path: string;
}

const translationSchema = new Schema<Translation>(
  {
    languageTag: { type: String, required: true },
    translationName: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

export const contentStructureSchema = new Schema<ContentStructureDocument>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    path: { type: String, index: true },
    icon: { type: String, default: "bi:folder" },
    order: { type: Number, default: 999 },
    nodeType: {
      type: String,
      required: true,
      enum: ["category", "collection"],
    },
    translations: [translationSchema],
    parentId: { type: String, default: null, index: true },
    permissions: Schema.Types.Mixed,
    livePreview: { type: Schema.Types.Mixed },
    strict: { type: Boolean },
    revision: { type: Boolean },
    description: { type: String },
    slug: { type: String },
    status: {
      type: String,
      enum: Object.values(StatusTypes),
    },
    links: [{ type: String }],
    collectionDef: { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true },
    isDeleted: { type: Boolean, default: false },
    source: { type: String, default: "filesystem" },
  },
  {
    timestamps: true,
    collection: "system_content_structure",
    discriminatorKey: "nodeType",
    bufferCommands: false,
  },
);

contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ "translations.languageTag": 1 });
contentStructureSchema.index({ tenantId: 1, parentId: 1, order: 1 });
contentStructureSchema.index({ tenantId: 1, nodeType: 1, status: 1 });
contentStructureSchema.index({ tenantId: 1, path: 1 }, { unique: true, sparse: true });
contentStructureSchema.index({ tenantId: 1, slug: 1 }, { sparse: true });
contentStructureSchema.index({ tenantId: 1, "translations.languageTag": 1, nodeType: 1 });
contentStructureSchema.index({ parentId: 1, order: 1, nodeType: 1 });
contentStructureSchema.index({ nodeType: 1, updatedAt: -1 });

function makeContentError(error: unknown, code: string, message: string): DatabaseError {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`${code}: ${message}`, err);
  return { code, message, details: err.message };
}

contentStructureSchema.statics = {
  async getContentStructure(tenantId: string): Promise<DatabaseResult<ContentStructureDocument[]>> {
    try {
      const contentStructure = await this.find({ tenantId } as any)
        .sort({ order: 1 })
        .lean();
      return { success: true, data: contentStructure };
    } catch (error) {
      const message = "Error fetching content structure";
      return {
        success: false,
        message,
        error: makeContentError(error, "CONTENT_GET_CONTENT_STRUCTURE_ERROR", message),
      };
    }
  },

  async reorderStructure(
    items: ContentStructureReorderItem[],
    tenantId?: string,
  ): Promise<DatabaseResult<void>> {
    try {
      const bulkOps: mongoose.AnyBulkWriteOperation<ContentStructureDocument>[] = items.map(
        (item) => ({
          updateOne: {
            filter: {
              _id: item.id,
              ...(tenantId ? { tenantId } : {}),
            } as any,
            update: {
              $set: {
                parentId: item.parentId,
                order: item.order,
              },
            },
          },
        }),
      ) as any[];

      if (bulkOps.length > 0) {
        await this.bulkWrite(bulkOps);
      }

      return { success: true, data: undefined };
    } catch (error) {
      const message = "Error reordering content structure";
      return {
        success: false,
        message,
        error: makeContentError(error, "CONTENT_REORDER_ERROR", message),
      };
    }
  },
};

export function registerContentStructureDiscriminators(conn: any) {
  const connection = conn || mongoose;

  if ((connection as any)._contentDiscriminatorsRegistered) {
    return;
  }

  try {
    const baseModel = connection.models.system_content_structure;
    if (!baseModel) {
      throw new Error(
        "Base model system_content_structure not found. It must be created before registering discriminators.",
      );
    }

    if (!baseModel.discriminators) {
      baseModel.discriminators = {};
    }

    if (!baseModel.discriminators.category) {
      baseModel.discriminator("category", new Schema<CategoryDocument>({}));
      logger.debug("CONTENT_STRUCTURE_CATEGORY_DISCRIMINATOR_REGISTERED");
    }

    if (!baseModel.discriminators.collection) {
      baseModel.discriminator("collection", new Schema<CollectionDocument>({}));
      logger.debug("CONTENT_STRUCTURE_COLLECTION_DISCRIMINATOR_REGISTERED");
    }

    (connection as any)._contentDiscriminatorsRegistered = true;
  } catch (error) {
    logger.error("CONTENT_STRUCTURE_DISCRIMINATOR_REGISTRATION_ERROR", error);
    throw error;
  }
}

// ============================================================================
// 10. Website Token Schema
// ============================================================================

export const websiteTokenSchema = new Schema<WebsiteToken>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
    createdBy: { type: String, required: true },
    permissions: { type: [String], default: [] },
    expiresAt: { type: String, required: false },
    tenantId: { type: String, index: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    collection: "system_website_tokens",
    strict: true,
  },
);

websiteTokenSchema.index({ createdBy: 1 });
websiteTokenSchema.index({ tenantId: 1, name: 1 });
websiteTokenSchema.index({ token: 1, tenantId: 1 });

export const WebsiteTokenModel =
  (mongoose.models?.WebsiteToken as Model<WebsiteToken> | undefined) ||
  mongoose.model<WebsiteToken>("WebsiteToken", websiteTokenSchema);

// ============================================================================
// 11. System Virtual Folder Schema
// ============================================================================

export const systemVirtualFolderSchema = new Schema<SystemVirtualFolder>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    path: { type: String, required: true, unique: true },
    parentId: { type: String, ref: "SystemVirtualFolder" },
    icon: { type: String, default: "bi:folder" },
    order: { type: Number, default: 0 },
    type: { type: String, enum: ["folder", "collection"], required: true },
    tenantId: { type: String, index: true },
    metadata: Schema.Types.Mixed,
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
  },
  {
    timestamps: true,
    collection: "system_virtual_folders",
    strict: true,
    _id: false,
  },
);

// ============================================================================
// 12. Media Item Schema
// ============================================================================

export { mediaSchema, MediaModel, type IMedia } from "./media";
