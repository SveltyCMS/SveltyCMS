/**
 * @file src/databases/dbInterface.ts
 * @description **Database Agnostic Interface for SveltyCMS - CRUD & QueryBuilder Focused**
 *
 * **Database interaction is primarily driven by explicit CRUD operations and the QueryBuilder.**
 * **Use QueryBuilder for ALL general data retrieval (lists, filters, sorts, pagination).**
 * **Direct methods in feature interfaces are limited to essential CRUD actions and specific operations.**
 *
 * **Performance Note:** This QueryBuilder is designed for general data retrieval and aims for database agnosticism. For optimal performance in complex scenarios or when leveraging database-specific features (like MongoDB Aggregation or advanced SQL features), direct database-specific queries or extending this interface might be necessary.  Avoid using function-based filters in `where` for database queries as it can lead to significant performance issues.
 *
 * Features:
 * - Full UUID support (v4) for all entities
 * - ISO 8601 date string handling
 * - QueryBuilder for ALL general data retrieval (non-CRUD list/find operations)
 * - Transaction support
 * - Strict type definitions
 * - Error handling standardization
 * - Database-agnostic design (with performance considerations for complex queries)
 * - System Virtual folder management
 * - Content versioning (drafts/revisions)
 * - Pagination utilities
 * - Preferences management
 *
 * Design Principles (Optimized for general use, with caveats for complex scenarios):
 * 1. Consistent ID handling (UUIDv4 across all DBs)
 * 2. Date handling as ISO strings in application layer
 * 3. QueryBuilder is the EXCLUSIVE method for general data retrieval.
 * 4. Direct methods are reserved for explicit CRUD actions and specific use-cases.
 * 5. Clear separation of read/write operations
 * 6. Type safety throughout interface
 */

import type { Schema } from '../content/types';

/** Core Types **/
export type DatabaseId = string & { readonly __brand: unique symbol }; // Unique identifier type
export type ISODateString = string & { readonly __isoDate: unique symbol }; // ISO 8601 date string type

/** Base Entity **/
interface BaseEntity {
  _id: DatabaseId; // Unique identifier
  createdAt: ISODateString; // ISO 8601 date string
  updatedAt: ISODateString; // ISO 8601 date string
}

/** collection **/
export interface CollectionModel {
  findOne: (query: FilterQuery<Document>) => Promise<Document | null>;
  aggregate: (pipeline: AggregationPipeline[]) => Promise<unknown[]>;
}

/** Translation **/
export interface Translation {
  languageTag: string;
  translationName: string;
  isDefault?: boolean;
}

/** Content Management Types **/
export interface ContentNode<ContentType = 'category' | 'collection'> extends BaseEntity {
  name: string;
  nodeType: ContentType;
  icon?: string;
  order: number;
  translations: Translation[];
  parentId?: string;
}

/** Nested Content Structure **/
export interface NestedContentNode extends ContentNode {
  path: string;
  children: NestedContentNode[];
}

/** Content Draft **/
export interface ContentDraft<T = unknown> extends BaseEntity {
  contentId: DatabaseId;
  data: T;
  version: number;
  status: 'draft' | 'review' | 'archived';
  authorId: DatabaseId;
}

/** Content Revision **/
export interface ContentRevision extends BaseEntity {
  contentId: DatabaseId;
  data: unknown;
  version: number;
  commitMessage?: string;
  authorId: DatabaseId;
}

/** Theme Management **/
export interface ThemeConfig {
  tailwindConfigPath: string; // Path to tailwind.config.js
  assetsPath: string; // Path to theme assets (e.g., images, fonts)
  [key: string]: unknown;
}

export interface Theme extends BaseEntity {
  name: string;
  path: string;
  isActive: boolean;
  isDefault: boolean;
  config: ThemeConfig;
  previewImage?: string;
}

/** Widget Management **/
export interface Widget extends BaseEntity {
  name: string;
  isActive: boolean; // Is the widget globally active?
  instances: string; // Configurations for widget instances - consider making this type-safe if config structure is known
  dependencies: string[]; // Widget identifiers of dependencies
}

/** Media Management **/
export interface MediaMetadata {
  width?: number;
  height?: number;
  duration?: number;
  codec?: string;
  format?: string;
  [key: string]: unknown;
}

export interface MediaItem extends BaseEntity {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  folderId?: DatabaseId;
  thumbnails: Record<string, string>;
  metadata: MediaMetadata;
}

export interface MediaFolder extends BaseEntity {
  name: string;
  path: string;
  parentId?: DatabaseId;
  icon?: string;
  order: number;
}

/** System Preferences **/
export interface SystemPreferences extends BaseEntity {
  key: string;
  value: unknown;
  scope: 'user' | 'system' | 'widget';
  userId?: DatabaseId;
}

/** Query Support Types **/
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type DatabaseResult<T> = { success: true; data: T } | { success: false; error: DatabaseError };

/** Error Handling **/
export interface DatabaseError {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
  stack?: string;
}

/** Query Builder Interface **/
export interface QueryBuilder<T = unknown> {
  where(conditions: Partial<T>): this; // Add filtering conditions based on document/record properties
  limit(value: number): this; // Limit the number of results
  skip(value: number): this; // Skip a number of results
  sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this; // Sort results by a field - type safe field
  project<K extends keyof T>(fields: Partial<Record<K, boolean>>): this; // Select specific fields - type safe fields
  distinct<K extends keyof T>(field?: K): this; // Allow specifying a field for distinct, make it optional for now
  paginate(options: PaginationOptions): this; // Apply pagination options
  count(): Promise<DatabaseResult<number>>; // Count matching records
  execute(): Promise<DatabaseResult<T[]>>; // Execute the query and return results
  findOne(): Promise<DatabaseResult<T | null>>; // Execute and return a single document, or null if not found
}

