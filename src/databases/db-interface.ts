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
import type { Role, Session, Token, User } from './auth/types';
import type { WebsiteToken } from './schemas';

/** * Utility Types for DRY CRUD Operations
 * Strips managed fields from entities when creating or updating.
 */
export type EntityCreate<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'>;
export type EntityUpdate<T> = Partial<EntityCreate<T>>;

// ============================================================================
// Tenant & Core Types
// ============================================================================

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

export type { BaseEntity, ContentNodeType as ContentNode, DatabaseId, ISODateString, Schema, User, Session, Token, Role, WebsiteToken };

/**
 * Pagination and Sorting Options
 * @deprecated Use PaginationOptions (plural) for new code. Kept for backwards compatibility.
 */
type SortOption = { [key: string]: 'asc' | 'desc' } | [string, 'asc' | 'desc'][];
export interface PaginationOption {
	filter?: Record<string, unknown>;
	limit?: number;
	offset?: number;
	sort?: SortOption;
}

export interface PaginationOptions {
	cursor?: string; // For cursor-based pagination
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
	nextCursor?: string;
	page?: number;
	pageSize: number;
	previousCursor?: string;
	total?: number; // Optional based on includeTotalCount
}

// ============================================================================
// Performance, Telemetry & Caching
// ============================================================================

