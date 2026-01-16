/**
 * @file src/databases/dbInterface.ts
 * @description High-Performance Agnostic Database Interface for SveltyCMS
 *
 * This contract defines a truly agnostic, performance-optimized data layer with these key principles:
 *
 * 1. **Single Database Call Optimization**: All operations are designed to minimize round trips
 * 2. **Standardized DatabaseResult<T>**: Consistent error handling without exceptions
 * 3. **Batch Operations First**: Prefer bulk operations over individual calls
 * 4. **Query Optimization**: Built-in query optimization hints and strategies
 * 5. **Connection Pooling Ready**: Interface supports connection pooling patterns
 * 6. **Cache-Friendly**: Operations designed to work with caching layers
 *
 * Performance Features:
 * - Batch CRUD operations to reduce network round trips
 * - Query result streaming for large datasets
 * - Connection pooling and reuse patterns
 * - Built-in query optimization hints
 * - Lazy loading and selective field fetching
 * - Efficient pagination with cursor-based navigation
 * - Bulk validation and constraint checking
 */

import type { BaseEntity, ContentNode as ContentNodeType, DatabaseId, ISODateString, Schema } from '../content/types';
// Auth types (moved from authDBInterface)
import type { User, Session, Token, Role } from './auth/types';
import type { WebsiteToken } from './schemas';

export type { BaseEntity, ContentNodeType, DatabaseId, ISODateString, Schema, User, Session, Token, Role, WebsiteToken };

export type ContentNode = ContentNodeType;

/**
 * Pagination and Sorting Options
 *
 * Unified pagination interface used across all database operations.
 * Replaces the deprecated PaginationOption from authDBInterface.
 *
 * @deprecated Use PaginationOptions (plural) for new code. This type is kept for
 * backwards compatibility with auth methods but will be removed in future versions.
 */
type SortOption = { [key: string]: 'asc' | 'desc' } | [string, 'asc' | 'desc'][];
export type PaginationOption = {
	limit?: number;
	offset?: number;
	sort?: SortOption;
	filter?: Record<string, unknown>;
};

/** Performance and Query Optimization Types **/
export interface QueryOptimizationHints {
	useIndex?: string[]; // Suggest specific indexes to use
	maxExecutionTime?: number; // Maximum query execution time in milliseconds
	readPreference?: 'primary' | 'secondary' | 'nearest'; // For replica sets
	batchSize?: number; // Optimal batch size for large operations
	streaming?: boolean; // Enable result streaming for large datasets
}

export interface ConnectionPoolOptions {
	maxConnections?: number;
	minConnections?: number;
	connectionTimeout?: number;
	idleTimeout?: number;
	retryAttempts?: number;
}

export interface DatabaseCapabilities {
	supportsTransactions: boolean;
	supportsIndexing: boolean;
	supportsFullTextSearch: boolean;
	supportsAggregation: boolean;
	supportsStreaming: boolean;
	supportsPartitioning: boolean;
	maxBatchSize: number;
	maxQueryComplexity: number;
}

/** Performance Monitoring and Caching **/
export interface PerformanceMetrics {
	queryCount: number;
	averageQueryTime: number;
	slowQueries: Array<{ query: string; duration: number; timestamp: Date }>;
	cacheHitRate: number;
	connectionPoolUsage: number;
}

export interface CacheOptions {
	ttl?: number; // Time to live in seconds
	tags?: string[]; // Cache tags for invalidation
	key?: string; // Custom cache key
	enabled?: boolean;
}

