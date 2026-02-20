/**
 * @file src/databases/db-interface.ts
 * @description
 * High-performance, database-agnostic interface contracts for SveltyCMS.
 * This contract defines a truly agnostic data layer with these key principles:
 * 1. Single Database Call Optimization: Minimize round trips.
 * 2. Standardized DatabaseResult<T>: Consistent error handling without exceptions.
 * 3. Batch Operations First: Prefer bulk operations over individual calls.
 * 4. Query Optimization: Built-in hints and strategies.
 * 5. Connection Pooling Ready: Supports pooling patterns.
 * 6. Cache-Friendly: Designed to work with caching layers.
 *
 * features:
 * - agnostic adapter contracts
 * - batch operation optimization
 * - cursor-based pagination
 * - streaming support
 * - standardized error handling
 * - performance telemetry
 */

import type { BaseEntity, ContentNode as ContentNodeType, DatabaseId, ISODateString, Schema } from '../content/types';
// Auth types (moved from authDBInterface)
import type { Role, Session, Token, User } from './auth/types';
import type { WebsiteToken } from './schemas';

// Tenant Types
export interface TenantQuota {
	maxApiRequestsPerMonth: number;
	maxCollections: number;
	maxStorageBytes: number;
	maxUsers: number;
}

export interface TenantUsage {
	apiRequestsMonth: number;
	collectionsCount: number;
	lastUpdated: Date;
	storageBytes: number;
	usersCount: number;
}

export interface Tenant extends BaseEntity {
	_id: DatabaseId;
	name: string;
	ownerId: DatabaseId;
	plan: 'free' | 'pro' | 'enterprise';
	quota: TenantQuota;
	settings?: Record<string, unknown>;
	status: 'active' | 'suspended' | 'archived';
	usage: TenantUsage;
}

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
export interface PaginationOption {
	filter?: Record<string, unknown>;
	limit?: number;
	offset?: number;
	sort?: SortOption;
}

/** Performance and Query Optimization Types */
export interface QueryOptimizationHints {
	batchSize?: number; // Optimal batch size for large operations
	maxExecutionTime?: number; // Maximum query execution time in milliseconds
	readPreference?: 'primary' | 'secondary' | 'nearest'; // For replica sets
	streaming?: boolean; // Enable result streaming for large datasets
	useIndex?: string[]; // Suggest specific indexes to use
}

export interface ConnectionPoolOptions {
	connectionTimeout?: number;
	idleTimeout?: number;
	maxConnections?: number;
	minConnections?: number;
	retryAttempts?: number;
}

export interface DatabaseCapabilities {
	maxBatchSize: number;
	maxQueryComplexity: number;
	supportsAggregation: boolean;
	supportsFullTextSearch: boolean;
	supportsIndexing: boolean;
	supportsPartitioning: boolean;
	supportsStreaming: boolean;
	supportsTransactions: boolean;
}

/** Performance Monitoring and Caching */
export interface PerformanceMetrics {
	averageQueryTime: number;
	cacheHitRate: number;
	connectionPoolUsage: number;
	queryCount: number;
	slowQueries: Array<{ query: string; duration: number; timestamp: Date }>;
}

export interface CacheOptions {
	enabled?: boolean;
	key?: string; // Custom cache key
	tags?: string[]; // Cache tags for invalidation
	ttl?: number; // Time to live in seconds
}

