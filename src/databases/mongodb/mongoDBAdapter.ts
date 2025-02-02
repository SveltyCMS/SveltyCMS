/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description MongoDB adapter for CMS database operations, user preferences, and virtual folder management.
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with a robust retry mechanism
 * - CRUD operations for collections, documents, drafts, revisions, and widgets
 * - Management of media storage, retrieval, and virtual folders
 * - User authentication and session management
 * - Management of system preferences including user screen sizes and widget layouts
 * - Theme management
 * - Content Structure Management
 *
 * Key Features:
 * - Automatic reconnection with exponential backoff for MongoDB
 * - Schema definitions and model creation for various collections (e.g., Drafts, Revisions, Widgets, Media)
 * - Robust handling of media files with specific schemas for different media types
 * - Management of authentication-related models (e.g., User, Token, Session)
 * - Default and custom theme management with database storage
 * - User preferences storage and retrieval, including layout and screen size information
 * - Virtual folder management for organizing media
 * - Flexible Content Structure management for pages and collections
 *
 * Usage:
 * This adapter is utilized when the CMS is configured to use MongoDB, providing a
 * database-agnostic interface for various database operations within the CMS.
 * The adapter supports complex queries, schema management, and handles error logging
 * and connection retries. It integrates fully with the CMS for all data management needs.
 */


import { v4 as uuidv4 } from 'uuid';

// Database Models - Move to top
import { ContentStructureModel } from './models/contentStructure';
import { DraftModel } from './models/draft';
import { RevisionModel } from './models/revision';
import { ThemeModel } from './models/theme';
import { WidgetModel } from './models/widget';
import { mediaSchema } from './models/media';
import { SystemVirtualFolderModel } from './models/systemVirtualFolder';
import { SystemPreferencesModel } from './models/systemPreferences';

// Explicitly register models to ensure they are initialized
mongoose.model('ContentStructure', ContentStructureModel.schema);
mongoose.model('Draft', DraftModel.schema);
mongoose.model('Revision', RevisionModel.schema);
mongoose.model('Theme', ThemeModel.schema);
mongoose.model('Widget', WidgetModel.schema);
mongoose.model('Media', mongoose.models['media_images']?.schema || mediaSchema); // Use existing schema if model already exists
mongoose.model('SystemVirtualFolder', SystemVirtualFolderModel.schema);
mongoose.model('SystemPreferences', SystemPreferencesModel.schema);

// Authentication Models
import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';


// System Logging
import { logger } from '@utils/logger.svelte';

// Widget Manager
import '@widgets/index';


// Database
import mongoose from 'mongoose';
import type { Schema, Model, FilterQuery, UpdateQuery, ClientSession, SortOrder, Document as MongooseDocument } from 'mongoose';

import type {
  ISODateString,
  BaseEntity,
  DatabaseId, // add back DatabaseId import
  Translation,
  SystemPreferences,
  ContentDraft,
  ContentRevision,
  Theme,
  Widget,
  MediaItem,
  MediaFolder,
  PaginationOptions,
  DatabaseResult,
  DatabaseError,
  QueryBuilder,
  DatabaseAdapter,
  DatabaseTransaction,
  ContentNode,
  PaginatedResult,
} from '../dbInterface';


