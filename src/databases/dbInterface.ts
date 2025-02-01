/**
 * @file src/databases/dbInterface.ts
 * @description Database Agnostic Interface for SveltyCMS
 *
 * Features:
 * - Full UUID support (v4) for all entities
 * - ISO 8601 date string handling
 * - Type-safe query builder pattern
 * - Transaction support
 * - Strict type definitions
 * - Error handling standardization
 * - Database-agnostic design
 * - Virtual folder management
 * - Content versioning (drafts/revisions)
 * - Pagination utilities
 * - Preferences management
 *
 * Design Principles:
 * 1. Consistent ID handling (UUIDv4 across all DBs)
 * 2. Date handling as ISO strings in application layer
 * 3. Clear separation of read/write operations
 * 4. Composite pattern for complex queries
 * 5. Type safety throughout interface
 */

/** Core Types **/
export type DatabaseId = string & { readonly __brand: unique symbol }; // Unique identifier type  
export type ISODateString = string & { readonly __isoDate: unique symbol }; // ISO 8601 date string type

/** Base Entity **/
interface BaseEntity {
  _id: DatabaseId;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Translation **/
export interface Translation {
  languageTag: string;
  translationName: string;
  isDefault?: boolean;
}

/** Content Management Types **/
// Define content node types (customize as needed)  
export type ContentNodeType = 'page' | 'folder' | 'post' | string;

// Merged ContentNode interface with all properties  
export interface ContentNode<ContentType = unknown> extends BaseEntity {
  name: string;
  path: string;
  type: ContentNodeType; // Added type property
  icon?: string;
  order: number;
  translations: Translation[];
  parentPath?: string;
  content?: ContentType;
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
  primaryColor: string;
  secondaryColor: string;
  font: string;
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

/** Widget System **/
export interface WidgetSettings {
  layout: string;
  colorScheme: string;
  [key: string]: unknown;
}

export interface WidgetConfig {
  position: string;
  settings: WidgetSettings;
}

export interface Widget extends BaseEntity {
  name: string;
  identifier: string;
  isActive: boolean;
  instances: WidgetConfig[];
  dependencies: string[];
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

export type DatabaseResult<T> =
  | { success: true; data: T }
  | { success: false; error: DatabaseError };

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
  where(conditions: Partial<T> | ((item: T) => boolean)): this; // Add filtering conditions
  limit(value: number): this; // Limit the number of results
  skip(value: number): this; // Skip a number of results
  sort(field: keyof T, direction: 'asc' | 'desc'): this; // Sort results by a field
  project(fields: Partial<Record<keyof T, boolean>>): this; // Select specific fields
  distinct(): this; // Ensure unique results
  count(): Promise<DatabaseResult<number>>; // Count matching records
  execute(): Promise<DatabaseResult<T[]>>; // Execute the query and return results
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
  transaction<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>
  ): Promise<DatabaseResult<T>>; // Execute a function within a transaction

  // System Preferences
  preferences: {
    get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T>>; // Retrieve a preference value
    set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>; // Set a preference value
    delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>; // Delete a preference
  };

  // Theme Management
  themes: {
    getAll(): Promise<DatabaseResult<Theme[]>>; // Retrieve all themes
    getActive(): Promise<DatabaseResult<Theme>>; // Retrieve the active theme
    setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Set a theme as default
    install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>>; // Install a new theme
    uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Uninstall a theme
  };

  // Widget System
  widgets: {
    register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>>; // Register a new widget
    getAll(): Promise<DatabaseResult<Widget[]>>; // Retrieve all widgets
    activate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Activate a widget
    deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Deactivate a widget
    updateConfig(widgetId: DatabaseId, config: WidgetConfig): Promise<DatabaseResult<void>>; // Update widget configuration
  };

  // Media Management
  media: {
    files: {
      upload(file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>>; // Upload a media file
      delete(fileId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a media file
      getByFolder(folderId?: DatabaseId): Promise<DatabaseResult<MediaItem[]>>; // Retrieve files by folder
      search(query: string): Promise<DatabaseResult<MediaItem[]>>; // Search for media files
    };
    folders: {
      create(folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>>; // Create a media folder
      delete(folderId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a media folder
      getTree(): Promise<DatabaseResult<MediaFolder[]>>; // Retrieve the folder tree
    };
  };

  // Content Management
  content: {
    nodes: {
      getStructure(mode: 'flat' | 'nested', filter?: Partial<ContentNode>): Promise<DatabaseResult<ContentNode[]>>; // Retrieve content structure
      create(node: Omit<ContentNode, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>; // Create a content node
      update(path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>>; // Update a content node
      bulkUpdate(updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>>; // Bulk update content nodes
      delete(path: string): Promise<DatabaseResult<void>>; // Delete a content node
    };
    drafts: {
      create(draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>>; // Create a content draft
      update(draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>>; // Update a content draft
      publish(draftId: DatabaseId): Promise<DatabaseResult<void>>; // Publish a content draft
      getForContent(contentId: DatabaseId): Promise<DatabaseResult<ContentDraft[]>>; // Retrieve drafts for a content node
    };
    revisions: {
      create(revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>>; // Create a content revision
      getHistory(contentId: DatabaseId): Promise<DatabaseResult<ContentRevision[]>>; // Get revision history for content
      restore(revisionId: DatabaseId): Promise<DatabaseResult<void>>; // Restore a content revision
    };
  };

  // Virtual Folders
  virtualFolders: {
    create(folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>>; // Create a virtual folder
    addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>>; // Add content to a virtual folder
    getContents(folderPath: string): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[] }>>; // Retrieve contents of a virtual folder
  };

  // Database Agnostic Utilities
  utils: {
    generateId(): DatabaseId; // Generate a new UUIDv4
    normalizePath(path: string): string; // Normalize file paths
    validateId(id: string): boolean; // Validate a DatabaseId
    createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T>; // Paginate items
  };

  // Core CRUD Operations
  findOne<T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T>>; // Find a single document
  findMany<T extends BaseEntity>(collection: string, query: Partial<T>): Promise<DatabaseResult<T[]>>; // Find multiple documents
  create<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>>; // Create a new document
  update<T extends BaseEntity>(collection: string, id: DatabaseId, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<T>>; // Update a document
  delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>>; // Delete a document

  // Query Builder Entry Point
  queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T>; // Instantiate a query builder for a collection
}

/** Utility Type Guards **/
export function isDatabaseError(error: unknown): error is DatabaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}