export interface QueryOptimizationHints {
	batchSize?: number;
	maxExecutionTime?: number;
	readPreference?: 'primary' | 'secondary' | 'nearest';
	streaming?: boolean;
	useIndex?: string[];
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

export interface PerformanceMetrics {
	averageQueryTime: number;
	cacheHitRate: number;
	connectionPoolUsage: number;
	queryCount: number;
	slowQueries: Array<{ query: string; duration: number; timestamp: Date }>;
}

export interface CacheOptions {
	enabled?: boolean;
	key?: string;
	tags?: string[];
	ttl?: number; // TTL in seconds
}

export interface ConnectionPoolStats {
	active: number;
	avgConnectionTime: number;
	idle: number;
	total: number;
	waiting: number;
}

// ============================================================================
// Database Result & Queries
// ============================================================================

export interface DatabaseError {
	code: string;
	details?: unknown;
	message: string;
	stack?: string;
	statusCode?: number;
}

export interface QueryMeta {
	cached?: boolean;
	executionTime?: number;
	indexesUsed?: string[];
	recordsExamined?: number;
}

export type DatabaseResult<T> = { success: true; data: T; meta?: QueryMeta } | { success: false; message: string; error: DatabaseError };

export type NonNullObject = Record<string, unknown>;

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
			$in?: NonNullable<T>[];
			$nin?: NonNullable<T>[];
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

// ============================================================================
// Domain Entities
// ============================================================================

export interface CollectionModel {
	aggregate: <R = unknown>(pipeline: Record<string, unknown>[]) => Promise<R[]>;
	findOne: <R = unknown>(query: Record<string, unknown>) => Promise<R | null>;
}

export interface NestedContentNode extends ContentNodeType {
	children: NestedContentNode[];
	path: string;
}

export interface ContentDraft<T = unknown> extends BaseEntity {
	authorId: DatabaseId;
	contentId: DatabaseId;
	data: T;
	status: 'draft' | 'review' | 'archived';
	version: number;
}

export interface ContentRevision extends BaseEntity {
	authorId: DatabaseId;
	commitMessage?: string;
	contentId: DatabaseId;
	data: unknown;
	version: number;
}

export interface ThemeConfig {
	assetsPath: string;
	tailwindConfigPath: string;
	[key: string]: unknown;
}

export interface Theme extends BaseEntity {
	_id: DatabaseId;
	config: ThemeConfig;
	customCss?: string;
	isActive: boolean;
	isDefault: boolean;
	name: string;
	path: string;
	previewImage?: string;
}

export interface Widget extends BaseEntity {
	dependencies: string[];
	instances: Record<string, unknown>;
	isActive: boolean;
	name: string;
}

export interface MediaMetadata {
	advancedMetadata?: Record<string, unknown>;
	codec?: string;
	duration?: number;
	format?: string;
	height?: number;
	width?: number;
	[key: string]: unknown;
}

export interface MediaItem extends BaseEntity {
	access?: 'public' | 'private' | 'protected';
	createdBy: DatabaseId;
	filename: string;
	folderId?: DatabaseId | null;
	hash: string;
	metadata: MediaMetadata;
	mimeType: string;
	originalFilename: string;
	originalId?: DatabaseId | null;
	path: string;
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

export interface SystemPreferences extends BaseEntity {
	key: string;
	scope: 'user' | 'system' | 'widget';
	userId?: DatabaseId;
	value: unknown;
	visibility: 'public' | 'private';
}

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

// ============================================================================
// Query Builder Interface
// ============================================================================

export interface QueryBuilder<T = unknown> {
	count(): Promise<DatabaseResult<number>>;
	deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>>;
	distinct<K extends keyof T>(field?: K): this;
	exclude<K extends keyof T>(fields: K[]): this;
	execute(): Promise<DatabaseResult<T[]>>;
	exists(): Promise<DatabaseResult<boolean>>;
	findOne(): Promise<DatabaseResult<T | null>>;
	findOneOrFail(): Promise<DatabaseResult<T>>;
	groupBy<K extends keyof T>(field: K): this;
	hint(hints: QueryOptimizationHints): this;
	limit(value: number): this;
	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this;
	paginate(options: PaginationOptions): this;
	search(query: string, fields?: (keyof T)[]): this;
	select<K extends keyof T>(fields: K[]): this;
	skip(value: number): this;
	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this;
	stream(): Promise<DatabaseResult<AsyncIterable<T>>>;
	timeout(milliseconds: number): this;
	updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>>;
	where(conditions: Partial<T> | ((item: T) => boolean)): this;
	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this;
	whereIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this;
	whereNotIn<K extends keyof T>(field: K, values: NonNullable<T[K]>[]): this;
	whereNotNull<K extends keyof T>(field: K): this;
	whereNull<K extends keyof T>(field: K): this;
}

export interface DatabaseTransaction {
	commit(): Promise<DatabaseResult<void>>;
	rollback(): Promise<DatabaseResult<void>>;
}

// ============================================================================
// Domain-Specific Adapters
// ============================================================================

export interface IAuthAdapter {
	blockTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	blockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	cleanupRotatedSessions?(): Promise<DatabaseResult<number>>;
	consumeToken(token: string, userId?: string, type?: string, tenantId?: string): Promise<DatabaseResult<{ status: boolean; message: string }>>;
	createRole(role: Role): Promise<DatabaseResult<Role>>;
	createSession(sessionData: { user_id: string; expires: ISODateString; tenantId?: string }): Promise<DatabaseResult<Session>>;
	createToken(data: { user_id: string; email: string; expires: ISODateString; type: string; tenantId?: string }): Promise<DatabaseResult<string>>;
	createUser(userData: Partial<User>): Promise<DatabaseResult<User>>;
	createUserAndSession(
		userData: Partial<User>,
		sessionData: { expires: ISODateString; tenantId?: string }
	): Promise<DatabaseResult<{ user: User; session: Session }>>;
	deleteExpiredSessions(): Promise<DatabaseResult<number>>;
	deleteExpiredTokens(): Promise<DatabaseResult<number>>;
	deleteRole(roleId: string, tenantId?: string): Promise<DatabaseResult<void>>;
	deleteSession(sessionId: string): Promise<DatabaseResult<void>>;
	deleteTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
	deleteUser(userId: string, tenantId?: string): Promise<DatabaseResult<void>>;
	deleteUserAndSessions(userId: string, tenantId?: string): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>>;
	deleteUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>;
	getActiveSessions(userId: string, tenantId?: string): Promise<DatabaseResult<Session[]>>;
	getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>>;
	getAllRoles(tenantId?: string): Promise<Role[]>;
	getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>>;
	getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>>;
	getRoleById(roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>>;
	getSessionTokenData(sessionId: string): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: string } | null>>;
	getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
	getTokenData(token: string, userId?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>>;
	getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>>;
	getUserById(userId: string, tenantId?: string): Promise<DatabaseResult<User | null>>;
	getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>;
	invalidateAllUserSessions(userId: string, tenantId?: string): Promise<DatabaseResult<void>>;
	rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>>;
	setupAuthModels(): Promise<void>;
	unblockTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	unblockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>;
	updateRole(roleId: string, roleData: Partial<Role>, tenantId?: string): Promise<DatabaseResult<Role>>;
	updateSessionExpiry(sessionId: string, newExpiry: ISODateString): Promise<DatabaseResult<Session>>;
	updateToken(tokenId: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>>;
	updateUserAttributes(userId: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>>;
	validateSession(sessionId: string): Promise<DatabaseResult<User | null>>;
	validateToken(
		token: string,
		userId?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>>;
}

export interface ICrudAdapter {
	aggregate<R>(collection: string, pipeline: unknown[], tenantId?: string | null, bypassTenantCheck?: boolean): Promise<DatabaseResult<R[]>>;
	count(collection: string, query?: QueryFilter<BaseEntity>, tenantId?: string | null, bypassTenantCheck?: boolean): Promise<DatabaseResult<number>>;
	delete(collection: string, id: DatabaseId, tenantId?: string | null, bypassTenantCheck?: boolean): Promise<DatabaseResult<void>>;
	deleteMany(
		collection: string,
		query: QueryFilter<BaseEntity>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<{ deletedCount: number }>>;
	exists(collection: string, query: QueryFilter<BaseEntity>, tenantId?: string | null, bypassTenantCheck?: boolean): Promise<DatabaseResult<boolean>>;
	findByIds<T extends BaseEntity>(
		collection: string,
		ids: DatabaseId[],
		options?: { fields?: (keyof T)[]; tenantId?: string | null; bypassTenantCheck?: boolean }
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
			bypassTenantCheck?: boolean;
		}
	): Promise<DatabaseResult<T[]>>;
	findOne<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { fields?: (keyof T)[]; tenantId?: string | null; bypassTenantCheck?: boolean }
	): Promise<DatabaseResult<T | null>>;
	insert<T extends BaseEntity>(
		collection: string,
		data: EntityCreate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>>;
	insertMany<T extends BaseEntity>(
		collection: string,
		data: EntityCreate<T>[],
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T[]>>;
	update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: EntityUpdate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>>;
	updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: EntityUpdate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<{ modifiedCount: number }>>;
	upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: EntityCreate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>>;
	upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>>;
}

export interface IMediaAdapter {
	files: {
		upload(file: EntityCreate<MediaItem>): Promise<DatabaseResult<MediaItem>>;
		uploadMany(files: EntityCreate<MediaItem>[]): Promise<DatabaseResult<MediaItem[]>>;
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
		create(folder: EntityCreate<MediaFolder>): Promise<DatabaseResult<MediaFolder>>;
		createMany(folders: EntityCreate<MediaFolder>[]): Promise<DatabaseResult<MediaFolder[]>>;
		delete(folderId: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(folderIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		getTree(maxDepth?: number): Promise<DatabaseResult<MediaFolder[]>>;
		getFolderContents(
			folderId?: DatabaseId,
			options?: PaginationOptions
		): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[]; totalCount: number }>>;
		move(folderId: DatabaseId, targetParentId?: DatabaseId): Promise<DatabaseResult<MediaFolder>>;
	};
	setupMediaModels(): Promise<void>;
}

export interface IContentAdapter {
	drafts: {
		create(draft: EntityCreate<ContentDraft>): Promise<DatabaseResult<ContentDraft>>;
		createMany(drafts: EntityCreate<ContentDraft>[]): Promise<DatabaseResult<ContentDraft[]>>;
		update(draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>>;
		publish(draftId: DatabaseId): Promise<DatabaseResult<void>>;
		publishMany(draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>>;
		getForContent(contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentDraft>>>;
		delete(draftId: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
	};
	nodes: {
		getStructure(
			mode: 'flat' | 'nested',
			filter?: Partial<ContentNodeType> & { tenantId?: string },
			bypassCache?: boolean,
			bypassTenantCheck?: boolean
		): Promise<DatabaseResult<ContentNodeType[]>>;
		upsertContentStructureNode(node: EntityCreate<ContentNodeType>): Promise<DatabaseResult<ContentNodeType>>;
		create(node: EntityCreate<ContentNodeType>): Promise<DatabaseResult<ContentNodeType>>;
		createMany(nodes: EntityCreate<ContentNodeType>[]): Promise<DatabaseResult<ContentNodeType[]>>;
		update(path: string, changes: Partial<ContentNodeType>): Promise<DatabaseResult<ContentNodeType>>;
		bulkUpdate(updates: { path: string; id?: string; changes: Partial<ContentNodeType> }[]): Promise<DatabaseResult<ContentNodeType[]>>;
		fixMismatchedNodeIds?(
			nodes: { path: string; expectedId: string; changes: Partial<ContentNodeType> }[]
		): Promise<DatabaseResult<{ fixed: number }>>;
		delete(path: string): Promise<DatabaseResult<void>>;
		deleteMany(paths: string[], options?: { tenantId?: string }): Promise<DatabaseResult<{ deletedCount: number }>>;
		reorder(nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNodeType[]>>;
		reorderStructure(items: Array<{ id: string; parentId: string | null; order: number; path: string }>): Promise<DatabaseResult<void>>;
	};
	revisions: {
		create(revision: EntityCreate<ContentRevision>): Promise<DatabaseResult<ContentRevision>>;
		getHistory(contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>>;
		restore(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
		delete(revisionId: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>>;
		cleanup(contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>>;
	};
}

export interface ISystemAdapter {
	preferences: {
		get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T | null>>;
		getMany<T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>>;
		getByCategory<T>(category: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>>;
		set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId, category?: string): Promise<DatabaseResult<void>>;
		setMany<T>(
			preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId; category?: string }>
		): Promise<DatabaseResult<void>>;
		delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		deleteMany(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		clear(scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
	};
	virtualFolder: {
		create(folder: EntityCreate<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>>;
		getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>>;
		getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>>;
		getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>>;
		update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>>;
		addToFolder(contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>>;
		getContents(folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>>;
		ensure(folder: EntityCreate<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>>;
		delete(folderId: DatabaseId): Promise<DatabaseResult<void>>;
		exists(path: string): Promise<DatabaseResult<boolean>>;
	};
	tenants: {
		create(tenant: EntityCreate<Tenant> & { _id?: DatabaseId }): Promise<DatabaseResult<Tenant>>;
		getById(tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>>;
		update(tenantId: DatabaseId, data: Partial<EntityCreate<Tenant>>): Promise<DatabaseResult<Tenant>>;
		delete(tenantId: DatabaseId): Promise<DatabaseResult<void>>;
		list(options?: PaginationOption): Promise<DatabaseResult<Tenant[]>>;
	};
	themes: {
		setupThemeModels(): Promise<void>;
		getActive(): Promise<DatabaseResult<Theme>>;
		setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>>;
		install(theme: EntityCreate<Theme>): Promise<DatabaseResult<Theme>>;
		uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>>;
		update(themeId: DatabaseId, theme: Partial<EntityCreate<Theme>>): Promise<DatabaseResult<Theme>>;
		getAllThemes(): Promise<Theme[]>;
		storeThemes(themes: Theme[]): Promise<void>;
		ensure(theme: EntityCreate<Theme>): Promise<Theme>;
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
		register(widget: EntityCreate<Widget>): Promise<DatabaseResult<Widget>>;
		findAll(): Promise<DatabaseResult<Widget[]>>;
		getActiveWidgets(): Promise<DatabaseResult<Widget[]>>;
		activate(widgetId: DatabaseId): Promise<DatabaseResult<void>>;
		deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>>;
		update(widgetId: DatabaseId, widget: Partial<EntityCreate<Widget>>): Promise<DatabaseResult<Widget>>;
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

// ============================================================================
// Main Root Database Adapter
// ============================================================================

export interface IDBAdapter {
	// Top-Level Domains
	auth: IAuthAdapter;
	content: IContentAdapter;
	crud: ICrudAdapter;
	media: IMediaAdapter;
	system: ISystemAdapter;
	monitoring: IMonitoringAdapter;

	// High-Performance Batch Operations
	batch: {
		execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>>;
		bulkInsert<T extends BaseEntity>(collection: string, items: EntityCreate<T>[]): Promise<DatabaseResult<T[]>>;
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
	connect(poolOptions: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	disconnect(): Promise<DatabaseResult<void>>;

	// Lazy Initializers
	ensureAuth?(): Promise<void>;
	ensureCollections?(): Promise<void>;
	ensureContent?(): Promise<void>;
	ensureMedia?(): Promise<void>;
	ensureMonitoring?(): Promise<void>;
	ensureSystem?(): Promise<void>;

	// Performance and Capabilities
	getCapabilities(): DatabaseCapabilities;

	// Collection Data Access
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

	getMultipleCollectionData(
		collectionNames: string[],
		options?: { limit?: number; fields?: string[] }
	): Promise<DatabaseResult<Record<string, unknown[]>>>;

	isConnected(): boolean;

	// Query Builder Entry Point
	queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T>;

	// Transaction Support
	transaction<T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: { timeout?: number; isolationLevel?: string }
	): Promise<DatabaseResult<T>>;

	// Database Agnostic Utilities
	utils: {
		generateId(): DatabaseId;
		normalizePath(path: string): string;
		validateId(id: string): boolean;
		createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T>;
	};

	waitForConnection?(): Promise<void>;
}

// Type aliases for backward compatibility (Consider migrating away from dbInterface to DatabaseAdapter)
export type DatabaseAdapter = IDBAdapter;
/** @deprecated use `DatabaseAdapter` or `IDBAdapter` to match standard PascalCase conventions */
export type dbInterface = IDBAdapter;

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