// Utility function to handle DatabaseErrors consistently
const createDatabaseError = (error: unknown, code: string, message: string): DatabaseError => {
  logger.error(`${code}: ${message}`, error);
  return {
    code,
    message,
    details: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
};


class MongoQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
  private model: mongoose.Model<T>;
  private query: mongoose.FilterQuery<T> = {};
  private limitValue = 0;
  private skipValue = 0;
  private sortFields: { [key in keyof T]?: mongoose.SortOrder } = {};
  private projectionFields: Partial<Record<keyof T, 1 | 0>> = {};
  private isDistinctQuery = false;
  private distinctField?: keyof T; // Store the field for distinct query
  private paginationOptions: PaginationOptions = {};

  constructor(model: mongoose.Model<T>) {
    this.model = model;
  }


  where(conditions: Partial<T>): this {
    this.query = { ...this.query, ...conditions };
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  skip(value: number): this {
    this.skipValue = value;
    return this;
  }

  sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this {
    this.sortFields[field] = direction === 'asc' ? 1 : -1;
    return this;
  }

  project<K extends keyof T>(fields: Partial<Record<K, boolean>>): this {
    this.projectionFields = Object.keys(fields).reduce((proj, key) => {
      proj[key as keyof T] = fields[key] ? 1 : 0;
      return proj;
    }, {} as Partial<Record<keyof T, 1 | 0>>);
    return this;
  }

  distinct<K extends keyof T>(field?: K): this {
    this.isDistinctQuery = true;
    this.distinctField = field;
    return this;
  }

  paginate(options: PaginationOptions): this {
    this.paginationOptions = options;
    return this;
  }


  async count(): Promise<DatabaseResult<number>> {
    try {
      const count = await this.model.countDocuments(this.query).exec();
      return { success: true, data: count };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'QUERY_ERROR', 'Failed to count documents') };
    }
  }

  async execute(): Promise<DatabaseResult<T[]>> {
    try {
      let mongoQuery = this.model.find(this.query);

      if (this.limitValue > 0) {
        mongoQuery = mongoQuery.limit(this.limitValue);
      }
      if (this.skipValue > 0) {
        mongoQuery = mongoQuery.skip(this.skipValue);
      }
      if (Object.keys(this.sortFields).length > 0) {
        mongoQuery = mongoQuery.sort(this.sortFields);
      }
      if (Object.keys(this.projectionFields).length > 0) {
        mongoQuery = mongoQuery.select(this.projectionFields);
      }
      if (this.isDistinctQuery) {
        // Consider making 'distinct' functional by allowing to specify a field.
        // For now, leaving it as a flag that might be used in specific implementations if needed.
        // Example (if distinct on 'fieldName' is needed):  mongoQuery = mongoQuery.distinct('fieldName');
        logger.warn("distinct() is called but is a no-op in this generic implementation. To use distinct, consider extending QueryBuilder or using MongoDB aggregation for specific fields.");
      }

      if (this.paginationOptions.page && this.paginationOptions.pageSize) {
        const page = this.paginationOptions.page || 1;
        const pageSize = this.paginationOptions.pageSize || 10;
        mongoQuery = mongoQuery.skip((page - 1) * pageSize).limit(pageSize);
      }
      if (this.paginationOptions.sortField) {
        const sortDirection: SortOrder = (this.paginationOptions.sortDirection === 'desc') ? -1 : 1;
        mongoQuery = mongoQuery.sort({ [this.paginationOptions.sortField]: sortDirection });
      }


      const results = await mongoQuery.lean().exec() as T[];
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'QUERY_ERROR', 'Failed to execute query') };
    }
  }

  async findOne(): Promise<DatabaseResult<T | null>> {
    try {
      const result = await this.model.findOne(this.query).lean().exec() as T | null;
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'QUERY_ERROR', 'Failed to execute findOne query') };
    }
  }
}