/** Supporting Interfaces **/
export interface DatabaseTransaction {
  commit(): Promise<DatabaseResult<void>>; // Commit the transaction
  rollback(): Promise<DatabaseResult<void>>; // Roll back the transaction
}

/** Main Database Adapter Interface **/
export interface DatabaseAdapter {
  // Core Connection Management
  connect(): Promise<DatabaseResult<void>>; // Establish a database connection
  disconnect(): Promise<DatabaseResult<void>>; // Terminate the database connection
  isConnected(): boolean; // Check if the connection is active

  // Transaction Support
  transaction<T>(fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>): Promise<DatabaseResult<T>>; // Execute a function within a transaction
  //Auth
  auth: {
    // Set up authentication models
    setupAuthModels(): Promise<void>;
  };
  // System Preferences
  preferences: {
    get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T>>; // Retrieve a preference value
    set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>; // Set a preference value
    delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>; // Delete a preference
  };

  // Theme Management
  themes: {
    setupThemeModels(): Promise<void>;
    getActive(): Promise<DatabaseResult<Theme>>; // Retrieve the active theme
    setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Set a theme as default
    install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>>; // Install a new theme
    uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Uninstall a theme
    update(themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>>; // Update a theme
  };

  // Widget System
  widgets: {
    setupWidgetModels(): Promise<void>;
    register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>>; // Register a new widget
    activate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Activate a widget
    deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Deactivate a widget
    update(widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>>; // Update widget configuration & details
    delete(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a widget
  };

  // Media Management
  media: {
    setupMediaModels(): Promise<void>;
    files: {
      upload(file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>>; // Upload a media file
      delete(fileId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a media file
      getByFolder(folderId?: DatabaseId): Promise<DatabaseResult<MediaItem[]>>; // Specialized: Get files in a folder
      search(query: string): Promise<DatabaseResult<MediaItem[]>>; // Specialized: Search files
    };
    folders: {
      create(folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>>; // Create a media folder
      delete(folderId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a media folder
      getTree(): Promise<DatabaseResult<MediaFolder[]>>; // Specialized: Get folder tree
    };
  };

  collection: {
    getModel(id: string): Promise<CollectionModel>;
    createModel(schema: Schema): Promise<void>;
    updateModel(schema: Schema): Promise<void>;
    deleteModel(id: string): Promise<void>;
  };

  // Content Management
  content: {
    nodes: {
      getStructure(mode: 'flat' | 'nested', filter?: Partial<ContentNode>): Promise<DatabaseResult<ContentNode[]>>; // Retrieve content structure
      upsertContentStructureNode(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>; // Create a content node
      create(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>; // Create a content node
      update(path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>>; // Update a content node
      bulkUpdate(updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>>; // Bulk update content nodes
      delete(path: string): Promise<DatabaseResult<void>>; // Delete a content node
    };
    drafts: {
      create(draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>>; // Create a content draft
      update(draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>>; // Update a content draft
      publish(draftId: DatabaseId): Promise<DatabaseResult<void>>; // Publish a content draft
      getForContent(contentId: DatabaseId): Promise<DatabaseResult<ContentDraft[]>>; // Specialized: Get drafts for specific content
      delete(draftId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a content draft
    };
    revisions: {
      create(revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>>; // Create a content revision
      getHistory(contentId: DatabaseId): Promise<DatabaseResult<ContentRevision[]>>; // Specialized: Get revision history for content
      restore(revisionId: DatabaseId): Promise<DatabaseResult<void>>; // Restore a content revision
      delete(revisionId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a content revision
    };
  };

  // System Virtual Folders
  virtualFolders: {
    create(folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>>; // Create a virtual folder
    getAll(): Promise<DatabaseResult<MediaFolder[]>>; // Get all virtual folders
    update(folderId: DatabaseId, updateData: Partial<MediaFolder>): Promise<DatabaseResult<MediaFolder>>; // Update a virtual folder
    addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>>; // Add content to a virtual folder
    getContents(folderPath: string): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[] }>>; // Specialized: Get contents of a virtual folder
    delete(folderId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a virtual folder
  };

  // Database Agnostic Utilities
  utils: {
    generateId(): DatabaseId; // Generate a new UUIDv4
    normalizePath(path: string): string; // Normalize file paths
    validateId(id: string): boolean; // Validate a DatabaseId
    createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T>; // Paginate items (in-memory utility)
  };

  // Core CRUD Operations - Centralized - For direct document manipulation by ID or unique query
  crud: {
    findOne<T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T | null>>; // Find a single document by query
    findMany<T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T[]>>; // Find multiple documents by query
    insert<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>>; // Create a new document
    insertMany<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>>; // Create multiple documents
    update<T extends BaseEntity>(collection: string, id: DatabaseId, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<T>>; // Update a document by ID

    delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>>; // Delete a document by ID
  };
  // Query Builder Entry Point -
  queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T>; // Instantiate a query builder for a collection
}

/** Utility Type Guards **/
export function isDatabaseError(error: unknown): error is DatabaseError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}