/** collection **/
export interface CollectionModel {
	findOne: (query: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
	aggregate: (pipeline: Record<string, unknown>[]) => Promise<unknown[]>;
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
	_id: DatabaseId;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	name: string;
	path: string;
	isActive: boolean;
	isDefault: boolean;
	config: ThemeConfig;
	previewImage?: string;
	customCss?: string;
}

/** Widget Management **/
export interface Widget extends BaseEntity {
	name: string;
	isActive: boolean; // Is the widget globally active?
	instances: Record<string, unknown>; // Structured configurations for widget instances (supports atomic updates)
	dependencies: string[]; // Widget identifiers of dependencies
}

/** Media Management **/
export interface MediaMetadata {
	width?: number;
	height?: number;
	duration?: number;
	codec?: string;
	format?: string;
	advancedMetadata?: Record<string, any>; // For EXIF, IPTC, etc.
	[key: string]: unknown;
}

export interface MediaItem extends BaseEntity {
	filename: string; // Display filename (user-friendly name)
	originalFilename: string; // Actual filename in mediaFolder root (hash-based or physical storage)
	hash: string;
	path: string; // Virtual path based on SystemVirtualFolder organization
	size: number;
	mimeType: string;
	folderId?: DatabaseId | null; // Reference to SystemVirtualFolder for organization
	originalId?: DatabaseId | null; // For linking edited variants to the original
	thumbnails: Record<string, { url: string; width: number; height: number } | undefined>;
	metadata: MediaMetadata;
	access?: 'public' | 'private' | 'protected'; // Added access control
	createdBy: DatabaseId;
	updatedBy: DatabaseId;
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
	key: string; // The preference key (e.g., "dashboard.layout")
	value: unknown; // The value of the preference (can be any type)
	scope: 'user' | 'system' | 'widget'; // The scope of the preference
	userId?: DatabaseId; // The user ID if the scope is 'user'
	visibility: 'public' | 'private'; // Visibility of the preference
}

/** Query Support Types **/
export interface PaginationOptions {
	page?: number;
	pageSize?: number;
	sortField?: string;
	sortDirection?: 'asc' | 'desc';
	cursor?: string; // For cursor-based pagination (more efficient for large datasets)
	includeTotalCount?: boolean; // Option to skip expensive total count calculation
}

export interface PaginatedResult<T> {
	items: T[];
	total?: number; // Optional for performance when includeTotalCount is false
	page?: number;
	pageSize: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	nextCursor?: string; // For cursor-based pagination
	previousCursor?: string;
}

export interface BatchOperation<T> {
	operation: 'insert' | 'update' | 'delete' | 'upsert';
	collection: string;
	data?: Partial<T>;
	query?: QueryFilter<T>;
	id?: DatabaseId;
}

export interface BatchResult<T> {
	success: boolean;
	results: Array<DatabaseResult<T>>;
	totalProcessed: number;
	errors: DatabaseError[];
}

/** Database Query Types **/
export type QueryOperator<T> =
	| T
	| {
			$ne?: T;
			$exists?: boolean;
			$eq?: T;
			$gt?: T;
			$gte?: T;
			$lt?: T;
			$lte?: T;
			$in?: T[];
			$nin?: T[];
			$regex?: string;
			$options?: string;
	  };

export type QueryFilter<T> = {
	[K in keyof T]?: QueryOperator<T[K]>;
} & {
	$or?: QueryFilter<T>[];
	$and?: QueryFilter<T>[];
	$not?: QueryFilter<T>;
	$nor?: QueryFilter<T>[];
};

export type DatabaseResult<T> =
	| { success: true; data: T; meta?: QueryMeta }
	| {
			message: string;
			success: false;
			error: DatabaseError;
	  };

export interface QueryMeta {
	executionTime?: number; // Query execution time in milliseconds
	recordsExamined?: number; // Number of records examined (for optimization)
	indexesUsed?: string[]; // Indexes used by the query
	cached?: boolean; // Whether result came from cache
}

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
	// Filtering and conditions
	where(conditions: Partial<T> | ((item: T) => boolean)): this;
	whereIn<K extends keyof T>(field: K, values: T[K][]): this;
	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this;
	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this;
	whereNull<K extends keyof T>(field: K): this;
	whereNotNull<K extends keyof T>(field: K): this;

	// Text search
	search(query: string, fields?: (keyof T)[]): this;

	// Pagination and limits
	limit(value: number): this;
	skip(value: number): this;
	paginate(options: PaginationOptions): this;

	// Sorting
	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this;
	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this;

	// Field selection
	select<K extends keyof T>(fields: K[]): this;
	exclude<K extends keyof T>(fields: K[]): this;

	// Aggregation
	distinct<K extends keyof T>(field?: K): this;
	groupBy<K extends keyof T>(field: K): this;

	// Performance optimization
	hint(hints: QueryOptimizationHints): this;
	timeout(milliseconds: number): this;

	// Execution methods
	count(): Promise<DatabaseResult<number>>;
	exists(): Promise<DatabaseResult<boolean>>;
	execute(): Promise<DatabaseResult<T[]>>;
	stream(): Promise<DatabaseResult<AsyncIterable<T>>>; // For large datasets
	findOne(): Promise<DatabaseResult<T | null>>;
	findOneOrFail(): Promise<DatabaseResult<T>>;

	// Batch operations
	updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>>;
	deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>>;
}