/** collection */
export interface CollectionModel {
	aggregate: (pipeline: Record<string, unknown>[]) => Promise<unknown[]>;
	findOne: (query: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}

/** Nested Content Structure */
export interface NestedContentNode extends ContentNode {
	children: NestedContentNode[];
	path: string;
}

/** Content Draft */
export interface ContentDraft<T = unknown> extends BaseEntity {
	authorId: DatabaseId;
	contentId: DatabaseId;
	data: T;
	status: 'draft' | 'review' | 'archived';
	version: number;
}

/** Content Revision */
export interface ContentRevision extends BaseEntity {
	authorId: DatabaseId;
	commitMessage?: string;
	contentId: DatabaseId;
	data: unknown;
	version: number;
}

/** Theme Management */
export interface ThemeConfig {
	assetsPath: string; // Path to theme assets (e.g., images, fonts)
	tailwindConfigPath: string; // Path to tailwind.config.js
	[key: string]: unknown;
}

export interface Theme extends BaseEntity {
	_id: DatabaseId;
	config: ThemeConfig;
	createdAt: ISODateString;
	customCss?: string;
	isActive: boolean;
	isDefault: boolean;
	name: string;
	path: string;
	previewImage?: string;
	updatedAt: ISODateString;
}

/** Widget Management */
export interface Widget extends BaseEntity {
	dependencies: string[]; // Widget identifiers of dependencies
	instances: Record<string, unknown>; // Structured configurations for widget instances (supports atomic updates)
	isActive: boolean; // Is the widget globally active?
	name: string;
}

/** Media Management */
export interface MediaMetadata {
	advancedMetadata?: Record<string, unknown>; // For EXIF, IPTC, etc.
	codec?: string;
	duration?: number;
	format?: string;
	height?: number;
	width?: number;
	[key: string]: unknown;
}

export interface MediaItem extends BaseEntity {
	access?: 'public' | 'private' | 'protected'; // Added access control
	createdBy: DatabaseId;
	filename: string; // Display filename (user-friendly name)
	folderId?: DatabaseId | null; // Reference to SystemVirtualFolder for organization
	hash: string;
	metadata: MediaMetadata;
	mimeType: string;
	originalFilename: string; // Actual filename in mediaFolder root (hash-based or physical storage)
	originalId?: DatabaseId | null; // For linking edited variants to the original
	path: string; // Virtual path based on SystemVirtualFolder organization
	size: number;
	thumbnails: Record<string, { url: string; width: number; height: number } | undefined>;
	updatedBy: DatabaseId;
	versions?: Array<{
		version: number;
		url: string;
		path?: string;
		hash?: string;
		size?: number;
		createdAt: ISODateString;
		createdBy: DatabaseId;
		action?: string;
	}>;
}

export interface MediaFolder extends BaseEntity {
	icon?: string;
	name: string;
	order: number;
	parentId?: DatabaseId;
	path: string;
}

/** System Preferences */
export interface SystemPreferences extends BaseEntity {
	key: string; // The preference key (e.g., "dashboard.layout")
	scope: 'user' | 'system' | 'widget'; // The scope of the preference
	userId?: DatabaseId; // The user ID if the scope is 'user'
	value: unknown; // The value of the preference (can be any type)
	visibility: 'public' | 'private'; // Visibility of the preference
}

/** Query Support Types */
export interface PaginationOptions {
	cursor?: string; // For cursor-based pagination (more efficient for large datasets)
	includeTotalCount?: boolean; // Option to skip expensive total count calculation
	page?: number;
	pageSize?: number;
	sortDirection?: 'asc' | 'desc';
	sortField?: string;
	user?: User; // Optional user for ownership-based filtering
}

export interface PaginatedResult<T> {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	items: T[];
	nextCursor?: string; // For cursor-based pagination
	page?: number;
	pageSize: number;
	previousCursor?: string;
	total?: number; // Optional for performance when includeTotalCount is false
}

export interface BatchOperation<T> {
	collection: string;
	data?: Partial<T>;
	id?: DatabaseId;
	operation: 'insert' | 'update' | 'delete' | 'upsert';
	query?: QueryFilter<T>;
}

export interface BatchResult<T> {
	errors: DatabaseError[];
	results: DatabaseResult<T>[];
	success: boolean;
	totalProcessed: number;
}

/** Database Query Types */
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
	cached?: boolean; // Whether result came from cache
	executionTime?: number; // Query execution time in milliseconds
	indexesUsed?: string[]; // Indexes used by the query
	recordsExamined?: number; // Number of records examined (for optimization)
}

/** Error Handling */
export interface DatabaseError {
	code: string;
	details?: unknown;
	message: string;
	stack?: string;
	statusCode?: number;
}

/** Query Builder Interface */
export interface QueryBuilder<T = unknown> {
	// Execution methods
	count(): Promise<DatabaseResult<number>>;
	deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>>;

	// Aggregation
	distinct<K extends keyof T>(field?: K): this;
	exclude<K extends keyof T>(fields: K[]): this;
	execute(): Promise<DatabaseResult<T[]>>;
	exists(): Promise<DatabaseResult<boolean>>;
	findOne(): Promise<DatabaseResult<T | null>>;
	findOneOrFail(): Promise<DatabaseResult<T>>;
	groupBy<K extends keyof T>(field: K): this;

	// Performance optimization
	hint(hints: QueryOptimizationHints): this;

	// Pagination and limits
	limit(value: number): this;
	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this;
	paginate(options: PaginationOptions): this;

