
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

// Stores
import type { Unsubscriber } from 'svelte/store';
import type { ScreenSize } from '@root/src/stores/screenSizeStore.svelte';
import type { UserPreferences, WidgetPreference } from '@root/src/stores/userPreferences.svelte';
import type { VirtualFolderUpdateData } from '@src/types/virtualFolder';

// Authentication Models
import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';


// Database Models
import { ContentStructureModel } from './models/contentStructure';
import { DraftModel } from './models/draft';
import { RevisionModel } from './models/revision';
import { ThemeModel } from './models/theme';
import { WidgetModel, widgetSchema } from './models/widget';
import { mediaSchema } from './models/media';
import { SystemVirtualFolderModel } from './models/systemVirtualFolder';
import { SystemPreferencesModel } from './models/systemPreferences';

// Types
import type { CollectionConfig } from '@src/content/types';
import type { ContentStructureNode } from './models/contentStructure';
import type { MediaBase, MediaType } from '@utils/media/mediaModels';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logging
import { logger } from '@utils/logger.svelte';

// Widget Manager
import '@widgets/index';


// Database
import mongoose from 'mongoose';
import type { Schema, Model, FilterQuery, UpdateQuery, ClientSession, SortOrder } from 'mongoose'; // Keep type imports for clarity

import type {
  DatabaseId,
  ISODateString,
  BaseEntity,
  Translation,
  SystemPreferences,
  ContentDraft,
  ContentRevision,
  Theme,
  WidgetConfig,
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
} from '../dbInterface';

import type { Draft, Revision, Theme, Widget, DocumentContent, CollectionModel } from '../dbInterface';


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
  private model: mongoose.Model<T>; // Use mongoose.Model
  private query: mongoose.FilterQuery<T> = {}; // Use mongoose.FilterQuery
  private limitValue = 0;
  private skipValue = 0;
  private sortFields: { [key in keyof T]?: mongoose.SortOrder } = {}; // Use mongoose.SortOrder
  private projectionFields: Partial<Record<keyof T, 1 | 0>> = {};
  private isDistinctQuery = false;

  constructor(model: mongoose.Model<T>) { // Use mongoose.Model
    this.model = model;
  }


  where(conditions: Partial<T> | ((item: T) => boolean)): this {
    if (typeof conditions === 'function') {
      // In-memory filtering (less efficient for large datasets, consider MongoDB aggregation for complex cases)
      // For now, we'll just store the function and apply it in execute() - for real DB queries, translate to MongoDB query syntax
      // This is a simplified example and might not cover all function-based query scenarios.
      // For production, consider using MongoDB's aggregation pipeline for complex function-based queries.
      throw new Error("Function-based 'where' clause is not fully implemented for MongoDB QueryBuilder. Use Partial<T> for conditions.");

    } else {
      this.query = { ...this.query, ...conditions };
    }
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

  sort(field: keyof T, direction: 'asc' | 'desc'): this {
    this.sortFields[field] = direction === 'asc' ? 1 : -1;
    return this;
  }

  project(fields: Partial<Record<keyof T, boolean>>): this {
    this.projectionFields = Object.keys(fields).reduce((proj, key) => {
      proj[key as keyof T] = fields[key] ? 1 : 0;
      return proj;
    }, {} as Partial<Record<keyof T, 1 | 0>>);
    return this;
  }

  distinct(): this {
    this.isDistinctQuery = true;
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
        // MongoDB does not have a direct distinct() on the query builder like this.
        // You might need to specify a field for distinct, or use aggregation for more complex distinct operations.
        // For simplicity, we are assuming distinct is not directly applicable to the entire result set in this context.
        logger.warn("distinct() is called but might not be directly applicable to the entire result set. Consider using aggregation if needed.");
      }


      const results = await mongoQuery.lean().exec() as T[]; // Explicitly cast to T[]
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'QUERY_ERROR', 'Failed to execute query') };
    }
  }
}