/** Supporting Interfaces **/
export interface DatabaseTransaction {
	commit(): Promise<DatabaseResult<void>>; // Commit the transaction
	rollback(): Promise<DatabaseResult<void>>; // Roll back the transaction
}

/** Database Adapter Interface **/
export interface IDBAdapter {
	/** Optional: Wait for DB connection to be ready (for adapters that support async connect) */
	waitForConnection?(): Promise<void>;
	// Performance and Capabilities
	getCapabilities(): DatabaseCapabilities;

	// Connection Management with Pooling
	connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
	connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	disconnect(): Promise<DatabaseResult<void>>;
	isConnected(): boolean;
	getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>>;

	// Transaction Support
	transaction<T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: { timeout?: number; isolationLevel?: string }
	): Promise<DatabaseResult<T>>;

	// High-Performance Batch Operations
	batch: {
		execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>>;
		bulkInsert<T extends BaseEntity>(collection: string, items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>>;
		bulkUpdate<T extends BaseEntity>(
			collection: string,
			updates: Array<{ id: DatabaseId; data: Partial<T> }>
		): Promise<DatabaseResult<{ modifiedCount: number }>>;
		bulkDelete(collection: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		bulkUpsert<T extends BaseEntity>(collection: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>>;
	};

	// Authentication & User Management (moved from authDBInterface)
	auth: {
		// Setup method for model registration
		setupAuthModels(): Promise<void>;

		// User Management Methods
		createUser(userData: Partial<User>): Promise<DatabaseResult<User>>;
		updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>>;
		deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>;
		getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>>;
		getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>>;
		getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>>;
		getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>;
		deleteUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
		blockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
		unblockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;

		// Role Management Methods
		getAllRoles(tenantId?: string): Promise<Role[]>;
		getRoleById(roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>>;
		createRole(role: Role): Promise<DatabaseResult<Role>>;
		updateRole(roleId: string, roleData: Partial<Role>, tenantId?: string): Promise<DatabaseResult<Role>>;
		deleteRole(roleId: string, tenantId?: string): Promise<DatabaseResult<void>>;

		// Combined Performance-Optimized Methods
		createUserAndSession(
			userData: Partial<User>,
			sessionData: { expires: ISODateString; tenantId?: string }
		): Promise<DatabaseResult<{ user: User; session: Session }>>;
		deleteUserAndSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>>;

		// Session Management Methods
		createSession(sessionData: { user_id: string; expires: ISODateString; tenantId?: string }): Promise<DatabaseResult<Session>>;
		updateSessionExpiry(session_id: string, newExpiry: ISODateString): Promise<DatabaseResult<Session>>;
		deleteSession(session_id: string): Promise<DatabaseResult<void>>;
		deleteExpiredSessions(): Promise<DatabaseResult<number>>;
		validateSession(session_id: string): Promise<DatabaseResult<User | null>>;
		invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>;
		getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>>;
		getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>>;
		getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: string } | null>>;
		rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>>;
		cleanupRotatedSessions?(): Promise<DatabaseResult<number>>;

		// Token Management Methods
		createToken(data: { user_id: string; email: string; expires: ISODateString; type: string; tenantId?: string }): Promise<DatabaseResult<string>>;
		updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>>;
		validateToken(
			token: string,
			user_id?: string,
			type?: string,
			tenantId?: string
		): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>>;
		consumeToken(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<{ status: boolean; message: string }>>;
		getTokenData(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
		getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
		getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>>;
		deleteExpiredTokens(): Promise<DatabaseResult<number>>;
		deleteTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
		blockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
		unblockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	};

	//  System Preferences
	systemPreferences: {
		get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T>>;
		getMany<T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>>;
		set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		setMany<T>(preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId }>): Promise<DatabaseResult<void>>;
		delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		clear(scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
	};

	// Theme Management
	themes: {
		setupThemeModels(): Promise<void>;
		getActive(): Promise<DatabaseResult<Theme>>; // Retrieve the active theme
		setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Set a theme as default
		install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>>; // Install a new theme
		uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>>; // Uninstall a theme
		update(themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>>; // Update a theme
		getAllThemes(): Promise<Theme[]>; // Get all themes
		storeThemes(themes: Theme[]): Promise<void>; // Store multiple themes
		getDefaultTheme(tenantId?: string): Promise<DatabaseResult<Theme | null>>; // Get the default theme for a tenant
	};

	// Widget System
	widgets: {
		setupWidgetModels(): Promise<void>;
		register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>>; // Register a new widget
		findAll(): Promise<DatabaseResult<Widget[]>>; // Get all widgets (active and inactive)
		getActiveWidgets(): Promise<DatabaseResult<Widget[]>>; // Get all active widgets
		activate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Activate a widget
		deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Deactivate a widget
		update(widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>>; // Update widget configuration & details
		delete(widgetId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a widget
	};

	// Website Tokens
	websiteTokens: {
		create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>>;
		getAll(options: {
			limit?: number;
			skip?: number;
			sort?: string;
			order?: string;
		}): Promise<DatabaseResult<{ data: WebsiteToken[]; total: number }>>;
		getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>>;
		delete(tokenId: DatabaseId): Promise<DatabaseResult<void>>;
	};

	//  Media Management
	media: {
		setupMediaModels(): Promise<void>;
		files: {
			upload(file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>>;
			uploadMany(files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>>;
			delete(fileId: DatabaseId): Promise<DatabaseResult<void>>;
			deleteMany(fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
			getByFolder(folderId?: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>>;
			search(query: string, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>>;
			getMetadata(fileIds: DatabaseId[]): Promise<DatabaseResult<Record<string, MediaMetadata>>>;
			updateMetadata(fileId: DatabaseId, metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem>>;
			move(fileIds: DatabaseId[], targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>>;
			duplicate(fileId: DatabaseId, newName?: string): Promise<DatabaseResult<MediaItem>>;
		};
		folders: {
			create(folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>>;
			createMany(folders: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaFolder[]>>;
			delete(folderId: DatabaseId): Promise<DatabaseResult<void>>;
			deleteMany(folderIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
			getTree(maxDepth?: number): Promise<DatabaseResult<MediaFolder[]>>;
			getFolderContents(
				folderId?: DatabaseId,
				options?: PaginationOptions
			): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[]; totalCount: number }>>;
			move(folderId: DatabaseId, targetParentId?: DatabaseId): Promise<DatabaseResult<MediaFolder>>;
		};
	};

	collection: {
		getModel(id: string): Promise<CollectionModel>;
		createModel(schema: Schema): Promise<void>;
		updateModel(schema: Schema): Promise<void>;
		deleteModel(id: string): Promise<void>;
	};

	// Content Management with Batch Operations
	content: {
		nodes: {
			getStructure(mode: 'flat' | 'nested', filter?: Partial<ContentNode>, bypassCache?: boolean): Promise<DatabaseResult<ContentNode[]>>;
			upsertContentStructureNode(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>;
			create(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>;
			createMany(nodes: Omit<ContentNode, 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentNode[]>>;
			update(path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>>;
			bulkUpdate(updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>>;
			fixMismatchedNodeIds?(nodes: { path: string; expectedId: string; changes: Partial<ContentNode> }[]): Promise<{ fixed: number }>;
			delete(path: string): Promise<DatabaseResult<void>>;
			deleteMany(paths: string[]): Promise<DatabaseResult<{ deletedCount: number }>>;
			reorder(nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNode[]>>;
		};
		drafts: {
			create(draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>>;
			createMany(drafts: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentDraft[]>>;
			update(draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>>;
			publish(draftId: DatabaseId): Promise<DatabaseResult<void>>;
			publishMany(draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>>;
			getForContent(contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentDraft>>>;
			delete(draftId: DatabaseId): Promise<DatabaseResult<void>>;
			deleteMany(draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		};
		revisions: {
			create(revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>>;
			getHistory(contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>>;
			restore(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
			delete(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
			deleteMany(revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
			cleanup(contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>>;
		};
	};

	// System Virtual Folders
	systemVirtualFolder: {
		create(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>>; // Create a virtual folder
		getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>>; // Get a virtual folder by its ID
		getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>>; // Get folders by parent ID
		getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>>; // Get all virtual folders
		update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>>; // Update a virtual folder
		addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>>; // Add content to a virtual folder
		getContents(folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>>; // Specialized: Get contents of a virtual folder
		delete(folderId: DatabaseId): Promise<DatabaseResult<void>>; // Delete a virtual folder
		exists(path: string): Promise<DatabaseResult<boolean>>; // Check if folder with given path exists
	};

	// Database Agnostic Utilities
	utils: {
		generateId(): DatabaseId; // Generate a new UUIDv4
		normalizePath(path: string): string; // Normalize file paths
		validateId(id: string): boolean; // Validate a DatabaseId
		createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T>; // Paginate items (in-memory utility)
	};

	//  CRUD Operations
	crud: {
		// Single operations
		findOne<T extends BaseEntity>(collection: string, query: QueryFilter<T>, options?: { fields?: (keyof T)[] }): Promise<DatabaseResult<T | null>>;
		findMany<T extends BaseEntity>(
			collection: string,
			query: QueryFilter<T>,
			options?: { limit?: number; offset?: number; fields?: (keyof T)[] }
		): Promise<DatabaseResult<T[]>>;
		insert<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>>;
		update<T extends BaseEntity>(collection: string, id: DatabaseId, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<T>>;
		delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>>;

		// Batch operations
		findByIds<T extends BaseEntity>(collection: string, ids: DatabaseId[], options?: { fields?: (keyof T)[] }): Promise<DatabaseResult<T[]>>;
		insertMany<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>>;
		updateMany<T extends BaseEntity>(
			collection: string,
			query: QueryFilter<T>,
			data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
		): Promise<DatabaseResult<{ modifiedCount: number }>>;
		deleteMany(collection: string, query: QueryFilter<BaseEntity>): Promise<DatabaseResult<{ deletedCount: number }>>;

		// Upsert operations
		upsert<T extends BaseEntity>(
			collection: string,
			query: QueryFilter<T>,
			data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>
		): Promise<DatabaseResult<T>>;
		upsertMany<T extends BaseEntity>(
			collection: string,
			items: Array<{ query: QueryFilter<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>
		): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>>;

		// Aggregation and analysis
		count(collection: string, query?: QueryFilter<BaseEntity>): Promise<DatabaseResult<number>>;
		exists(collection: string, query: QueryFilter<BaseEntity>): Promise<DatabaseResult<boolean>>;
		aggregate<R>(collection: string, pipeline: unknown[]): Promise<DatabaseResult<R[]>>;
	};

	// Query Builder Entry Point with Collection Data Loading
	queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T>;

	// Performance and Monitoring
	performance: {
		getMetrics(): Promise<DatabaseResult<PerformanceMetrics>>;
		clearMetrics(): Promise<DatabaseResult<void>>;
		enableProfiling(enabled: boolean): Promise<DatabaseResult<void>>;
		getSlowQueries(limit?: number): Promise<DatabaseResult<Array<{ query: string; duration: number; timestamp: ISODateString }>>>;
	};

	// Caching Layer Integration
	cache: {
		get<T>(key: string): Promise<DatabaseResult<T | null>>;
		set<T>(key: string, value: T, options?: CacheOptions): Promise<DatabaseResult<void>>;
		delete(key: string): Promise<DatabaseResult<void>>;
		clear(tags?: string[]): Promise<DatabaseResult<void>>;
		invalidateCollection(collection: string): Promise<DatabaseResult<void>>;
	};

	// Collection Data Access (Optimized for your exportData use case)
	getCollectionData(
		collectionName: string,
		options?: {
			limit?: number;
			offset?: number;
			fields?: string[];
			includeMetadata?: boolean;
		}
	): Promise<
		DatabaseResult<{
			data: unknown[];
			metadata?: {
				totalCount: number;
				schema?: unknown;
				indexes?: string[];
			};
		}>
	>;

	// Bulk Collection Operations
	getMultipleCollectionData(
		collectionNames: string[],
		options?: {
			limit?: number;
			fields?: string[];
		}
	): Promise<DatabaseResult<Record<string, unknown[]>>>;
}

// Type alias for backward compatibility
export type DatabaseAdapter = IDBAdapter;
export type dbInterface = IDBAdapter;

/** Virtual Folder Types **/
export interface SystemVirtualFolder extends BaseEntity {
	_id: DatabaseId;
	name: string;
	path: string;
	parentId?: DatabaseId | null;
	icon?: string;
	order: number;
	type: 'folder' | 'collection';
	metadata?: unknown;
}

export interface FolderContents {
	subfolders: SystemVirtualFolder[];
	mediaFiles: Array<{
		id: string;
		name: string;
		path: string;
		type: string;
		size: number;
	}>;
}

export interface VirtualFolderUpdateData {
	name?: string;
	parentId?: DatabaseId;
	path?: string;
	order?: number;
}

export interface FolderResponse {
	id: string;
	name: string;
	path: string;
	ariaLabel: string;
}