	// Text search
	search(query: string, fields?: (keyof T)[]): this;

	// Field selection
	select<K extends keyof T>(fields: K[]): this;
	skip(value: number): this;

	// Sorting
	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this;
	stream(): Promise<DatabaseResult<AsyncIterable<T>>>; // For large datasets
	timeout(milliseconds: number): this;

	// Batch operations
	updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>>;
	// Filtering and conditions
	where(conditions: Partial<T> | ((item: T) => boolean)): this;
	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this;
	whereIn<K extends keyof T>(field: K, values: T[K][]): this;
	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this;
	whereNotNull<K extends keyof T>(field: K): this;
	whereNull<K extends keyof T>(field: K): this;
}

/** Supporting Interfaces */
export interface DatabaseTransaction {
	commit(): Promise<DatabaseResult<void>>; // Commit the transaction
	rollback(): Promise<DatabaseResult<void>>; // Roll back the transaction
}

/** Connection Pool Stats - Agnostic Health Monitoring */
export interface ConnectionPoolStats {
	active: number;
	avgConnectionTime: number;
	idle: number;
	total: number;
	waiting: number;
}

/** Domain-Specific Adapters */

export interface IAuthAdapter {
	blockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	blockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	cleanupRotatedSessions?(): Promise<DatabaseResult<number>>;
	consumeToken(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<{ status: boolean; message: string }>>;
	createRole(role: Role): Promise<DatabaseResult<Role>>;

	// Session Management Methods
	createSession(sessionData: { user_id: string; expires: ISODateString; tenantId?: string }): Promise<DatabaseResult<Session>>;

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: ISODateString; type: string; tenantId?: string }): Promise<DatabaseResult<string>>;

	// User Management Methods
	createUser(userData: Partial<User>): Promise<DatabaseResult<User>>;

	// Combined Performance-Optimized Methods
	createUserAndSession(
		userData: Partial<User>,
		sessionData: { expires: ISODateString; tenantId?: string }
	): Promise<DatabaseResult<{ user: User; session: Session }>>;
	deleteExpiredSessions(): Promise<DatabaseResult<number>>;
	deleteExpiredTokens(): Promise<DatabaseResult<number>>;
	deleteRole(roleId: string, tenantId?: string): Promise<DatabaseResult<void>>;
	deleteSession(session_id: string): Promise<DatabaseResult<void>>;
	deleteTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
	deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>;
	deleteUserAndSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>>;
	deleteUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
	getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>>;
	getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>>;

	// Role Management Methods
	getAllRoles(tenantId?: string): Promise<Role[]>;
	getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>>;
	getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>>;
	getRoleById(roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>>;
	getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: string } | null>>;
	getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
	getTokenData(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
	getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>>;
	getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>>;
	getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>;
	invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>;
	rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>>;
	setupAuthModels(): Promise<void>;
	unblockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	unblockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	updateRole(roleId: string, roleData: Partial<Role>, tenantId?: string): Promise<DatabaseResult<Role>>;
	updateSessionExpiry(session_id: string, newExpiry: ISODateString): Promise<DatabaseResult<Session>>;
	updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>>;
	updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>>;
	validateSession(session_id: string): Promise<DatabaseResult<User | null>>;
	validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>>;
}

export interface ICrudAdapter {
	aggregate<R>(collection: string, pipeline: unknown[], tenantId?: string | null): Promise<DatabaseResult<R[]>>;
	count(collection: string, query?: QueryFilter<BaseEntity>, tenantId?: string | null): Promise<DatabaseResult<number>>;
	delete(collection: string, id: DatabaseId, tenantId?: string | null): Promise<DatabaseResult<void>>;
	deleteMany(collection: string, query: QueryFilter<BaseEntity>, tenantId?: string | null): Promise<DatabaseResult<{ deletedCount: number }>>;
	exists(collection: string, query: QueryFilter<BaseEntity>, tenantId?: string | null): Promise<DatabaseResult<boolean>>;
	findByIds<T extends BaseEntity>(
		collection: string,
		ids: DatabaseId[],
		options?: { fields?: (keyof T)[]; tenantId?: string | null }
	): Promise<DatabaseResult<T[]>>;
	findMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: {
			limit?: number;
			offset?: number;
			fields?: (keyof T)[];
			sort?: SortOption;
			tenantId?: string | null;
		}
	): Promise<DatabaseResult<T[]>>;
	findOne<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { fields?: (keyof T)[]; tenantId?: string | null }
	): Promise<DatabaseResult<T | null>>;
	insert<T extends BaseEntity>(
		collection: string,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>>;
	insertMany<T extends BaseEntity>(
		collection: string,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[],
		tenantId?: string | null
	): Promise<DatabaseResult<T[]>>;
	update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>>;
	updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>,
		tenantId?: string | null
	): Promise<DatabaseResult<{ modifiedCount: number }>>;
	upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>>;
	upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{
			query: QueryFilter<T>;
			data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>;
		}>,
		tenantId?: string | null
	): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>>;
}