export class MongoDBAdapter implements DatabaseAdapter {
  // Core Connection Management
  async connect(): Promise<DatabaseResult<void>> {
    try {
      if (!mongoose.connection.readyState) {
        await mongoose.connect(process.env.MONGODB_URI || '', {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });
        logger.info('MongoDB connection established');
        return { success: true, data: undefined };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CONNECTION_ERROR', 'MongoDB connection failed') };
    }
  }
  private unsubscribe: Unsubscriber | undefined;
  private collectionsInitialized = false;

  themes = {
    // Set the default theme
    async setDefaultTheme(themeName: string): Promise<void> {
      return ThemeModel.setDefaultTheme(themeName);
    },

    // Fetch the default theme
    async getDefaultTheme(): Promise<Theme | null> {
      return ThemeModel.getDefaultTheme();
    },

    // Store themes in the database
    async storeThemes(themes: Theme[]): Promise<void> {
      logger.debug("MongoDBAdapter.themes.storeThemes called"); // Add this line to confirm method is reached
      return ThemeModel.storeThemes(themes); // Delegation to ThemeModel
    },

    // Fetch all themes
    async getAllThemes(): Promise<Theme[]> {
      return ThemeModel.getAllThemes();
    },
  };

  virtualFolders = {
    // Get all virtual folders
    async getVirtualFolders(): Promise<Document[]> {
      return SystemVirtualFolderModel.getAllVirtualFolders();
    },

    // Create a virtual folder in the database
    async createVirtualFolder(folderData: {
      name: string;
      parent?: string;
      path: string;
      icon?: string;
      order?: number;
      type?: 'folder' | 'collection';
    }): Promise<Document> {
      return SystemVirtualFolderModel.createVirtualFolder(folderData);
    },

    // Get contents of a virtual folder
    async getVirtualFolderContents(folderId: string): Promise<Document[]> {
      return SystemVirtualFolderModel.getVirtualFolderContents(folderId);
    },

    // Update a virtual folder
    async updateVirtualFolder(folderId: string, updateData: VirtualFolderUpdateData): Promise<Document | null> {
      return SystemVirtualFolderModel.updateVirtualFolder(folderId, updateData);
    },

    // Delete a virtual folder
    async deleteVirtualFolder(folderId: string): Promise<boolean> {
      return SystemVirtualFolderModel.deleteVirtualFolder(folderId);
    },
  };

  // Helper method to recursively scan directories for compiled content structure files
  private async scanDirectoryForContentStructure(dirPath: string): Promise<string[]> {
    const collectionFiles: string[] = [];
    try {
      const entries = await import('fs').then((fs) => fs.promises.readdir(dirPath, { withFileTypes: true }));
      logger.debug(`Scanning directory: \x1b[34m${dirPath}\x1b[0m`);
      for (const entry of entries) {
        const fullPath = new URL(entry.name, dirPath).pathname;
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          logger.debug(`Found subdirectory: \x1b[34m${entry.name}\x1b[0m`);
          const subDirFiles = await this.scanDirectoryForContentStructure(fullPath);
          collectionFiles.push(...subDirFiles);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          logger.debug(`Found compiled collection file: \x1b[34m${entry.name}\x1b[0m`);
          collectionFiles.push(fullPath);
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dirPath}: ${error.message}`);
    }
    return collectionFiles;
  }

  // Create or update content structure
  async createOrUpdateContentStructure(contentData: {
    _id: string;
    name: string;
    path: string;
    icon?: string;
    order?: number;
    isCategory?: boolean;
    collectionConfig?: unknown;
    translations?: { languageTag: string; translationName: string }[];
  }): Promise<void> {
    try {
      const type = contentData.isCategory !== undefined ? (contentData.isCategory ? 'category' : 'collection') : 'category';
      const existingNode = await ContentStructureModel.findOne({ path: contentData.path }).exec();
      if (existingNode) {
        // Update existing node
        existingNode._id = contentData._id;
        existingNode.name = contentData.name;
        existingNode.path = contentData.path;
        existingNode.icon = contentData.icon || 'iconoir:info-empty';
        existingNode.order = contentData.order || 999;
        existingNode.nodeType = type;
        existingNode.isCollection = contentData.isCategory;
        existingNode.collectionConfig = contentData.collectionConfig;
        existingNode.markModified('type'); // Ensure type field is marked as modified

        // Update translations if provided
        if (contentData.translations) {
          existingNode.translations = contentData.translations.map(t => ({
            languageTag: t.languageTag,
            translationName: t.translationName
          }));
        }

        await existingNode.save();
        logger.info(`Updated content structure: \x1b[34m${contentData.path}\x1b[0m`);
      } else {
        // Create new node with validated UUID
        const newNode = new ContentStructureModel({
          ...contentData,
          _id: contentData._id, // Already validated
          type,
          parentPath: contentData.path.split('/').slice(0, -1).join('/') || null
        });
        await newNode.save();
        logger.info(`Created content structure: \x1b[34m${contentData.path}\x1b[0m with UUID: \x1b[34m${contentData._id}\x1b[0m`);
      }
    } catch (error) {
      logger.error(`Error creating/updating content structure: ${error.message}`);
      throw new Error(`Error creating/updating content structure`);
    }
  }

  // Generate a unique ID using UUID
  generateId(): string {
    return uuidv4();
  }

  // Get collection models
  async getCollectionModels<T = unknown>(): Promise<Map<string, Model<T>>> {
    try {
      const models = new Map<string, Model<T>>();

      // Get all registered models
      for (const [name, model] of Object.entries(mongoose.models)) {
        if (name.startsWith('collection_')) {
          models.set(name, model as Model<T>);
        }
      }

      // Add base models if not already present
      const baseModels = ['auth_users', 'auth_tokens', 'auth_sessions', 'Widget'];
      for (const modelName of baseModels) {
        if (mongoose.models[modelName] && !models.has(modelName)) {
          models.set(name, mongoose.models[modelName] as Model<T>);
        }
      }

      logger.debug(`Returning ${models.size} collection models`);
      return models;
    } catch (error) {
      logger.error('Failed to get collection models: ' + error.message);
      throw new Error('Failed to get collection models');
    }
  }

  // Set up authentication models
  async setupAuthModels(): Promise<void> {
    try {
      // Explicitly import schemas before setting up models
      const { UserSchema } = await import('@src/auth/mongoDBAuth/userAdapter');
      const { TokenSchema } = await import('@src/auth/mongoDBAuth/tokenAdapter');
      const { SessionSchema } = await import('@src/auth/mongoDBAuth/sessionAdapter');

      this.setupModel('auth_users', UserSchema);
      this.setupModel('auth_sessions', SessionSchema);
      this.setupModel('auth_tokens', TokenSchema);

      logger.info('Authentication models set up successfully.');
    } catch (error) {
      logger.error('Failed to set up authentication models: ' + error.message);
      throw Error('Failed to set up authentication models');
    }
  }

  // Helper method to set up models if they don't already exist
  private setupModel(name: string, schema: mongoose.Schema) { // Use mongoose.Schema
    if (!mongoose.models[name]) {
      mongoose.model(name, schema);
      logger.debug(`\x1b[34m${name}\x1b[0m model created.`);
    } else {
      logger.debug(`\x1b[34m${name}\x1b[0m model already exists.`);
    }
  }

  // Set up media models
  setupMediaModels(): void {
    const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote', 'media_collection'];
    mediaSchemas.forEach((schemaName) => {
      this.setupModel(schemaName, mediaSchema);
    });
    logger.info('Media models set up successfully.');
  }

  // Set up widget models
  setupWidgetModels(): void {
    // This will ensure that the Widget model is created or reused
    if (!mongoose.models.Widget) {
      mongoose.model('Widget', widgetSchema);
      logger.info('Widget model created.');
    } else {
      logger.info('Widget model already exists.');
    }
    logger.info('Widget models set up successfully.');
  }

  // Implementing findOne method
  async findOne<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>): Promise<T | null> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`Collection ${collection} does not exist.`);
        throw new Error(`Collection ${collection} does not exist.`);
      }
      return await model.findOne(query).lean().exec();
    } catch (error) {
      logger.error(`Error in findOne for collection ${collection}:`, { error });
      throw new Error(`Error in findOne for collection ${collection}`);
    }
  }

  // Implementing findMany method
  async findMany<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>): Promise<T[]> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`findMany failed. Collection ${collection} does not exist.`);
        throw new Error(`findMany failed. Collection ${collection} does not exist.`);
      }
      return await model.find(query).lean().exec();
    } catch (error) {
      logger.error(`Error in findMany for collection ${collection}:`, { error });
      throw new Error(`Error in findMany for collection ${collection}`);
    }
  }
  // Implementing insertOne method
  async insertOne<T extends DocumentContent = DocumentContent>(collection: string, doc: Partial<T>): Promise<T> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`insertOne failed. Collection ${collection} does not exist.`);
        throw new Error(`insertOne failed. Collection ${collection} does not exist.`);
      }
      return await model.create(doc);
    } catch (error) {
      logger.error(`Error inserting document into ${collection}:`, { error });
      throw new Error(`Error inserting document into ${collection}`);
    }
  }

  // Implementing insertMany method
  async insertMany<T extends DocumentContent = DocumentContent>(collection: string, docs: Partial<T>[]): Promise<T[]> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`insertMany failed. Collection ${collection} does not exist.`);
        throw new Error(`insertMany failed. Collection ${collection} does not exist.`);
      }
      return await model.insertMany(docs);
    } catch (error) {
      logger.error(`Error inserting many documents into ${collection}:`, { error });
      throw new Error(`Error inserting many documents into ${collection}`);
    }
  }

  // Implementing updateOne method
  async updateOne<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>, update: UpdateQuery<T>): Promise<T> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`updateOne failed. Collection ${collection} does not exist.`);
        throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
      }

      const result = await model.findOneAndUpdate(query, update, { new: true, strict: false }).lean().exec();

      if (!result) {
        throw new Error(`No document found to update with query: ${JSON.stringify(query)}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error updating document in ${collection}:`, { error });
      throw new Error(`Error updating document in ${collection}`);
    }
  }

  // Implementing updateMany method
  async updateMany<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>, update: UpdateQuery<T>): Promise<T[]> {
    try {
      const model = mongoose.models[collection] as Model<T>;
      if (!model) {
        logger.error(`updateMany failed. Collection ${collection} does not exist.`);
        throw new Error(`updateMany failed. Collection ${collection} does not exist.`);
      }
      return await model.updateMany(query, update, { strict: false }).lean().exec();
    } catch (error) {
      logger.error(`Error updating many documents in ${collection}:`, { error });
      throw new Error(`Error updating many documents in ${collection}`);
    }
  }

  // Implementing deleteOne method
  async deleteOne(collection: string, query: FilterQuery<Document>): Promise<number> {
    try {
      const model = mongoose.models[collection] as Model<Document>;
      if (!model) {
        throw new Error(`Collection ${collection} not found`);
      }

      const result = await model.deleteOne(query).exec();
      return result.deletedCount ?? 0;
    } catch (error) {
      logger.error(`Error deleting document from ${collection}:`, { error });
      throw new Error(`Error deleting document from ${collection}`);
    }
  }

  // Implementing deleteMany method
  async deleteMany(collection: string, query: FilterQuery<Document>): Promise<number> {
    try {
      const model = mongoose.models[collection] as Model<Document>;
      if (!model) {
        throw new Error(`Collection ${collection} not found`);
      }

      const result = await model.deleteMany(query).exec();
      return result.deletedCount ?? 0;
    } catch (error) {
      logger.error(`Error deleting many documents from ${collection}:`, { error });
      throw new Error(`Error deleting many documents from ${collection}`);
    }
  }

  // Implementing countDocuments method
  async countDocuments(collection: string, query: FilterQuery<Document> = {}): Promise<number> {
    try {
      const model = mongoose.models[collection] as Model<Document>;
      if (!model) {
        logger.error(`countDocuments failed. Collection ${collection} does not exist.`);
        throw new Error(`countDocuments failed. Collection ${collection} does not exist.`);
      }

      return await model.countDocuments(query).exec();
    } catch (error) {
      logger.error(`Error counting documents in ${collection}:`, { error });
      throw new Error(`Error counting documents in ${collection}`);
    }
  }

  // Helper method to check if collection exists in MongoDB
  private async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await mongoose.connection.db.listCollections({ name: collectionName.toLowerCase() }).toArray();
      return collections.length > 0;
    } catch (error) {
      logger.error(`Error checking if collection exists: ${error}`);
      return false;
    }
  }

  // Create or update a collection model based on the provided configuration
  async createCollectionModel(collection: CollectionConfig): Promise<CollectionModel> {
    try {
      // Generate UUID if not provided
      const collectionUuid = collection._id || this.utils.generateId();
      logger.debug(`Using UUID for collection: \x1b[34m${collectionUuid}\x1b[0m`);

      // Ensure collection name is prefixed with collection_
      const collectionName = `collection_${collectionUuid}`;
      logger.debug(`Creating collection model with name: \x1b[34m${collectionName}\x1b[0m`);

      // Return existing model if it exists
      if (mongoose.models[collectionName]) {
        logger.debug(`Model \x1b[34m${collectionName}\x1b[0m already exists in Mongoose, returning existing model`);
        return mongoose.models[collectionName] as CollectionModel;
      }

      // Clear existing model from Mongoose's cache if it exists
      if (mongoose.modelNames().includes(collectionName)) {
        delete mongoose.models[collectionName];
        delete (mongoose as mongoose.Mongoose & { modelSchemas: { [key: string]: mongoose.Schema } }).modelSchemas[collectionName];
      }

      logger.debug(`Collection \x1b[34m${collectionName}\x1b[0m does not exist in Mongoose, creating new model`);

      // Base schema definition for the main collection
      const schemaDefinition: Record<string, unknown> = {
        _id: { type: String },
        status: { type: String, default: 'draft' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        createdBy: { type: Schema.Types.Mixed, ref: 'auth_users' },
        updatedBy: { type: Schema.Types.Mixed, ref: 'auth_users' }
      };

      // Process fields if they exist
      if (collection.schema?.fields && Array.isArray(collection.schema.fields)) {
        logger.debug(`Processing \x1b[34m${collection.schema.fields.length}\x1b[0m fields for \x1b[34m${collectionName}\x1b[0m`);
        for (const field of collection.schema.fields) {
          try {
            // Generate fieldKey from label if db_fieldName is not present
            const fieldKey = field.db_fieldName || (field.label ? field.label.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null) || field.Name;

            if (!fieldKey) {
              logger.error(`Field missing required identifiers:`, JSON.stringify(field, null, 2));
              continue;
            }

            const isRequired = field.required || false;
            const isTranslated = field.translate || false;
            const isSearchable = field.searchable || false;
            const isUnique = field.unique || false;

            // Base field schema with improved type handling
            const fieldSchema: mongoose.SchemaDefinitionProperty = {
              type: Schema.Types.Mixed, // Default to Mixed type
              required: isRequired,
              translate: isTranslated,
              searchable: isSearchable,
              unique: isUnique
            };

            // Add field specific validations or transformations if needed
            if (field.type === 'string') {
              fieldSchema.type = String;
            } else if (field.type === 'number') {
              fieldSchema.type = Number;
            } else if (field.type === 'boolean') {
              fieldSchema.type = Boolean;
            } else if (field.type === 'date') {
              fieldSchema.type = Date;
            }

            schemaDefinition[fieldKey] = fieldSchema;
          } catch (error) {
            logger.error(`Error processing field:`, error);
            logger.error(`Field data:`, JSON.stringify(field, null, 2));
          }
        }
      } else {
        logger.warn(`No fields defined in schema for collection: \x1b[34m${collectionName}\x1b[0m`);
      }

      // Optimized schema options for the main collection
      const schemaOptions: mongoose.SchemaOptions = {
        strict: collection.schema?.strict !== false,
        timestamps: true,
        collection: collectionName.toLowerCase(),
        autoIndex: true,
        minimize: false,
        toJSON: { virtuals: true, getters: true },
        toObject: { virtuals: true, getters: true },
        id: false,
        versionKey: false
      };

      // Create schema for the main collection
      const schema = new mongoose.Schema(schemaDefinition, schemaOptions);

      // Add indexes for the main collection
      schema.index({ createdAt: -1 });
      schema.index({ status: 1, createdAt: -1 });

      // Performance optimization: create indexes in background
      schema.set('backgroundIndexing', true);
      // Create and return the new model
      const model = mongoose.model(collectionName, schema);
      logger.debug(`Collection model \x1b[34m${collectionName}\x1b[0m created successfully.`);
      return model;
    } catch (error) {
      logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
      logger.error('Collection config that caused error:', JSON.stringify(collection, null, 2));
      throw error;
    }
  }


  // Methods for Draft and Revision Management
  // Create a new draft
  async createDraft(content: Record<string, unknown>, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> {
    return DraftModel.createDraft(content, collectionId, original_document_id, user_id);
  }

  // Update a draft
  async updateDraft(draft_id: string, content: Record<string, unknown>): Promise<Draft> {
    return DraftModel.updateDraft(draft_id, content);
  }

  // Publish a draft
  async publishDraft(draft_id: string): Promise<Draft> {
    return DraftModel.publishDraft(draft_id);
  }

  // Get drafts by user
  async getDraftsByUser(user_id: string): Promise<Draft[]> {
    return DraftModel.getDraftsByUser(user_id);
  }

  // Create a new revision
  async createRevision(collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<Revision> {
    return RevisionModel.createRevision(collectionId, documentId, userId, data);
  }

  // Get revisions for a document
  async getRevisions(collectionId: string, documentId: string): Promise<Revision[]> {
    return RevisionModel.getRevisions(collectionId, documentId);
  }

  // Delete a specific revision
  async deleteRevision(revisionId: string): Promise<void> {
    return RevisionModel.deleteRevision(revisionId);
  }

  // Restore a specific revision to its original document
  async restoreRevision(collectionId: string, revisionId: string): Promise<void> {
    return RevisionModel.restoreRevision(collectionId, revisionId);
  }

  // Methods for Widget Management

  // Install a new widget
  async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
    return WidgetModel.installWidget(widgetData);
  }

  // Fetch all widgets
  async getAllWidgets(): Promise<Widget[]> {
    return WidgetModel.getAllWidgets();
  }

  // Fetch active widgets
  async getActiveWidgets(): Promise<string[]> {
    return WidgetModel.getActiveWidgets();
  }

  // Activate a widget
  async activateWidget(widgetName: string): Promise<void> {
    return WidgetModel.activateWidget(widgetName);
  }

  // Deactivate a widget
  async deactivateWidget(widgetName: string): Promise<void> {
    return WidgetModel.deactivateWidget(widgetName);
  }

  // Update a widget
  async updateWidget(widgetName: string, updateData: Partial<Widget>): Promise<void> {
    return WidgetModel.updateWidget(widgetName, updateData);
  }

  // Methods for Theme Management
  // Set the default theme
  async setDefaultTheme(themeName: string): Promise<void> {
    return ThemeModel.setDefaultTheme(themeName);
  }

  // Fetch the default theme
  async getDefaultTheme(): Promise<Theme | null> {
    return ThemeModel.getDefaultTheme();
  }

  // Store themes in the database
  async storeThemes(themes: Theme[]): Promise<void> {
    logger.debug("MongoDBAdapter.themes.storeThemes called"); // Add this line to confirm method is reached
    return ThemeModel.storeThemes(themes); // Delegation to ThemeModel
  }

  // Fetch all themes
  async getAllThemes(): Promise<Theme[]> {
    return ThemeModel.getAllThemes();
  }

  virtualFolders = {
    getVirtualFolders: this.getVirtualFolders,
    createVirtualFolder: this.createVirtualFolder,
    getVirtualFolderContents: this.getVirtualFolderContents,
    updateVirtualFolder: this.updateVirtualFolder,
    deleteVirtualFolder: this.deleteVirtualFolder,
  }

  // Methods for System Preferences Management
  // Set user preferences
  async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    return SystemPreferencesModel.setUserPreferences(userId, preferences);
  }

  //Retrieve system preferences for a user
  async getSystemPreferences(user_id: string): Promise<UserPreferences | null> {
    return SystemPreferencesModel.getSystemPreferences(user_id);
  }

  // Update system preferences for a user
  async updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> {
    return SystemPreferencesModel.updateSystemPreferences(user_id, screenSize, preferences);
  }

  // Clear system preferences for a user
  async clearSystemPreferences(user_id: string): Promise<void> {
    return SystemPreferencesModel.clearSystemPreferences(user_id);
  }

  // Methods for Virtual Folder Management
  // Create a virtual folder in the database
  async createVirtualFolder(folderData: {
    name: string;
    parent?: string;
    path: string;
    icon?: string;
    order?: number;
    type?: 'folder' | 'collection';
  }): Promise<Document> {
    return this.virtualFolders.createVirtualFolder(folderData);
  }

  // Get all virtual folders
  async getVirtualFolders(): Promise<Document[]> {
    return this.virtualFolders.getVirtualFolders();
  }

  // Get contents of a virtual folder
  async getVirtualFolderContents(folderId: string): Promise<Document[]> {
    return this.virtualFolders.getVirtualFolderContents(folderId);
  }

  // Update a virtual folder
  async updateVirtualFolder(folderId: string, updateData: VirtualFolderUpdateData): Promise<Document | null> {
    return this.virtualFolders.updateVirtualFolder(folderId, updateData);
  }

  // Delete a virtual folder
  async deleteVirtualFolder(folderId: string): Promise<boolean> {
    return this.virtualFolders.deleteVirtualFolder(folderId);
  }

  // Move media to a virtual folder
  async moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean> {
    return this.media.moveMediaToFolder(mediaId, folderId);
  }

  // Content Structure Methods
  async upsertContentStructureNode(contentData: ContentStructureNode): Promise<ContentStructureNode> {
    return ContentStructureModel.upsertContentStructureNode(contentData);
  }

  async getContentByPath(path: string): Promise<Document | null> {
    return ContentStructureModel.getContentByPath(path);
  }

  async getContentStructureById(id: string): Promise<Document | null> {
    return ContentStructureModel.getContentStructureById(id);
  }

  async getContentStructure(): Promise<ContentStructureNode[]> {
    return ContentStructureModel.getContentStructure();
  }

  async getContentStructureChildren(parentId: string): Promise<Document[]> {
    return ContentStructureModel.getContentStructureChildren(parentId);
  }

  async updateContentStructure(contentId: string, updateData: Partial<ContentStructureNode>): Promise<Document | null> {
    return ContentStructureModel.updateContentStructure(contentId, updateData);
  }

  async deleteContentStructure(contentId: string): Promise<boolean> {
    return ContentStructureModel.deleteContentStructure(contentId);
  }

  // Methods for Media Management
  // Fetch all media
  async getAllMedia(): Promise<MediaType[]> {
    return this.media.getAllMedia();
  }

  // Delete media
  async deleteMedia(mediaId: string): Promise<boolean> {
    return this.media.deleteMedia(mediaId);
  }

  // Fetch media in a specific folder
  async getMediaInFolder(folder_id: string): Promise<MediaType[]> {
    return this.media.getMediaInFolder(folder_id);
  }

  // Fetch the last five collections
  async getLastFiveCollections(): Promise<Document[]> {
    return this.getLastFiveCollections();
  }

  // Fetch logged-in users
  async getLoggedInUsers(): Promise<Document[]> {
    return this.getLoggedInUsers();
  }

  // Fetch CMS data
  async getCMSData(): Promise<{
    collections: number;
    media: number;
    users: number;
    drafts: number;
  }> {
    return this.getCMSData();
  }

  // Fetch the last five media documents
  async getLastFiveMedia(): Promise<MediaType[]> {
    return this.getLastFiveMedia();
  }

  // Methods for Disconnecting

  // Disconnect from MongoDB
  async disconnect(): Promise<DatabaseResult<void>> {
    return this.disconnect();
  }
}