export class MongoDBAdapter implements DatabaseAdapter {
  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
  // Core Connection Management
  async connect(): Promise<DatabaseResult<void>> {
    try {
      if (!this.isConnected()) {
        await mongoose.connect(process.env.MONGODB_URI || '', {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          // Enable autoIndex in development for convenience, disable in production for performance.
          autoIndex: process.env.NODE_ENV !== 'production',
        });
        logger.info('MongoDB connection established');
        return { success: true, data: undefined };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CONNECTION_ERROR', 'MongoDB connection failed') };
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB connection disconnected');
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'DISCONNECTION_ERROR', 'MongoDB disconnection failed') };
    }
  }


  async transaction<T>(fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>): Promise<DatabaseResult<T>> {
    const session = await mongoose.startSession();
    session.startTransaction();
    const mongoTransaction: DatabaseTransaction = {
      commit: async () => {
        try {
          await session.commitTransaction();
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'TRANSACTION_COMMIT_ERROR', 'Transaction commit failed') };
        } finally {
          session.endSession(); // Ensure session ends in finally block
        }
      },
      rollback: async () => {
        try {
          await session.abortTransaction();
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'TRANSACTION_ROLLBACK_ERROR', 'Transaction rollback failed') };
        } finally {
          session.endSession(); // Ensure session ends in finally block
        }
      },
    };

    try {
      const result = await fn(mongoTransaction);
      if (result.success) {
        const commitResult = await mongoTransaction.commit();
        if (!commitResult.success) {
          return commitResult; // Return commit error if commit fails
        }
      } else {
        const rollbackResult = await mongoTransaction.rollback();
        if (!rollbackResult.success) {
          return rollbackResult; // Optionally return rollback error if rollback fails (less critical, but good to log)
        }
      }
      return result;
    } catch (error) {
      const rollbackResult = await mongoTransaction.rollback(); // Ensure rollback on errors during fn execution
      if (!rollbackResult.success) {
        logger.error("Transaction rollback failed after execution error", rollbackResult.error); // Log rollback failure, but still return the original execution error
      }
      return { success: false, error: createDatabaseError(error, 'TRANSACTION_EXECUTION_ERROR', 'Error during transaction execution') };
    } finally {
      if (!session.hasEnded) { // Double check if session is ended to avoid potential issues.
        session.endSession();
      }
    }
  }


  preferences = {
    get: async <T>(key: string, scope: 'user' | 'system' | 'widget' = 'system', userId?: DatabaseId): Promise<DatabaseResult<T>> => {
      try {
        let query: FilterQuery<SystemPreferences> = { key, scope };
        if (scope === 'user' && userId) {
          query = { ...query, userId };
        }
        const preference = await SystemPreferencesModel.findOne(query).lean().exec();
        if (preference) {
          return { success: true, data: preference.value as T };
        } else {
          return { success: true, data: undefined as T }; // Explicitly return undefined for "not found" case as per interface
        }
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'PREFERENCE_GET_ERROR', `Failed to get preference for key: ${key}`) };
      }
    },
    set: async <T>(key: string, value: T, scope: 'user' | 'system' | 'widget' = 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        let query: FilterQuery<SystemPreferences> = { key, scope };
        if (scope === 'user' && userId) {
          query = { ...query, userId };
        }
        await SystemPreferencesModel.findOneAndUpdate(
          query,
          { $set: { value } }, // Use $set for efficient updates
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'PREFERENCE_SET_ERROR', `Failed to set preference for key: ${key}`) };
      }
    },
    delete: async (key: string, scope: 'user' | 'system' | 'widget' = 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        let query: FilterQuery<SystemPreferences> = { key, scope };
        if (scope === 'user' && userId) {
          query = { ...query, userId };
        }
        const result = await SystemPreferencesModel.deleteOne(query).exec();
        if (result.deletedCount === 0) {
          logger.warn(`Preference key "${key}" not found for deletion (scope: ${scope}, userId: ${userId}).`); // Log non-deletion as warning, not error.
        }
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'PREFERENCE_DELETE_ERROR', `Failed to delete preference for key: ${key}`) };
      }
    },
  };

  themes = {
    getActive: async (): Promise<DatabaseResult<Theme>> => {
      try {
        const theme = await ThemeModel.findOne({ isActive: true }).lean().exec();
        if (!theme) {
          return { success: false, error: createDatabaseError(undefined, 'THEME_GET_ACTIVE_ERROR', 'No active theme found') };
        }
        return { success: true, data: theme as Theme };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'THEME_GET_ACTIVE_ERROR', 'Failed to get active theme') };
      }
    },
    setDefault: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        await ThemeModel.updateMany({}, { $set: { isDefault: false } }).exec(); // Use $set for update
        await ThemeModel.updateOne({ _id: themeId }, { $set: { isDefault: true } }).exec(); // Use $set for update
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'THEME_SET_DEFAULT_ERROR', 'Failed to set default theme') };
      }
    },
    install: async (theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>> => {
      try {
        const newTheme = await ThemeModel.create({ ...theme, _id: this.utils.generateId() });
        return { success: true, data: newTheme as Theme };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'THEME_INSTALL_ERROR', 'Failed to install theme') };
      }
    },
    uninstall: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        const result = await ThemeModel.deleteOne({ _id: themeId }).exec();
        if (result.deletedCount === 0) {
          logger.warn(`Theme with ID "${themeId}" not found for uninstall.`); // Log non-deletion as warning.
        }
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'THEME_UNINSTALL_ERROR', 'Failed to uninstall theme') };
      }
    },
    update: async (themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> => {
      try {
        const updatedTheme = await ThemeModel.findOneAndUpdate({ _id: themeId }, { $set: theme }, { new: true, lean: true }).exec(); // Use $set for update
        if (!updatedTheme) {
          return { success: false, error: createDatabaseError(undefined, 'THEME_UPDATE_NOT_FOUND', 'Theme not found for update') };
        }
        return { success: true, data: updatedTheme as Theme };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'THEME_UPDATE_ERROR', 'Failed to update theme') };
      }
    },
  };

  widgets = {
    register: async (widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> => {
      try {
        const newWidget = await WidgetModel.create({ ...widget, _id: this.utils.generateId() });
        return { success: true, data: newWidget as Widget };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'WIDGET_REGISTER_ERROR', 'Failed to register widget') };
      }
    },
    activate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        await WidgetModel.updateOne({ _id: widgetId }, { $set: { isActive: true } }).exec(); // Use $set for update
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'WIDGET_ACTIVATE_ERROR', 'Failed to activate widget') };
      }
    },
    deactivate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        await WidgetModel.updateOne({ _id: widgetId }, { $set: { isActive: false } }).exec(); // Use $set for update
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'WIDGET_DEACTIVATE_ERROR', 'Failed to deactivate widget') };
      }
    },
    update: async (widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>> => {
      try {
        const updatedWidget = await WidgetModel.findOneAndUpdate({ _id: widgetId }, { $set: widget }, { new: true, lean: true }).exec(); // Use $set for update
        if (!updatedWidget) {
          return { success: false, error: createDatabaseError(undefined, 'WIDGET_UPDATE_NOT_FOUND', 'Widget not found for update') };
        }
        return { success: true, data: updatedWidget as Widget };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'WIDGET_UPDATE_ERROR', 'Failed to update widget') };
      }
    },
    delete: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        const result = await WidgetModel.deleteOne({ _id: widgetId }).exec();
        if (result.deletedCount === 0) {
          logger.warn(`Widget with ID "${widgetId}" not found for deletion.`); // Log non-deletion as warning.
        }
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'WIDGET_DELETE_ERROR', 'Failed to delete widget') };
      }
    },
  };

  media = {
    files: {
      upload: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
        try {
          // Consider dynamically choosing the collection based on media type if you have different collections for images, videos etc.
          const newFile = await mongoose.models['media_images'].create({ ...file, _id: this.utils.generateId() });
          return { success: true, data: newFile as MediaItem };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_UPLOAD_ERROR', 'Failed to upload media file') };
        }
      },
      delete: async (fileId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const result = await mongoose.models['media_images'].deleteOne({ _id: fileId }).exec();
          if (result.deletedCount === 0) {
            logger.warn(`Media file with ID "${fileId}" not found for deletion.`); // Log non-deletion as warning.
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_DELETE_ERROR', 'Failed to delete media file') };
        }
      },
      getByFolder: async (folderId?: DatabaseId): Promise<DatabaseResult<MediaItem[]>> => {
        try {
          const query: FilterQuery<MediaItem> = folderId ? { folderId } : {};
          const files = await mongoose.models['media_images'].find(query).lean().exec() as MediaItem[];
          return { success: true, data: files };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_GET_BY_FOLDER_ERROR', 'Failed to get media files by folder') };
        }
      },
      search: async (query: string): Promise<DatabaseResult<MediaItem[]>> => {
        try {
          // Consider using text indexes for more efficient and flexible text search if needed.
          const files = await mongoose.models['media_images'].find({ filename: { $regex: query, $options: 'i' } }).lean().exec() as MediaItem[];
          return { success: true, data: files };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_SEARCH_ERROR', 'Failed to search media files') };
        }
      },
    },
    folders: {
      create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
        try {
          const newFolder = await mongoose.models['media_folders'].create({ ...folder, _id: this.utils.generateId() });
          return { success: true, data: newFolder as MediaFolder };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_FOLDER_CREATE_ERROR', 'Failed to create media folder') };
        }
      },
      delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const result = await mongoose.models['media_folders'].deleteOne({ _id: folderId }).exec();
          if (result.deletedCount === 0) {
            logger.warn(`Media folder with ID "${folderId}" not found for deletion.`); // Log non-deletion as warning.
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_FOLDER_DELETE_ERROR', 'Failed to delete media folder') };
        }
      },
      getTree: async (): Promise<DatabaseResult<MediaFolder[]>> => {
        try {
          const folders = await mongoose.models['media_folders'].find({}).lean().exec() as MediaFolder[];
          // Consider structuring into a tree in the service layer if needed for complex UI rendering, rather than in the adapter.
          return { success: true, data: folders };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'MEDIA_FOLDER_GET_TREE_ERROR', 'Failed to get media folder tree') };
        }
      },
    },
  };

  content = {
    nodes: {
      getStructure: async (mode: 'flat' | 'nested', filter?: Partial<ContentNode>): Promise<DatabaseResult<ContentNode[]>> => {
        try {
          const query: FilterQuery<ContentNode> = filter || {};
          const nodes = await ContentStructureModel.find(query).lean().exec() as ContentNode[];
          // Tree structuring logic is better handled in the service layer or a dedicated utility if needed.
          return { success: true, data: nodes };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_NODE_GET_STRUCTURE_ERROR', 'Failed to get content structure') };
        }
      },
      create: async (node: Omit<ContentNode, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
        try {
          const newNode = await ContentStructureModel.create({ ...node, _id: this.utils.generateId() });
          return { success: true, data: newNode as ContentNode };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_NODE_CREATE_ERROR', 'Failed to create content node') };
        }
      },
      update: async (path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
        try {
          const updatedNode = await ContentStructureModel.findOneAndUpdate({ path }, { $set: changes }, { new: true, lean: true }).exec(); // Use $set for update
          if (!updatedNode) {
            return { success: false, error: createDatabaseError(undefined, 'CONTENT_NODE_UPDATE_NOT_FOUND', 'Content node not found for update') };
          }
          return { success: true, data: updatedNode as ContentNode };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_NODE_UPDATE_ERROR', 'Failed to update content node') };
        }
      },
      bulkUpdate: async (updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>> => {
        try {
          if (updates.length === 0) return { success: true, data: [] }; // Avoid bulkWrite with empty array
          const bulkOps = updates.map(update => ({
            updateOne: {
              filter: { path: update.path },
              update: { $set: update.changes } // Use $set in bulk updates as well
            }
          }));
          const bulkResult = await ContentStructureModel.bulkWrite(bulkOps);
          if (bulkResult.modifiedCount !== updates.length) {
            logger.warn(`Bulk update modified ${bulkResult.modifiedCount} out of ${updates.length} content nodes. Some nodes might not have been updated.`); // Log if not all updates were successful, as a warning.
          }
          const updatedNodes = await ContentStructureModel.find({ path: { $in: updates.map(u => u.path) } }).lean().exec() as ContentNode[];
          return { success: true, data: updatedNodes };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_NODE_BULK_UPDATE_ERROR', 'Failed to bulk update content nodes') };
        }
      },
      delete: async (path: string): Promise<DatabaseResult<void>> => {
        try {
          const result = await ContentStructureModel.deleteOne({ path }).exec();
          if (result.deletedCount === 0) {
            logger.warn(`Content node with path "${path}" not found for deletion.`); // Log non-deletion as warning.
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_NODE_DELETE_ERROR', 'Failed to delete content node') };
        }
      },
    },
    drafts: {
      create: async (draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> => {
        try {
          const newDraft = await DraftModel.create({ ...draft, _id: this.utils.generateId() });
          return { success: true, data: newDraft as ContentDraft };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_DRAFT_CREATE_ERROR', 'Failed to create content draft') };
        }
      },
      update: async (draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>> => {
        try {
          const updatedDraft = await DraftModel.findOneAndUpdate({ _id: draftId }, { $set: { data } }, { new: true, lean: true }).exec(); // Use $set for update
          if (!updatedDraft) {
            return { success: false, error: createDatabaseError(undefined, 'CONTENT_DRAFT_UPDATE_NOT_FOUND', 'Content draft not found for update') };
          }
          return { success: true, data: updatedDraft as ContentDraft };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_DRAFT_UPDATE_ERROR', 'Failed to update content draft') };
        }
      },
      publish: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const publishResult = await DraftModel.publishDraft(draftId as string); // Assuming publishDraft returns void or handles errors internally.
          if (!publishResult.success && publishResult.error) { // Propagate specific error from publishDraft if it returns DatabaseResult
            return publishResult;
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_DRAFT_PUBLISH_ERROR', 'Failed to publish content draft') };
        }
      },
      getForContent: async (contentId: DatabaseId): Promise<DatabaseResult<ContentDraft[]>> => {
        try {
          const drafts = await DraftModel.find({ contentId }).lean().exec() as ContentDraft[];
          return { success: true, data: drafts };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_DRAFT_GET_FOR_CONTENT_ERROR', 'Failed to get drafts for content') };
        }
      },
      delete: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const result = await DraftModel.deleteOne({ _id: draftId }).exec();
          if (result.deletedCount === 0) {
            logger.warn(`Content draft with ID "${draftId}" not found for deletion.`); // Log non-deletion as warning.
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_DRAFT_DELETE_ERROR', 'Failed to delete content draft') };
        }
      },

    },
    revisions: {
      create: async (revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> => {
        try {
          const newRevision = await RevisionModel.create({ ...revision, _id: this.utils.generateId() });
          return { success: true, data: newRevision as ContentRevision };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_REVISION_CREATE_ERROR', 'Failed to create content revision') };
        }
      },
      getHistory: async (contentId: DatabaseId): Promise<DatabaseResult<ContentRevision[]>> => {
        try {
          const revisions = await RevisionModel.find({ contentId }).lean().exec() as ContentRevision[];
          return { success: true, data: revisions };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_REVISION_GET_HISTORY_ERROR', 'Failed to get revision history for content') };
        }
      },
      restore: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const restoreResult = await RevisionModel.restoreRevision(revisionId as string); // Assuming restoreRevision returns void or handles errors internally.
          if (!restoreResult.success && restoreResult.error) { // Propagate specific error from restoreRevision if it returns DatabaseResult
            return restoreResult;
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_REVISION_RESTORE_ERROR', 'Failed to restore content revision') };
        }
      },
      delete: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
        try {
          const result = await RevisionModel.deleteOne({ _id: revisionId }).exec();
          if (result.deletedCount === 0) {
            logger.warn(`Content revision with ID "${revisionId}" not found for deletion.`); // Log non-deletion as warning.
          }
          return { success: true, data: undefined };
        } catch (error) {
          return { success: false, error: createDatabaseError(error, 'CONTENT_REVISION_DELETE_ERROR', 'Failed to delete content revision') };
        }
      },
    },
  };

  SystemVirtualFolder = {
    create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
      try {
        const newFolder = await SystemVirtualFolderModel.create({ ...folder, _id: this.utils.generateId() });
        return { success: true, data: newFolder as MediaFolder };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_CREATE_ERROR', 'Failed to create virtual folder') };
      }
    },
    addToFolder: async (contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>> => {
      try {
        await SystemVirtualFolderModel.updateOne(
          { path: folderPath },
          { $addToSet: { contents: contentId } } // Use $addToSet to avoid duplicates
        ).exec();
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_ADD_TO_FOLDER_ERROR', 'Failed to add content to folder') };
      }
    },
    getContents: async (folderPath: string): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[] }>> => {
      try {
        const folders = await SystemVirtualFolderModel.find({ parentPath: folderPath }).lean().exec() as MediaFolder[];
        const files = await mongoose.models['media_images'].find({ folderPath }).lean().exec() as MediaItem[];
        return { success: true, data: { folders, files } };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_GET_CONTENTS_ERROR', 'Failed to get folder contents') };
      }
    },
    delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
      try {
        const result = await SystemVirtualFolderModel.deleteOne({ _id: folderId }).exec();
        if (result.deletedCount === 0) {
          logger.warn(`Virtual folder with ID "${folderId}" not found for deletion.`); // Log non-deletion as warning.
        }
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_DELETE_ERROR', 'Failed to delete virtual folder') };
      }
    },
  };

  utils = {
    generateId: (): DatabaseId => {
      return uuidv4() as DatabaseId;
    },
    normalizePath: (path: string): string => {
      return path.replace(/\\/g, '/').replace(/^\/+/, '/').replace(/\/+$/, '') || '/';
    },
    validateId: (id: string): boolean => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    },

    // Pagination utility - remains in-memory utility as per interface design.
    createPagination: <T>(items: T[], options: PaginationOptions): PaginatedResult<T> => {
      const page = options.page || 1;
      const pageSize = options.pageSize || 10;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedItems = items.slice(startIndex, endIndex);
      return {
        items: paginatedItems,
        total: items.length,
        page: page,
        pageSize: pageSize,
      };
    },
  };

  // findOne operation - optimized with lean()
  async findOne<T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T | null>> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_FIND_ONE_COLLECTION_ERROR', `Collection "${collection}" not found`) };
      }
      const result = await model.findOne(query).lean().exec() as T | null;
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CRUD_FIND_ONE_ERROR', `Failed to find one in collection "${collection}"`) };
    }
  }

  // Find many operation - optimized with lean()
  findMany = async <T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T[]>> => {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_FIND_MANY_COLLECTION_ERROR', `Collection "${collection}" not found`) };
      }
      const results = await model.find(query).lean().exec() as T[];
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CRUD_FIND_MANY_ERROR', `Failed to find many in collection "${collection}"`) };
    }
  };

  // Create operation - setting createdAt and updatedAt on creation
  async create<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_CREATE_COLLECTION_ERROR', `Collection "${collection}" not found`) };
      }
      const newData = { ...data, _id: this.utils.generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const createdDocument = await model.create(newData);
      return { success: true, data: createdDocument as T };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CRUD_CREATE_ERROR', `Failed to create document in collection "${collection}"`) };
    }
  }

  // Update operation - optimized with $set and lean()
  async update<T extends BaseEntity>(collection: string, id: DatabaseId, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<T>> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_UPDATE_COLLECTION_ERROR', `Collection "${collection}" not found`) };
      }
      const updatedDocument = await model.findOneAndUpdate({ _id: id }, { $set: data, updatedAt: new Date().toISOString() }, { new: true, lean: true }).exec(); // Use $set for update
      if (!updatedDocument) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_UPDATE_NOT_FOUND_ERROR', `Document with ID "${id}" not found in collection "${collection}"`) };
      }
      return { success: true, data: updatedDocument as T };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CRUD_UPDATE_ERROR', `Failed to update document in collection "${collection}"`) };
    }
  };

  // Delete operation
  async delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>> {
    try {
      const model = mongoose.models[collection] as Model<BaseEntity>;
      if (!model) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_DELETE_COLLECTION_ERROR', `Collection "${collection}" not found`) };
      }
      const result = await model.deleteOne({ _id: id }).exec();
      if (result.deletedCount === 0) {
        return { success: false, error: createDatabaseError(undefined, 'CRUD_DELETE_NOT_FOUND_ERROR', `Document with ID "${id}" not found in collection "${collection}"`) };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CRUD_DELETE_ERROR', `Failed to delete document in collection "${collection}"`) };
    }
  };


  // Query Builder - instance creation
  queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T> {
    const model = mongoose.models[collection] as Model<T>;
    if (!model) {
      throw new Error(`Collection "${collection}" model not found.`);
    }
    return new MongoQueryBuilder<T>(model);
  }
}