export interface IMediaAdapter {
	files: {
		upload(file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>>;
		uploadMany(files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>>;
		delete(fileId: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		getByFolder(
			folderId?: DatabaseId,
			options?: PaginationOptions,
			recursive?: boolean,
			tenantId?: string | null
		): Promise<DatabaseResult<PaginatedResult<MediaItem>>>;
		search(query: string, options?: PaginationOptions, tenantId?: string | null): Promise<DatabaseResult<PaginatedResult<MediaItem>>>;
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
		): Promise<
			DatabaseResult<{
				folders: MediaFolder[];
				files: MediaItem[];
				totalCount: number;
			}>
		>;
		move(folderId: DatabaseId, targetParentId?: DatabaseId): Promise<DatabaseResult<MediaFolder>>;
	};
	setupMediaModels(): Promise<void>;
}

export interface IContentAdapter {
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
	nodes: {
		getStructure(mode: 'flat' | 'nested', filter?: Partial<ContentNode>, bypassCache?: boolean): Promise<DatabaseResult<ContentNode[]>>;
		upsertContentStructureNode(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>;
		create(node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>>;
		createMany(nodes: Omit<ContentNode, 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentNode[]>>;
		update(path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>>;
		bulkUpdate(updates: { path: string; id?: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>>;
		fixMismatchedNodeIds?(
			nodes: {
				path: string;
				expectedId: string;
				changes: Partial<ContentNode>;
			}[]
		): Promise<DatabaseResult<{ fixed: number }>>;
		delete(path: string): Promise<DatabaseResult<void>>;
		deleteMany(paths: string[], options?: { tenantId?: string }): Promise<DatabaseResult<{ deletedCount: number }>>;
		reorder(nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNode[]>>;
		reorderStructure(
			items: Array<{
				id: string;
				parentId: string | null;
				order: number;
				path: string;
			}>
		): Promise<DatabaseResult<void>>;
	};
	revisions: {
		create(revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>>;
		getHistory(contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>>;
		restore(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
		delete(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		cleanup(contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>>;
	};
}

export interface ISystemAdapter {
	systemPreferences: {
		get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T | null>>;
		getMany<T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>>;
		getByCategory<T>(category: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>>;
		set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId, category?: string): Promise<DatabaseResult<void>>;
		setMany<T>(
			preferences: Array<{
				key: string;
				value: T;
				scope?: 'user' | 'system';
				userId?: DatabaseId;
				category?: string;
			}>
		): Promise<DatabaseResult<void>>;
		delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		clear(scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
	};
	systemVirtualFolder: {
		create(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>>;
		getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>>;
		getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>>;
		getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>>;
		update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>>;
		addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>>;
		getContents(folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>>;
		ensure(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>>;
		delete(folderId: DatabaseId): Promise<DatabaseResult<void>>;
		exists(path: string): Promise<DatabaseResult<boolean>>;
	};
	tenants: {
		create(
			tenant: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'> & {
				_id?: DatabaseId;
			}
		): Promise<DatabaseResult<Tenant>>;
		getById(tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>>;
		update(tenantId: DatabaseId, data: Partial<Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Tenant>>;
		delete(tenantId: DatabaseId): Promise<DatabaseResult<void>>;
		list(options?: PaginationOption): Promise<DatabaseResult<Tenant[]>>;
	};
	themes: {
		setupThemeModels(): Promise<void>;
		getActive(): Promise<DatabaseResult<Theme>>;
		setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>>;
		install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>>;
		uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>>;
		update(themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>>;
		getAllThemes(): Promise<Theme[]>;
		storeThemes(themes: Theme[]): Promise<void>;
		ensure(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<Theme>;
		getDefaultTheme(tenantId?: string): Promise<DatabaseResult<Theme | null>>;
	};
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
	widgets: {
		setupWidgetModels(): Promise<void>;
		register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>>;
		findAll(): Promise<DatabaseResult<Widget[]>>;
		getActiveWidgets(): Promise<DatabaseResult<Widget[]>>;
		activate(widgetId: DatabaseId): Promise<DatabaseResult<void>>;
		deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>>;
		update(widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>>;
		delete(widgetId: DatabaseId): Promise<DatabaseResult<void>>;
	};
}

export interface IMonitoringAdapter {
	cache: {
		get<T>(key: string): Promise<DatabaseResult<T | null>>;
		set<T>(key: string, value: T, options?: CacheOptions): Promise<DatabaseResult<void>>;
		delete(key: string): Promise<DatabaseResult<void>>;
		clear(tags?: string[]): Promise<DatabaseResult<void>>;
		invalidateCollection(collection: string): Promise<DatabaseResult<void>>;
	};
	getConnectionPoolStats?(): Promise<DatabaseResult<ConnectionPoolStats>>;
	performance: {
		getMetrics(): Promise<DatabaseResult<PerformanceMetrics>>;
		clearMetrics(): Promise<DatabaseResult<void>>;
		enableProfiling(enabled: boolean): Promise<DatabaseResult<void>>;
		getSlowQueries(limit?: number): Promise<DatabaseResult<Array<{ query: string; duration: number; timestamp: ISODateString }>>>;
	};
}

/** Database Adapter Interface */
export interface IDBAdapter extends ISystemAdapter, IMonitoringAdapter {
	auth: IAuthAdapter;

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

	// Test/Dev Utilities
	clearDatabase(): Promise<DatabaseResult<void>>;
	collection: {
		getModel(id: string): Promise<CollectionModel>;
		createModel(schema: Schema, force?: boolean): Promise<void>;
		updateModel(schema: Schema): Promise<void>;
		deleteModel(id: string): Promise<void>;
		getSchema(collectionName: string): Promise<DatabaseResult<Schema | null>>;
		listSchemas(): Promise<DatabaseResult<Schema[]>>;
	};

	// Connection Management with Pooling
	connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
	connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	content: IContentAdapter;
	crud: ICrudAdapter;
	disconnect(): Promise<DatabaseResult<void>>;

	// Lazy Initializers (Optional for Adapters that support them)
	ensureAuth?(): Promise<void>;
	ensureCollections?(): Promise<void>;
	ensureContent?(): Promise<void>;
	ensureMedia?(): Promise<void>;
	ensureMonitoring?(): Promise<void>;
	ensureSystem?(): Promise<void>;
	// Performance and Capabilities
	getCapabilities(): DatabaseCapabilities;

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
	getConnectionHealth(): Promise<
		DatabaseResult<{
			healthy: boolean;
			latency: number;
			activeConnections: number;
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
	isConnected(): boolean;
	media: IMediaAdapter;

	// Query Builder Entry Point with Collection Data Loading
	queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T>;

	// Transaction Support
	transaction<T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: { timeout?: number; isolationLevel?: string }
	): Promise<DatabaseResult<T>>;

	// Database Agnostic Utilities
	utils: {
		generateId(): DatabaseId; // Generate a new UUIDv4
		normalizePath(path: string): string; // Normalize file paths
		validateId(id: string): boolean; // Validate a DatabaseId
		createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T>; // Paginate items (in-memory utility)
	};
	/** Optional: Wait for DB connection to be ready (for adapters that support async connect) */
	waitForConnection?(): Promise<void>;
}

// Type alias for backward compatibility
export type DatabaseAdapter = IDBAdapter;
export type dbInterface = IDBAdapter;

/** Virtual Folder Types */
export interface SystemVirtualFolder extends BaseEntity {
	_id: DatabaseId;
	icon?: string;
	metadata?: unknown;
	name: string;
	order: number;
	parentId?: DatabaseId | null;
	path: string;
	type: 'folder' | 'collection';
}

export interface FolderContents {
	mediaFiles: Array<{
		id: string;
		name: string;
		path: string;
		type: string;
		size: number;
	}>;
	subfolders: SystemVirtualFolder[];
}

export interface VirtualFolderUpdateData {
	name?: string;
	order?: number;
	parentId?: DatabaseId;
	path?: string;
}

export interface FolderResponse {
	ariaLabel: string;
	id: string;
	name: string;
	path: string;
}
