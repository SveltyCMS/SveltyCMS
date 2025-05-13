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
import type { ContentStructureNode as ContentNode } from './models/contentStructure';
import type { MediaType } from '@utils/media/mediaModels';

// System Logging
import { logger, type LoggableValue } from '@utils/logger.svelte';

// Widget Manager
import '@widgets/index';

// Database
import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import type { FilterQuery, UpdateQuery, Document, Model } from 'mongoose';

import type {
  DatabaseId,
  Theme,
  Widget,
  PaginationOptions,
  DatabaseResult,
  DatabaseError,
  DatabaseAdapter,
  CollectionModel,
  MediaItem,
  ISODateString,
  BaseEntity
} from '../dbInterface';
import {
  isISODateString,
  dateToISODateString,
  stringToISODateString,
  normalizeDateInput
} from '../../utils/dateUtils';

// Utility function to handle DatabaseErrors consistently
const createDatabaseError = (error: unknown, code: string, message: string): DatabaseError => {
  logger.error(`${code}: ${message}`, error);
  return {
    code,
    message,
    details: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
};

export class MongoDBAdapter implements DatabaseAdapter {
  //  Core Connection Management
  private unsubscribe: Unsubscriber | undefined;
  private collectionsInitialized = false;

  async connect(): Promise<DatabaseResult<void>> {
    try {
      if (!mongoose.connection.readyState) {
        await mongoose.connect(process.env.MONGODB_URI || '', {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000
        });
        logger.info('MongoDB connection established');
        return { success: true, data: undefined };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'CONNECTION_ERROR', 'MongoDB connection failed') };
    }
  }

  //  Utility Methods
  public utils = {
    // Generate a unique ID using UUID
    generateId(): DatabaseId {
      return uuidv4() as DatabaseId;
    },
    normalizePath(path: string): string {
      return path;
    },
    validateId(id: string): boolean {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    },
    createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
      const { page = 1, pageSize = 10 } = options;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return {
        items: items.slice(start, end),
        total: items.length,
        page,
        pageSize
      };
    }
  };

  //  Content Structure Management
  content = {
    nodes: {
      // Helper method to recursively scan directories for compiled content structure files
      scanDirectoryForContentStructure: async (dirPath: string): Promise<string[]> => {
        const collectionFiles: string[] = [];
        try {
          const entries = await import('fs').then((fs) => fs.promises.readdir(dirPath, { withFileTypes: true }));
          logger.debug(`Scanning directory: \x1b[34m${dirPath}\x1b[0m`);
          for (const entry of entries) {
            const fullPath = new URL(entry.name, dirPath).pathname;
            if (entry.isDirectory()) {
              // Recursively scan subdirectories
              logger.debug(`Found subdirectory: \x1b[34m${entry.name}\x1b[0m`);
              const subDirFiles = await this.contentStructure.scanDirectoryForContentStructure(fullPath);
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
      },

      // Create or update content structure
      createOrUpdateContentStructure: async (contentData: {
        _id: string;
        name: string;
        path: string;
        icon?: string;
        order?: number;
        isCategory?: boolean;
        collectionConfig?: unknown;
        translations?: { languageTag: string; translationName: string }[];
      }): Promise<void> => {
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
            existingNode.type = type;
            existingNode.isCollection = contentData.isCategory;
            existingNode.collectionConfig = contentData.collectionConfig;
            existingNode.markModified('type'); // Ensure type field is marked as modified

            // Update translations if provided
            if (contentData.translations) {
              existingNode.translations = contentData.translations.map((t) => ({
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
      },
      upsertContentStructureNode: async (contentData: ContentNode): Promise<ContentNode> => {
        if (contentData.nodeType === 'collection') {
          return ContentStructureModel.upsertCollection(contentData);
        }
        return ContentStructureModel.upsertCategory(contentData);
      },

      getContentByPath: async (path: string): Promise<Document | null> => {
        return ContentStructureModel.getContentByPath(path);
      },

      getContentStructureById: async (id: string): Promise<Document | null> => {
        return ContentStructureModel.getContentStructureById(id);
      },

      getStructure: async (): Promise<ContentNode[]> => {
        return ContentStructureModel.getContentStructure();
      },

      getContentStructureChildren: async (parentId: string): Promise<Document[]> => {
        return ContentStructureModel.getContentStructureChildren(parentId);
      },

      updateContentStructure: async (contentId: string, updateData: Partial<ContentNode>): Promise<Document | null> => {
        return ContentStructureModel.updateContentStructure(contentId, updateData);
      },

      deleteContentStructure: async (contentId: string): Promise<boolean> => {
        return ContentStructureModel.deleteContentStructure(contentId);
      }
    }
  };

  //  Collection Management
  collection = {
    models: new Map<string, Model<unknown>>(),
    // Get collection models
    getModelsMap: async <T = unknown>(): Promise<Map<string, Model<T>>> => {
      try {
        return this.collection.models as Map<string, Model<T>>;
      } catch (error) {
        logger.error('Failed to get collection models: ' + error.message);
        throw new Error('Failed to get collection models');
      }
    },

    // Helper method to check if collection exists in MongoDB
    collectionExists: async (collectionName: string): Promise<boolean> => {
      try {
        const collections = await mongoose.connection.db?.listCollections({ name: collectionName.toLowerCase() }).toArray();
        return collections.length > 0;
      } catch (error) {
        logger.error(`Error checking if collection exists: ${error}`);
        return false;
      }
    },
    getModel: (id: string): CollectionModel => {
      return this.collection.models.get(id);
    },

    // Create or update a collection model based on the provided configuration
    createModel: async (collection: CollectionConfig): Promise<CollectionModel> => {
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
          this.collection.models.set(collectionUuid, mongoose.models[collectionName]);
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
        if (collection.fields && Array.isArray(collection.fields)) {
          logger.debug(`Processing \x1b[34m${collection.fields.length}\x1b[0m fields for \x1b[34m${collectionName}\x1b[0m`);
          for (const field of collection.fields) {
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
        this.collection.models.set(collectionUuid, model);
        return model;
      } catch (error) {
        logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
        logger.error('Collection config that caused error:', JSON.stringify(collection, null, 2));
        throw error;
      }
    }
  };

  //  CRUD Operations
  crud = {
    // Implementing findOne method
    findOne: async <T extends DocumentContent>(collection: string, query: FilterQuery<T>): Promise<(T & { createdAt?: ISODateString; updatedAt?: ISODateString }) | null> => {
      try {
        const model = mongoose.models[collection] as Model<T>;
        if (!model) {
          logger.error(`Collection ${collection} does not exist.`);
          throw new Error(`Collection ${collection} does not exist.`);
        }
        const result = await model.findOne(query).lean().exec();
        if (result && result.createdAt) {
          result.createdAt = dateToISODateString(new Date(result.createdAt));
        }
        if (result && result.updatedAt) {
          result.updatedAt = dateToISODateString(new Date(result.updatedAt));
        }
        return result;
      } catch (error) {
        logger.error(`Error in findOne for collection ${collection}:`, { error });
        throw new Error(`Error in findOne for collection ${collection}`);
      }
    },

    // Implementing findMany method
    findMany: async <T extends BaseEntity>(collection: string, query: FilterQuery<T>): Promise<DatabaseResult<(T & { createdAt: ISODateString, updatedAt: ISODateString })[]>> => {
      try {
        const model = mongoose.models[collection] as Model<T>;
        if (!model) {
          logger.error(`findMany failed. Collection ${collection} does not exist.`);
          throw new Error(`findMany failed. Collection ${collection} does not exist.`);
        }
        const results = await model.find(query).lean().exec();


        return ({
          success: true,
          data: results.map(result => {
            if (result.createdAt) {
              result.createdAt = dateToISODateString(new Date(result.createdAt));
            }
            if (result.updatedAt) {
              result.updatedAt = dateToISODateString(new Date(result.updatedAt));
            }
            return result;
          })
        });
      } catch (error) {
        logger.error(`Error in findMany for collection ${collection}:`, { error });
        throw new Error(`Error in findMany for collection ${collection}`);
      }
    },
    // Implementing insertOne method
    insert: async <T extends DocumentContent = DocumentContent>(collection: string, doc: Partial<T>): Promise<T> => {
      try {
        const model = mongoose.models[collection] as Model<T>;
        if (!model) {
          logger.error(`insert failed. Collection ${collection} does not exist.`);
          throw new Error(`insert failed. Collection ${collection} does not exist.`);
        }

        // Validate and normalize date fields
        const now = new Date();
        const validatedDoc = {
          ...doc,
          createdAt: doc.createdAt ? normalizeDateInput(doc.createdAt) : dateToISODateString(now),
          updatedAt: doc.updatedAt ? normalizeDateInput(doc.updatedAt) : dateToISODateString(now)
        };

        return await model.create(validatedDoc);
      } catch (error) {
        if (error.name === 'ValidationError' && error.message.includes('Cast to date failed')) {
          const invalidFields = Object.keys(error.errors).filter(key =>
            error.errors[key].kind === 'Date'
          );
          logger.error(`Invalid date values provided for fields: ${invalidFields.join(', ')}`);
          throw new Error(`Invalid date values provided for fields: ${invalidFields.join(', ')}`);
        }
        logger.error(`Error inserting document into ${collection}:`, { error });
        throw new Error(`Error inserting document into ${collection}`);
      }
    },

    // Implementing insertMany method
    insertMany: async <T extends DocumentContent = DocumentContent>(collection: string, docs: Partial<T>[]): Promise<T[]> => {
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
    },

    // Implementing updateOne method
    update: async <T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>, update: UpdateQuery<T>): Promise<T & { createdAt?: ISODateString; updatedAt?: ISODateString }> => {
      try {
        const model = mongoose.models[collection] as Model<T>;
        if (!model) {
          logger.error(`updateOne failed. Collection ${collection} does not exist.`);
          throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
        }

        // Validate and normalize date fields in update
        if (update.$set) {
          if (update.$set.createdAt && !isISODateString(update.$set.createdAt)) {
            update.$set.createdAt = stringToISODateString(update.$set.createdAt);
          }
          if (update.$set.updatedAt) {
            update.$set.updatedAt = dateToISODateString(new Date());
          }
        }

        const result = await model.findOneAndUpdate(query, update, { new: true, strict: false }).lean().exec();

        if (!result) {
          throw new Error(`No document found to update with query: ${JSON.stringify(query)}`);
        }

        // Convert dates to ISO strings
        if (result.createdAt) {
          result.createdAt = dateToISODateString(new Date(result.createdAt));
        }
        if (result.updatedAt) {
          result.updatedAt = dateToISODateString(new Date(result.updatedAt));
        }

        return result;
      } catch (error) {
        logger.error(`Error updating document in ${collection}:`, { error });
        throw new Error(`Error updating document in ${collection}`);
      }
    },

    // Implementing updateMany method
    updateMany: async <T extends DocumentContent = DocumentContent>(
      collection: string,
      query: FilterQuery<T>,
      update: UpdateQuery<T>
    ): Promise<T[]> => {
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
    },

    // Implementing deleteOne method
    deleteOne: async (collection: string, query: FilterQuery<Document>): Promise<number> => {
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
    },

    // Implementing deleteMany method
    deleteMany: async (collection: string, query: FilterQuery<Document>): Promise<number> => {
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
    },

    // Implementing countDocuments method
    countDocuments: async (collection: string, query: FilterQuery<Document> = {}): Promise<number> => {
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
  };

  //  Authentication Model Management
  auth = {
    // Set up authentication models
    setupAuthModels: async (): Promise<void> => {
      try {
        // Explicitly import schemas before setting up models
        const { UserSchema } = await import('@src/auth/mongoDBAuth/userAdapter');
        const { TokenSchema } = await import('@src/auth/mongoDBAuth/tokenAdapter');
        const { SessionSchema } = await import('@src/auth/mongoDBAuth/sessionAdapter');

        this.modelSetup.setupModel('auth_users', UserSchema);
        this.modelSetup.setupModel('auth_sessions', SessionSchema);
        this.modelSetup.setupModel('auth_tokens', TokenSchema);

        logger.info('Authentication models set up successfully.');
      } catch (error) {
        logger.error('Failed to set up authentication models: ' + error.message);
        throw Error('Failed to set up authentication models');
      }
    }
  };

  //  Media Model Management
  media = {
    // Set up media models
    setupMediaModels: async (): Promise<void> => {
      const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote', 'media_collection'];
      mediaSchemas.forEach((schemaName) => {
        this.modelSetup.setupModel(schemaName, mediaSchema);
      });
      logger.info('Media models set up successfully.');
    },

    files: {
      upload: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
        try {
          const result = await this.modelSetup.uploadMedia(file);
          return result;
        } catch (error) {
          logger.error('Error uploading file:', error as LoggableValue);
        }
      }
    },

    // Fetch all media

    // Delete media
    deleteMedia: async (mediaId: string): Promise<boolean> => {
      try {
        const result = await mongoose.models['media_files'].deleteOne({ _id: mediaId });
        return result.deletedCount === 1;
      } catch (error) {
        logger.error(`Error deleting media ${mediaId}:`, error);
        return false;
      }
    },

    // Fetch media in a specific folder
    getMediaInFolder: async (folderId: string): Promise<MediaType[]> => {
      try {
        return await mongoose.models['media_files']
          .find({ folderId })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
      } catch (error) {
        logger.error(`Error getting media for folder ${folderId}:`, error);
        return [];
      }
    },

    // Move media to a virtual folder
    moveMediaToFolder: async (mediaId: string, folderId: string): Promise<boolean> => {
      try {
        const result = await mongoose.models['media_files'].updateOne(
          { _id: mediaId },
          { $set: { folderId } }
        );
        return result.modifiedCount === 1;
      } catch (error) {
        logger.error(`Error moving media ${mediaId} to folder ${folderId}:`, error);
        return false;
      }
    },

    //Fetch the last five media documents
    getLastFiveMedia: async (): Promise<MediaType[]> => {
      throw new Error('Method not implemented.');
    }
  };

  //  Model Setup Helper
  private modelSetup = {
    // Helper method to set up models if they don't already exist
    setupModel: (name: string, schema: mongoose.Schema) => {
      // Use mongoose.Schema
      if (!mongoose.models[name]) {
        mongoose.model(name, schema);
        logger.debug(`\x1b[34m${name}\x1b[0m model created.`);

        // Register discriminators when setting up content structure model
        if (name === 'system_content_structure') {
          import('./models/contentStructure').then(({ registerContentStructureDiscriminators }) => {
            registerContentStructureDiscriminators();
          });
        }
      } else {
        logger.debug(`\x1b[34m${name}\x1b[0m model already exists.`);
      }
    }
  };

  //  Draft and Revision Management
  draftsAndRevisions = {
    // Create a new draft
    createDraft: async (content: Record<string, unknown>, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> => {
      return DraftModel.createDraft(content, collectionId, original_document_id, user_id);
    },

    // Update a draft
    updateDraft: async (draft_id: string, content: Record<string, unknown>): Promise<Draft> => {
      return DraftModel.updateDraft(draft_id, content);
    },

    // Publish a draft
    publishDraft: async (draft_id: string): Promise<Draft> => {
      return DraftModel.publishDraft(draft_id);
    },

    // Get drafts by user
    getDraftsByUser: async (user_id: string): Promise<Draft[]> => {
      return DraftModel.getDraftsByUser(user_id);
    },

    // Create a new revision
    createRevision: async (collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<Revision> => {
      return RevisionModel.createRevision(collectionId, documentId, userId, data);
    },

    // Get revisions for a document
    getRevisions: async (collectionId: string, documentId: string): Promise<Revision[]> => {
      return RevisionModel.getRevisions(collectionId, documentId);
    },

    // Delete a specific revision
    deleteRevision: async (revisionId: string): Promise<void> => {
      return RevisionModel.deleteRevision(revisionId);
    },

    // Restore a specific revision to its original document
    restoreRevision: async (collectionId: string, revisionId: string): Promise<void> => {
      return RevisionModel.restoreRevision(collectionId, revisionId);
    }
  };

  //  Widget Management
  widgets = {
    setupWidgetModels: async (): Promise<void> => {
      // This will ensure that the Widget model is created or reused
      if (!mongoose.models.Widget) {
        mongoose.model('Widget', widgetSchema);
        logger.info('Widget model created.');
      } else {
        logger.info('Widget model already exists.');
      }
      logger.info('Widget models set up successfully.');
    },

    // Install a new widget
    installWidget: async (widgetData: { name: string; isActive?: boolean }): Promise<void> => {
      return WidgetModel.installWidget(widgetData);
    },

    // Fetch all widgets
    getAllWidgets: async (): Promise<Widget[]> => {
      return WidgetModel.getAllWidgets();
    },

    // Fetch active widgets
    getActiveWidgets: async (): Promise<string[]> => {
      return WidgetModel.getActiveWidgets();
    },

    // Activate a widget
    activateWidget: async (widgetName: string): Promise<void> => {
      return WidgetModel.activateWidget(widgetName);
    },

    // Deactivate a widget
    deactivateWidget: async (widgetName: string): Promise<void> => {
      return WidgetModel.deactivateWidget(widgetName);
    },

    // Update a widget
    updateWidget: async (widgetName: string, updateData: Partial<Widget>): Promise<void> => {
      return WidgetModel.updateWidget(widgetName, updateData);
    }
  };

  //  Theme Management
  themes = {
    // Set the default theme
    setDefaultTheme: async (themeName: string): Promise<void> => {
      return ThemeModel.setDefaultTheme(themeName);
    },

    // Fetch the default theme
    getDefaultTheme: async (): Promise<Theme | null> => {
      return ThemeModel.getDefaultTheme();
    },

    // Store themes in the database
    storeThemes: async (themes: Theme[]): Promise<void> => {
      logger.debug('MongoDBAdapter.themes.storeThemes called'); // Add this line to confirm method is reached
      return ThemeModel.storeThemes(themes, this.utils.generateId); // Delegation to ThemeModel
    },

    // Fetch all themes
    getAllThemes: async (): Promise<Theme[]> => {
      return ThemeModel.getAllThemes();
    }
  };

  //  System Preferences Management
  systemPreferences = {
    // Set user preferences
    setUserPreferences: async (userId: string, preferences: UserPreferences): Promise<void> => {
      return SystemPreferencesModel.setUserPreferences(userId, preferences);
    },

    //Retrieve system preferences for a user
    getSystemPreferences: async (user_id: string): Promise<UserPreferences | null> => {
      return SystemPreferencesModel.getSystemPreferences(user_id);
    },

    // Update system preferences for a user
    updateSystemPreferences: async (user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> => {
      return SystemPreferencesModel.updateSystemPreferences(user_id, screenSize, preferences);
    },

    // Clear system preferences for a user
    clearSystemPreferences: async (user_id: string): Promise<void> => {
      return SystemPreferencesModel.clearSystemPreferences(user_id);
    }
  };

  //  Virtual Folder Management
  virtualFolders = {
    // Create a virtual folder in the database
    create: async (folderData: {
      name: string;
      parent?: string;
      path: string;
      icon?: string;
      order?: number;
      type?: 'folder' | 'collection';
    }): Promise<Document> => {
      return SystemVirtualFolderModel.createVirtualFolder({
        _id: this.utils.generateId(),
        ...folderData
      });
    },

    // Get all virtual folders
    getAll: async (): Promise<Document[]> => {
      return SystemVirtualFolderModel.getAllVirtualFolders();
    },

    // Get contents of a virtual folder
    getContents: async (folderId: string): Promise<Document[]> => {
      return SystemVirtualFolderModel.getVirtualFolderContents(folderId);
    },

    // Update a virtual folder
    update: async (folderId: string, updateData: VirtualFolderUpdateData): Promise<Document | null> => {
      return SystemVirtualFolderModel.updateVirtualFolder(folderId, updateData);
    },

    // Delete a virtual folder
    delete: async (folderId: string): Promise<boolean> => {
      return SystemVirtualFolderModel.deleteVirtualFolder(folderId);
    },

    // Check if a virtual folder exists
    exists: async (path: string): Promise<DatabaseResult<boolean>> => {
      return SystemVirtualFolderModel.exists(path);
    }
  };

  //  Other Queries
  queries = {
    // Fetch the last five collections
    getLastFiveCollections: async (): Promise<Document[]> => {
      throw new Error('Method not implemented.');
    },

    // Fetch logged-in users
    getLoggedInUsers: async (): Promise<Document[]> => {
      throw new Error('Method not implemented.');
    },

    // Fetch CMS data
    getCMSData: async (): Promise<{
      collections: number;
      media: number;
      users: number;
      drafts: number;
    }> => {
      throw new Error('Method not implemented.');
    }
  };

  //  Disconnect Method
  // Disconnect from MongoDB
  async disconnect(): Promise<DatabaseResult<void>> {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB connection closed');
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: createDatabaseError(error, 'DISCONNECTION_ERROR', 'MongoDB disconnection failed') };
    }
  }
}
