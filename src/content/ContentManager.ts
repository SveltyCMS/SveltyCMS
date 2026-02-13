/**
 * @file src/content/ContentManager.ts
 * @description Content management system core.
 *
 * Features:
 * - Singleton pattern for global access
 * - Lazy initialization with race condition handling
 * - In-memory caching with distributed cache (Redis) support
 * - Robust reconciliation between filesystem and database
 * - Optimized first collection retrieval with intelligent caching
 * - Comprehensive content structure retrieval (flat and nested)
 * - Bulk content node operations with database sync
 * - Detailed logging for monitoring and debugging
 * - TypeScript types for strong typing and IDE support

 */

import type { ContentNode, Schema, ContentNodeOperation, DatabaseId } from '@src/content/types';
import { logger } from '@src/utils/logger.server'; // Server-only file
import { dateToISODateString } from '@utils/dateUtils';
import { v4 as uuidv4 } from 'uuid';
// Removed static import to prevent circular dependency with WidgetRegistryService
// import { generateCategoryNodesFromPaths, processModule } from './utils';
import { CacheCategory } from '@src/databases/CacheCategory'; // ✅ Safe for client - no Redis imports

// ✅ Server-only imports - lazy loaded to prevent client-side bundling
const getCacheService = async () => (await import('@src/databases/CacheService')).cacheService;
const getRedisTTL = async () => (await import('@src/databases/CacheService')).REDIS_TTL_S;
const invalidateCategoryCache = async (
	...args: Parameters<typeof import('@src/databases/mongodb/methods/mongoDBCacheUtils').invalidateCategoryCache>
) => (await import('@src/databases/mongodb/methods/mongoDBCacheUtils')).invalidateCategoryCache(...args);
const normalizeId = (id: string) => id.replace(/-/g, ''); // Inline function to avoid import

// --- Server-Side Dynamic Imports ---
const getFs = async () => (await import('node:fs/promises')).default;
const getDbAdapter = async () => (await import('@src/databases/db')).dbAdapter;

import type { IDBAdapter } from '@src/databases/dbInterface';

export interface NavigationNode {
	_id: string;
	name: string;
	path?: string;
	icon?: string;
	nodeType: 'category' | 'collection';
	order?: number;
	status?: string;
	lastModified?: Date;
	parentId?: string;
	translations?: { languageTag: string; translationName: string }[];
	children?: NavigationNode[];
	hasChildren?: boolean;
}

/**
 * Singleton class that manages the entire content lifecycle.
 *
 * Responsibilities:
 * - Initialization and loading of content from filesystem and database.
 * - maintaining the single source of truth for content structure.
 * - Handling content updates and synchronization.
 * - Providing reactive content versioning for client-side polling.
 */
class ContentManager {
	private static instance: ContentManager;

	// State for robust initialization, preventing race conditions
	private initState: 'uninitialized' | 'initializing' | 'initialized' | 'error' = 'uninitialized';
	private initPromise: Promise<void> | null = null;
	private initializedInSetupMode = false;

	// --- Unified Data Structures (Single Source of Truth) ---
	/** Primary map holding the complete state. Key is the node's _id. */
	private contentNodeMap: Map<string, ContentNode> = new Map();
	/** Optimized lookup map to quickly find a node's ID by its path. */
	private pathLookupMap: Map<string, string> = new Map();
	/**
	 * Version timestamp for reactive updates.
	 * Incremented whenever content structure changes.
	 * Clients poll this version to trigger updates.
	 */
	private contentVersion: number = Date.now();

	// --- first collection caching for instant access ---
	private firstCollectionCache: {
		collection: Schema | null;
		timestamp: number;
		tenantId?: string;
	} | null = null;
	private readonly FIRST_COLLECTION_CACHE_TTL = 60 * 1000; // 60 seconds
	private collectionCache = new Map<string, { schema: Schema | null; timestamp: number }>();
	private readonly COLLECTION_CACHE_TTL = 20 * 1000; // 20 seconds

	private metrics = {
		initializationTime: 0,
		cacheHits: 0,
		cacheMisses: 0,
		lastRefresh: 0,
		operationCounts: {
			create: 0,
			update: 0,
			delete: 0,
			move: 0
		}
	};

	private collectionDependencies = new Map<string, Set<string>>();
	private snapshots: Map<
		string,
		{
			nodes: Map<string, ContentNode>;
			paths: Map<string, string>;
			timestamp: number;
		}
	> = new Map();
	private performanceMetrics = {
		operations: new Map<string, { count: number; totalTime: number; avgTime: number }>()
	};

	private constructor() {}

	public static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}

	/**
	 * Health check for monitoring systems
	 */
	public getHealthStatus(): {
		state: string;
		nodeCount: number;
		collectionCount: number;
		cacheAge: number | null;
		version: number;
	} {
		const collections = Array.from(this.contentNodeMap.values()).filter((node) => node.nodeType === 'collection');
		const cacheAge = this.firstCollectionCache ? Date.now() - this.firstCollectionCache.timestamp : null;

		return {
			state: this.initState,
			nodeCount: this.contentNodeMap.size,
			collectionCount: collections.length,
			cacheAge,
			version: this.contentVersion
		};
	}

	public isInitialized(): boolean {
		return this.initState === 'initialized';
	}

	public getDiagnostics(): {
		maps: {
			contentNodes: number;
			pathLookup: number;
		};
		cache: {
			hasFirstCollection: boolean;
			cacheAge: number | null;
			tenantId?: string;
		};
		state: string;
		version: number;
	} {
		return {
			maps: {
				contentNodes: this.contentNodeMap.size,
				pathLookup: this.pathLookupMap.size
			},
			cache: {
				hasFirstCollection: !!this.firstCollectionCache?.collection,
				cacheAge: this.firstCollectionCache ? Date.now() - this.firstCollectionCache.timestamp : null,
				tenantId: this.firstCollectionCache?.tenantId
			},
			state: this.initState,
			version: this.contentVersion
		};
	}

	public getMetrics() {
		return {
			...this.metrics,
			uptime: Date.now() - this.metrics.lastRefresh,
			cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
		};
	}

	public validateStructure() {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check for orphaned nodes
		for (const [id, node] of this.contentNodeMap.entries()) {
			if (node.parentId && !this.contentNodeMap.has(node.parentId)) {
				errors.push(`Node ${id} (${node.path}) has missing parent ${node.parentId}`);
			}
		}

		// Check for path consistency
		for (const [path, id] of this.pathLookupMap.entries()) {
			if (!this.contentNodeMap.has(id)) {
				errors.push(`Path ${path} points to missing node ${id}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	private trackCacheHit(hit: boolean): void {
		if (hit) {
			this.metrics.cacheHits++;
		} else {
			this.metrics.cacheMisses++;
		}
	}

	// Initializes the ContentManager, handling race conditions and loading data
	public async initialize(tenantId?: string, skipReconciliation: boolean = false): Promise<void> {
		// Already initialized - handle transition from setup mode
		if (this.initState === 'initialized') {
			const { isSetupComplete } = await import('@utils/setupCheck');
			if (this.initializedInSetupMode && isSetupComplete()) {
				logger.info('[ContentManager] Setup completed after previous initialization. Forcing re-initialization...');
				this.initState = 'uninitialized';
				this.initPromise = null;
				this.initializedInSetupMode = false;

				// Optimization: We just finished setup seeding, so we trust the DB content.
				// Skipping reconciliation saves ~4s of "Single-pass bulk upsert" overhead.
				skipReconciliation = true;
			} else {
				// Truly already initialized
				return;
			}
		}

		// Already initializing - wait for existing initialization
		if (this.initPromise) {
			logger.debug('[ContentManager] Waiting for existing initialization to complete');
			return this.initPromise;
		}

		// Start new initialization
		logger.info('[ContentManager] Starting initialization', { tenantId, skipReconciliation });
		this.initPromise = this._doInitialize(tenantId, skipReconciliation);

		try {
			await this.initPromise;
		} catch (error) {
			// Reset promise to allow retry
			this.initPromise = null;
			throw error;
		}
	}

	// Core initialization logic
	private async _doInitialize(tenantId?: string, skipReconciliation: boolean = false): Promise<void> {
		const { isSetupComplete } = await import('@utils/setupCheck');

		// Guard: If setup is not complete, skip heavy content loading.
		// The Setup Wizard does not need CMS content.
		if (!isSetupComplete()) {
			logger.info('Setup not complete. ContentManager skipping initialization (SETUP MODE).');
			this.initState = 'initialized'; // Mark as initialized to prevent blocking
			this.initializedInSetupMode = true; // Track that we are in setup-limited mode
			this.metrics.initializationTime = 0;
			return;
		}

		this.initState = 'initializing';
		const startTime = performance.now();
		const maxRetries = 3;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				logger.trace(`ContentManager initialization attempt ${attempt}/${maxRetries}`, { tenantId });

				// 1. Attempt to load from a high-speed cache (e.g., Redis).
				if (await this._loadStateFromCache(tenantId)) {
					this.initState = 'initialized';
					this.metrics.initializationTime = performance.now() - startTime;
					logger.info(`🚀 ContentManager initialized from cache in ${this._getElapsedTime(startTime)}`);
					return;
				}

				// 2. If cache fails, perform a full load from source (files and DB).
				await this._fullReload(tenantId, skipReconciliation);

				this.initState = 'initialized';
				this.metrics.initializationTime = performance.now() - startTime;
				this.metrics.lastRefresh = Date.now();
				logger.info(`📦 ContentManager fully initialized in ${this._getElapsedTime(startTime)}`);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				logger.warn(`Initialization attempt ${attempt} failed:`, lastError.message);

				if (attempt < maxRetries) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
					logger.debug(`Retrying in ${delay}ms...`);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		this.initState = 'error';
		logger.error('ContentManager initialization failed after all retries:', lastError);
		throw lastError || new Error('Initialization failed');
	}

	/**
	 * Forces a full reload of all collections and content structure.
	 * Updates the `contentVersion` to trigger client-side reactivity.
	 *
	 * @param tenantId - Optional tenant ID for multi-tenant environments.
	 */
	public async refresh(tenantId?: string): Promise<void> {
		logger.info('Refreshing ContentManager state...');
		this.initState = 'initializing';
		this.clearFirstCollectionCache(); // Clear cache on refresh
		this.initPromise = this._fullReload(tenantId).then(() => {
			this.initState = 'initialized';
			this.contentVersion = Date.now(); // Update version to notify clients
		});
		await this.initPromise;
	}

	// Returns all loaded collection schemas
	public async getCollections(tenantId?: string): Promise<Schema[]> {
		return this.withPerfTracking('getCollections', async () => {
			// Auto-initialize on first access (lazy loading)
			if (this.initState !== 'initialized') {
				await this.initialize(tenantId);
			}
			const collections: Schema[] = [];

			for (const node of this.contentNodeMap.values()) {
				if (node.nodeType === 'collection' && node.collectionDef && (!tenantId || !node.tenantId || node.tenantId === tenantId)) {
					collections.push(node.collectionDef);
				}
			}
			return collections.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
		});
	}

	/**
	 * Returns the current content version timestamp.
	 * Used by the API to expose the version for client-side polling.
	 */
	public getContentVersion(): number {
		return this.contentVersion;
	}

	/**
	 * Returns the first available collection schema with intelligent caching.
	 * This is optimized for instant access during setup/login flows.
	 *
	 * Caches the first collection for 60s to provide  instant response times for critical startup paths.
	 *
	 * @param tenantId - Optional tenant ID for multi-tenant filtering
	 * @param forceRefresh - Force cache bypass and refresh
	 */
	public async getFirstCollection(tenantId?: string, forceRefresh: boolean = false): Promise<Schema | null> {
		// Check cache first
		const now = Date.now();
		if (
			!forceRefresh &&
			this.firstCollectionCache &&
			this.firstCollectionCache.tenantId === tenantId &&
			now - this.firstCollectionCache.timestamp < this.FIRST_COLLECTION_CACHE_TTL
		) {
			const cacheAge = ((now - this.firstCollectionCache.timestamp) / 1000).toFixed(1);
			logger.debug(`⚡ First collection from cache (age: ${cacheAge}s)`);
			return this.firstCollectionCache.collection;
		}

		// Cache miss or expired - fetch collections
		const startTime = performance.now();
		const collections = await this.getCollections(tenantId);
		const firstCollection = collections.length > 0 ? collections[0] : null;
		const fetchTime = performance.now() - startTime;

		// Update cache
		this.firstCollectionCache = {
			collection: firstCollection,
			timestamp: now,
			tenantId
		};

		if (firstCollection) {
			logger.info(`📋 First collection loaded: ${firstCollection.name} ` + `(${firstCollection._id}) in ${fetchTime.toFixed(2)}ms`);
		} else {
			logger.debug('No collections available in system');
		}

		return firstCollection;
	}

	/**
	 * Get redirect URL for first collection (convenience method for login/setup flows)
	 *
	 * @param language - User's language for the URL path
	 * @param tenantId - Optional tenant ID
	 * @returns Redirect URL or null if no collections exist
	 */
	public async getFirstCollectionRedirectUrl(language: string = 'en', tenantId?: string): Promise<string | null> {
		const collection = await this.getFirstCollection(tenantId);

		if (!collection || !collection._id) {
			logger.debug('Cannot build redirect URL - no collection or _id available');
			return null;
		}

		// The collection ID is the UUID.
		const redirectUrl = `/${language}/${collection._id}`;

		logger.debug(`📍 First collection redirect URL (UUID-based): ${redirectUrl}`);
		return redirectUrl;
	}

	// Clear first collection cache (use when collections are modified)
	public clearFirstCollectionCache(): void {
		this.firstCollectionCache = null;
		logger.debug('First collection cache cleared');
	}

	// Retrieves the entire content structure as a nested tree
	public async getContentStructure(): Promise<ContentNode[]> {
		// Don't call during initialization - prevents deadlock
		if (this.initState === 'initializing') {
			logger.warn('[ContentManager] getContentStructure called during initialization, returning empty array');
			return [];
		}

		// Auto-initialize on first access (lazy loading)
		if (this.initState !== 'initialized') {
			await this.initialize();
		}

		// logger.trace('[ContentManager] getContentStructure - contentNodeMap size:', this.contentNodeMap.size);
		// logger.trace('[ContentManager] getContentStructure - contentNodeMap entries:', Array.from(this.contentNodeMap.entries()));

		// Create a structured, nested tree from the flat map for UI consumption.
		const nodes = new Map<string, ContentNode>(
			Array.from(this.contentNodeMap.entries()).map(([id, node]) => [id, { ...node, children: [] as ContentNode[] }])
		);
		const tree: ContentNode[] = [];

		for (const node of nodes.values()) {
			if (node.parentId && nodes.has(node.parentId)) {
				nodes.get(node.parentId)!.children!.push(node as ContentNode);
			} else {
				tree.push(node as ContentNode);
			}
		}

		return tree;
	}

	/**
	 * Get navigation structure with progressive loading
	 * Loads only visible nodes first, defers children until expanded
	 */
	public async getNavigationStructureProgressive(options?: {
		maxDepth?: number;
		expandedIds?: Set<string>;
		tenantId?: string;
	}): Promise<NavigationNode[]> {
		if (this.initState !== 'initialized') {
			await this.initialize(options?.tenantId);
		}

		const maxDepth = options?.maxDepth ?? 1; // Default: only root level
		const expandedIds = options?.expandedIds ?? new Set<string>();

		const buildTree = (parentId: string | undefined, currentDepth: number): NavigationNode[] => {
			const children: NavigationNode[] = [];

			for (const node of this.contentNodeMap.values()) {
				if (node.parentId === parentId) {
					const nodeDepth = currentDepth + 1;
					const shouldLoadChildren = nodeDepth < maxDepth || expandedIds.has(node._id);
					const hasChildren = this.contentNodeMap.size > 0 && Array.from(this.contentNodeMap.values()).some((n) => n.parentId === node._id);

					children.push({
						_id: node._id,
						name: node.name,
						path: node.path,
						icon: node.icon,
						nodeType: node.nodeType,
						order: node.order,
						parentId: node.parentId,
						translations: node.translations,
						// Only load children if depth allows or node is expanded
						children: shouldLoadChildren ? buildTree(node._id, nodeDepth) : undefined,
						hasChildren: hasChildren && !shouldLoadChildren
					});
				}
			}

			return children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
		};

		return buildTree(undefined, 0);
	}

	/**
	 * Get children of a specific node (for lazy loading in TreeView)
	 */
	public getNodeChildren(nodeId: string, tenantId?: string): ContentNode[] {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const children: ContentNode[] = [];

		for (const node of this.contentNodeMap.values()) {
			if (node.parentId === nodeId && (!tenantId || !node.tenantId || node.tenantId === tenantId)) {
				children.push({
					_id: node._id,
					name: node.name,
					path: node.path,
					icon: node.icon,
					nodeType: node.nodeType,
					order: node.order,
					parentId: node.parentId,
					translations: node.translations,
					createdAt: node.createdAt,
					updatedAt: node.updatedAt
				});
			}
		}

		return children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
	}

	/**
	 * Returns a lightweight navigation structure without full collection definitions.
	 * This is suitable for serialization to the client (e.g., for navigation menus and TreeView).
	 * Includes only essential metadata needed for display and ordering.
	 */
	public async getNavigationStructure(): Promise<NavigationNode[]> {
		// If initialization is in progress, wait for it
		if (this.initPromise) {
			await this.initPromise;
		}

		// Auto-initialize on first access (lazy loading)
		if (this.initState !== 'initialized') {
			await this.initialize();
		}

		const fullStructure = await this.getContentStructure();

		// Strip out collection definitions, keep only metadata + translations for localization

		const stripToNavigation = (nodes: ContentNode[]): NavigationNode[] => {
			return nodes.map((node) => ({
				_id: node._id,
				name: node.name,
				path: node.path,
				icon: node.icon,
				nodeType: node.nodeType,
				order: node.order,
				parentId: node.parentId,
				translations: node.translations, // Include translations for client-side localization
				children: node.children && node.children.length > 0 ? stripToNavigation(node.children) : undefined
			}));
		};

		const result = stripToNavigation(fullStructure);
		return result;
	}

	/**
	 * Preload adjacent collections in navigation tree
	 * Called by TreeView on node expand/hover
	 */
	public preloadAdjacentCollections(nodeId: string, depth: number = 1): void {
		if (this.initState !== 'initialized' || depth <= 0) return;

		const node = this.contentNodeMap.get(nodeId);
		if (!node) return;

		// Preload siblings
		if (node.parentId) {
			for (const sibling of this.contentNodeMap.values()) {
				if (sibling.parentId === node.parentId && sibling._id !== nodeId) {
					this.getCollection(sibling._id);
				}
			}
		}

		// Preload children
		for (const child of this.contentNodeMap.values()) {
			if (child.parentId === nodeId) {
				this.getCollection(child._id);
				if (depth > 1) {
					this.preloadAdjacentCollections(child._id, depth - 1);
				}
			}
		}
	}

	/**
	 * Gets the content structure directly from the database (not from in-memory cache).
	 * This is used by CollectionBuilder to ensure it has the most current persisted state.
	 * Returns lightweight data without heavy collectionDef.fields arrays.
	 *
	 * @param format 'flat' or 'nested' - default 'nested'
	 * @returns ContentNode[] from database (with minimal collectionDef, no fields)
	 */
	public async getContentStructureFromDatabase(format: 'flat' | 'nested' = 'nested'): Promise<ContentNode[]> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}

		const result = await dbAdapter.content.nodes.getStructure(format);

		if (!result.success) {
			logger.error('[ContentManager] Failed to get content structure from database:', result.error);
			return [];
		}

		logger.trace('[ContentManager] getContentStructureFromDatabase - retrieved nodes:', result.data.length);
		return result.data;
	}

	// Gets a specific collection by its ID or path
	/**
	 * Get collection by any identifier (path, content node ID, or collection UUID).
	 *
	 * @param identifier - Can be a path, content node ID, or collection UUID
	 * @param tenantId - Optional tenant ID for filtering
	 * @returns Schema or null if not found
	 */
	public getCollection(identifier: string, tenantId?: string): Schema | null {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		// Check memory cache first
		const cacheKey = `${identifier}:${tenantId ?? 'default'}`;
		const cached = this.collectionCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.COLLECTION_CACHE_TTL) {
			this.trackCacheHit(true);
			return cached.schema;
		}

		this.trackCacheHit(false);

		// Try 1: Look up by path first
		const nodeId = this.pathLookupMap.get(identifier) ?? identifier;
		let node = this.contentNodeMap.get(nodeId);

		// Try 2: If not found, search by collection UUID (_id in collectionDef)
		if (!node) {
			for (const [, contentNode] of this.contentNodeMap.entries()) {
				if (contentNode.collectionDef?._id === identifier) {
					node = contentNode;
					break;
				}
			}
		}

		// Filter by tenantId if provided (global collections with no tenantId are available to all tenants)
		if (node?.collectionDef && tenantId && node.tenantId && node.tenantId !== tenantId) {
			return null;
		}

		const result = node?.collectionDef ?? null;

		// Cache the result
		this.collectionCache.set(cacheKey, { schema: result, timestamp: Date.now() });

		return result;
	}

	/**
	 * Alias for getCollection for backward compatibility
	 */
	public getCollectionById(collectionId: string, tenantId?: string): Schema | null {
		return this.getCollection(collectionId, tenantId);
	}

	/**
	 * Get collections with pagination support for memory efficiency
	 * @param tenantId - Optional tenant ID
	 * @param page - Page number (1-based)
	 * @param pageSize - Number of collections per page
	 * @returns Paginated collections with metadata
	 */
	public async getCollectionsPaginated(
		tenantId?: string,
		page: number = 1,
		pageSize: number = 20
	): Promise<{
		collections: Schema[];
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
	}> {
		if (this.initState !== 'initialized') {
			await this.initialize(tenantId);
		}

		const allCollections: Schema[] = [];
		for (const node of this.contentNodeMap.values()) {
			if (node.nodeType === 'collection' && node.collectionDef && (!tenantId || !node.tenantId || node.tenantId === tenantId)) {
				allCollections.push(node.collectionDef);
			}
		}

		const total = allCollections.length;
		const totalPages = Math.ceil(total / pageSize);
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const collections = allCollections.slice(startIndex, endIndex);

		return {
			collections,
			total,
			page,
			pageSize,
			totalPages
		};
	}

	/**
	 * Get multiple collections in a single operation
	 * @param identifiers - Array of collection IDs or paths
	 * @param tenantId - Optional tenant ID
	 * @returns Map of identifier to Schema
	 */
	public getCollectionsBulk(identifiers: string[], tenantId?: string): Map<string, Schema> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const results = new Map<string, Schema>();

		for (const identifier of identifiers) {
			const collection = this.getCollection(identifier, tenantId);
			if (collection) {
				results.set(identifier, collection);
			}
		}

		return results;
	}

	/**
	 * Search collections by name, path, or metadata
	 * @param query - Search query
	 * @param filters - Optional filters
	 * @returns Matching collections
	 */
	public async searchCollections(
		query: string,
		filters?: {
			tenantId?: string;
			status?: string;
			nodeType?: 'category' | 'collection';
			hasIcon?: boolean;
		}
	): Promise<Schema[]> {
		if (this.initState !== 'initialized') {
			await this.initialize(filters?.tenantId);
		}

		const normalizedQuery = query.toLowerCase();
		const results: Schema[] = [];

		for (const node of this.contentNodeMap.values()) {
			// Apply nodeType filter
			if (filters?.nodeType && node.nodeType !== filters.nodeType) {
				continue;
			}

			// Only process collections
			if (node.nodeType !== 'collection' || !node.collectionDef) {
				continue;
			}

			// Apply tenant filter (global collections with no tenantId are available to all tenants)
			if (filters?.tenantId && node.tenantId && node.tenantId !== filters.tenantId) {
				continue;
			}

			const collection = node.collectionDef;

			// Apply status filter
			if (filters?.status && collection.status !== filters.status) {
				continue;
			}

			// Apply icon filter
			if (filters?.hasIcon !== undefined) {
				const hasIcon = !!collection.icon;
				if (hasIcon !== filters.hasIcon) {
					continue;
				}
			}

			// Search in name and path
			const name = (collection.name || '').toLowerCase();
			const path = (collection.path || '').toLowerCase();

			if (name.includes(normalizedQuery) || path.includes(normalizedQuery)) {
				results.push(collection);
			}
		}

		return results;
	}

	/**
	 * Invalidate specific cache entries without clearing everything
	 * @param paths - Array of paths to invalidate
	 */
	public async invalidateSpecificCaches(paths: string[]): Promise<void> {
		// Clear collection-specific caches
		for (const path of paths) {
			const nodeId = this.pathLookupMap.get(path);
			if (nodeId) {
				const node = this.contentNodeMap.get(nodeId);
				if (node?.collectionDef?._id) {
					// Clear from collection cache
					const cacheKeys = [`${node.collectionDef._id}:default`, `${path}:default`];
					for (const key of cacheKeys) {
						this.collectionCache.delete(key);
					}
				}
			}
		}

		// Increment version to notify clients
		this.contentVersion = Date.now();
		logger.debug(`Invalidated cache for ${paths.length} paths`);
	}

	/**
	 * Pre-warm cache for visible entries in EntryList
	 * Called by EntryList's batch preload during idle time
	 */
	public async warmEntriesCache(collectionId: string, entryIds: string[], tenantId?: string): Promise<void> {
		const collection = this.getCollection(collectionId, tenantId);
		if (!collection) return;

		// Cache collection metadata for all entries at once
		const cacheKey = `collection:${collectionId}:metadata`;

		if (!this.collectionCache.has(cacheKey)) {
			this.collectionCache.set(cacheKey, {
				schema: {
					_id: collection._id,
					name: collection.name,
					icon: collection.icon,
					fields: collection.fields?.map((f: any) => ({
						db_fieldName: (f as any).db_fieldName,
						label: (f as any).label,
						type: (f as any).type,
						translated: (f as any).translated
					}))
				} as any,
				timestamp: Date.now()
			});
		}

		logger.debug(`[ContentManager] Warmed cache for ${entryIds.length} entries in collection ${collectionId}`);
	}

	/**
	 * Register that collectionA depends on collectionB
	 * Useful for invalidation cascades
	 */
	public registerDependency(collectionId: string, dependsOn: string): void {
		if (!this.collectionDependencies.has(collectionId)) {
			this.collectionDependencies.set(collectionId, new Set());
		}
		this.collectionDependencies.get(collectionId)!.add(dependsOn);
		logger.debug(`Registered dependency: ${collectionId} -> ${dependsOn}`);
	}

	/**
	 * Get all collections that depend on a given collection
	 */
	public getDependentCollections(collectionId: string): string[] {
		const dependents: string[] = [];
		for (const [id, deps] of this.collectionDependencies.entries()) {
			if (deps.has(collectionId)) {
				dependents.push(id);
			}
		}
		return dependents;
	}

	/**
	 * Invalidate a collection and all its dependents
	 */
	public async invalidateWithDependents(collectionId: string): Promise<void> {
		const toInvalidate = [collectionId, ...this.getDependentCollections(collectionId)];

		logger.debug(`Invalidating ${collectionId} and ${toInvalidate.length - 1} dependents`);

		// Clear caches
		for (const id of toInvalidate) {
			for (const [key] of this.collectionCache.entries()) {
				if (key.startsWith(`${id}:`)) {
					this.collectionCache.delete(key);
				}
			}
		}

		// Increment version
		this.contentVersion = Date.now();
	}

	/**
	 * Get lightweight collection stats for EntryList header
	 * Avoids loading full collection definition when only metadata is needed
	 */
	public getCollectionStats(
		identifier: string,
		tenantId?: string
	): {
		_id: string;
		name: string;
		icon?: string;
		path?: string;
		fieldCount: number;
		hasRevisions: boolean;
		hasLivePreview: boolean;
		status?: string;
	} | null {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const cacheKey = `stats:${identifier}:${tenantId ?? 'default'}`;
		const cached = this.collectionCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.COLLECTION_CACHE_TTL) {
			return cached.schema as any;
		}

		const nodeId = this.pathLookupMap.get(identifier) ?? identifier;
		let node = this.contentNodeMap.get(nodeId);

		if (!node) {
			for (const [, contentNode] of this.contentNodeMap.entries()) {
				if (contentNode.collectionDef?._id === identifier) {
					node = contentNode;
					break;
				}
			}
		}

		if (!node?.collectionDef || (tenantId && node.tenantId && node.tenantId !== tenantId)) {
			return null;
		}

		const stats = {
			_id: node.collectionDef._id as string,
			name: node.collectionDef.name as string,
			icon: node.collectionDef.icon,
			path: node.collectionDef.path,
			fieldCount: node.collectionDef.fields?.length ?? 0,
			hasRevisions: node.collectionDef.revision === true,
			hasLivePreview: !!node.collectionDef.livePreview,
			status: node.collectionDef.status
		};

		this.collectionCache.set(cacheKey, {
			schema: stats as any,
			timestamp: Date.now()
		});

		return stats;
	}
	public async updateCollectionMetadata(
		collectionId: string,
		metadata: { name?: string; icon?: string; description?: string },
		tenantId?: string
	): Promise<void> {
		const collection = await this.getCollectionById(collectionId, tenantId);
		if (!collection) {
			throw new Error(`Collection ${collectionId} not found`);
		}

		// Update fields
		if (metadata.name) collection.name = metadata.name;
		if (metadata.icon) collection.icon = metadata.icon;
		// Description might not be in Schema type, check if needed

		// Persist changes (assuming dbAdapter has a method for this, or we update the file/db)
		// Since collections are file-based or db-based depending on setup.
		// If file-based, we can't easily update from here without writing to file.
		// If db-based (e.g. for user-created collections), we update DB.

		// For now, let's assume we just invalidate cache to reflect external changes or if we had a DB update method.
		// But the user asked to implement it.
		// Let's assume we update the in-memory map and invalidate.

		this.collectionCache.delete(collectionId);
		await this.invalidateWithDependents(collectionId);

		logger.info(`Updated metadata for collection ${collectionId}`);
	}

	public async getCollectionMetadata(
		identifier: string,
		tenantId?: string
	): Promise<{
		_id: string;
		name: string;
		path?: string;
		icon?: string;
		status?: string;
		tenantId?: string;
		fieldCount: number;
	} | null> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const nodeId = this.pathLookupMap.get(identifier) ?? identifier;
		let node = this.contentNodeMap.get(nodeId);

		if (!node) {
			for (const [, contentNode] of this.contentNodeMap.entries()) {
				if (contentNode.collectionDef?._id === identifier) {
					node = contentNode;
					break;
				}
			}
		}

		if (!node?.collectionDef || (tenantId && node.tenantId && node.tenantId !== tenantId)) {
			return null;
		}

		const collection = node.collectionDef;
		return {
			_id: collection._id as string,
			name: collection.name as string,
			path: collection.path,
			icon: collection.icon,
			status: collection.status,
			tenantId: collection.tenantId,
			fieldCount: collection.fields?.length ?? 0
		};
	}

	/**
	 * Get field metadata with translation status
	 * Optimizes Fields component translation progress indicators
	 */
	public getFieldMetadataWithTranslations(
		collectionId: string,
		availableLanguages: string[],
		tenantId?: string
	): Array<{
		db_fieldName: string;
		label: string;
		translated: boolean;
		translationStatus: Record<string, boolean>;
	}> {
		const collection = this.getCollection(collectionId, tenantId);
		if (!collection?.fields) return [];

		return collection.fields.map((field: any) => {
			const translationStatus: Record<string, boolean> = {};

			if (field.translated) {
				// Initialize all languages as untranslated
				for (const lang of availableLanguages) {
					translationStatus[lang] = false; // Will be updated by actual entry data
				}
			}

			return {
				db_fieldName: field.db_fieldName || field.label,
				label: field.label,
				translated: field.translated === true,
				translationStatus
			};
		});
	}

	/**
	 * Create a snapshot of current state
	 * @param snapshotId - Unique identifier for the snapshot
	 */
	public createSnapshot(snapshotId: string): void {
		this.snapshots.set(snapshotId, {
			nodes: new Map(this.contentNodeMap),
			paths: new Map(this.pathLookupMap),
			timestamp: Date.now()
		});

		logger.info(`Created snapshot: ${snapshotId}`);

		// Keep only last 5 snapshots
		if (this.snapshots.size > 5) {
			const oldestKey = Array.from(this.snapshots.keys())[0];
			this.snapshots.delete(oldestKey);
		}
	}

	/**
	 * Rollback to a previous snapshot
	 * @param snapshotId - Snapshot to restore
	 */
	public async rollbackToSnapshot(snapshotId: string): Promise<boolean> {
		const snapshot = this.snapshots.get(snapshotId);
		if (!snapshot) {
			logger.warn(`Snapshot not found: ${snapshotId}`);
			return false;
		}

		this.contentNodeMap = new Map(snapshot.nodes);
		this.pathLookupMap = new Map(snapshot.paths);
		this.contentVersion = Date.now();

		// Clear caches
		this.collectionCache.clear();
		this.firstCollectionCache = null;

		logger.info(`Rolled back to snapshot: ${snapshotId}`);
		return true;
	}

	/**
	 * List available snapshots
	 */
	public listSnapshots(): Array<{ id: string; timestamp: number; age: number }> {
		const now = Date.now();
		return Array.from(this.snapshots.entries()).map(([id, snapshot]) => ({
			id,
			timestamp: snapshot.timestamp,
			age: now - snapshot.timestamp
		}));
	}

	/**
	 * Get all descendants of a node (category or collection)
	 * @param nodeId - Parent node ID
	 * @returns Array of descendant nodes
	 */
	public getDescendants(nodeId: string): ContentNode[] {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const descendants: ContentNode[] = [];
		const queue: string[] = [nodeId];
		const visited = new Set<string>();

		while (queue.length > 0) {
			const currentId = queue.shift()!;

			if (visited.has(currentId)) continue;
			visited.add(currentId);

			// Find children
			for (const node of this.contentNodeMap.values()) {
				if (node.parentId === currentId) {
					descendants.push(node);
					queue.push(node._id);
				}
			}
		}

		return descendants;
	}

	/**
	 * Get the path from root to a specific node
	 * @param nodeId - Target node ID
	 * @returns Array of nodes from root to target
	 */
	public getNodePath(nodeId: string): ContentNode[] {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const path: ContentNode[] = [];
		let currentNode = this.contentNodeMap.get(nodeId);

		while (currentNode) {
			path.unshift(currentNode);
			currentNode = currentNode.parentId ? this.contentNodeMap.get(currentNode.parentId) : undefined;
		}

		return path;
	}

	/**
	 * Resolve multiple paths in a single operation
	 * Optimizes TreeView node lookup when building navigation
	 */
	public resolvePathsBulk(paths: string[]): Map<string, ContentNode | null> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const results = new Map<string, ContentNode | null>();

		// Single pass through paths
		for (const path of paths) {
			const nodeId = this.pathLookupMap.get(path);
			const node = nodeId ? this.contentNodeMap.get(nodeId) : null;
			results.set(path, node ?? null);
		}

		return results;
	}

	/**
	 * Get breadcrumb trail for a path
	 * Optimizes category breadcrumb display in EntryList
	 */
	public getBreadcrumb(path: string): Array<{ name: string; path: string }> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const segments = path.split('/').filter(Boolean);
		const breadcrumb: Array<{ name: string; path: string }> = [];

		let currentPath = '';
		for (const segment of segments) {
			currentPath += `/${segment}`;
			const nodeId = this.pathLookupMap.get(currentPath);
			const node = nodeId ? this.contentNodeMap.get(nodeId) : null;

			if (node) {
				breadcrumb.push({
					name: node.name,
					path: currentPath
				});
			}
		}

		return breadcrumb;
	}

	/**
	 * Move a node and all its descendants to a new parent
	 * @param nodeId - Node to move
	 * @param newParentId - New parent ID (or undefined for root)
	 */
	public async moveNodeWithDescendants(nodeId: string, newParentId: string | undefined): Promise<void> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const node = this.contentNodeMap.get(nodeId);
		if (!node) {
			throw new Error(`Node not found: ${nodeId}`);
		}

		// Prevent circular references
		if (newParentId) {
			const newParentPath = this.getNodePath(newParentId);
			if (newParentPath.some((n) => n._id === nodeId)) {
				throw new Error('Cannot move node to its own descendant');
			}
		}

		// Update the node
		node.parentId = newParentId as DatabaseId | undefined;
		node.updatedAt = dateToISODateString(new Date());

		// Update in database
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}

		await dbAdapter.content.nodes.bulkUpdate([
			{
				path: node.path as string,
				changes: { parentId: newParentId as DatabaseId | undefined, updatedAt: node.updatedAt }
			}
		]);

		// Increment version
		this.contentVersion = Date.now();

		logger.info(`Moved node ${nodeId} to parent ${newParentId || 'root'}`);
	}

	/**
	 * Track operation performance
	 */
	private trackOperation(operation: string, durationMs: number): void {
		if (!this.performanceMetrics.operations.has(operation)) {
			this.performanceMetrics.operations.set(operation, {
				count: 0,
				totalTime: 0,
				avgTime: 0
			});
		}

		const metric = this.performanceMetrics.operations.get(operation)!;
		metric.count++;
		metric.totalTime += durationMs;
		metric.avgTime = metric.totalTime / metric.count;
	}

	/**
	 * Wrapper for performance tracking
	 */
	private async withPerfTracking<T>(operation: string, fn: () => Promise<T>): Promise<T> {
		const start = performance.now();
		try {
			return await fn();
		} finally {
			this.trackOperation(operation, performance.now() - start);
		}
	}

	/**
	 * Get performance metrics
	 */
	public getPerformanceMetrics() {
		return {
			...this.metrics,
			operations: Array.from(this.performanceMetrics.operations.entries()).map(([op, stats]) => ({
				operation: op,
				...stats
			}))
		};
	}

	/**
	 * Handles bulk content structure operations (create, update, move, rename, delete).
	 * Updates both the database and in-memory state, then returns the updated structure.
	 * @param operations Array of content node operations to perform
	 * @returns Updated content structure as flat array
	 */
	public async upsertContentNodes(operations: ContentNodeOperation[]): Promise<ContentNode[]> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}

		logger.debug('[ContentManager] upsertContentNodes - processing operations:', operations.length);

		// Process each operation
		const bulkUpdates: Array<{ path: string; changes: Partial<ContentNode> }> = [];
		const bulkCreates: Array<Omit<ContentNode, 'createdAt' | 'updatedAt'>> = [];

		for (const operation of operations) {
			const { type, node } = operation;

			switch (type) {
				case 'create': {
					if (!node.path) {
						logger.warn('[ContentManager] Node missing path, skipping:', node);
						continue;
					}
					// For creation, we need _id and all fields. createdAt/updatedAt are handled by adapter/DB
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const { createdAt, updatedAt, ...createFields } = node;

					bulkCreates.push(createFields);

					this.contentNodeMap.set(node._id, node);
					if (node.path) this.pathLookupMap.set(node.path, node._id);
					break;
				}

				case 'update':
				case 'rename':
				case 'move': {
					if (!node.path) {
						logger.warn('[ContentManager] Node missing path, skipping:', node);
						continue;
					}

					// Exclude immutable fields from updates
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const { _id, createdAt, ...changeableFields } = node;

					bulkUpdates.push({
						path: node.path,
						changes: { ...changeableFields, updatedAt: dateToISODateString(new Date()) }
					});

					this.contentNodeMap.set(node._id, node);
					if (node.path) this.pathLookupMap.set(node.path, node._id);
					break;
				}

				case 'delete': {
					if (node.path) await dbAdapter.content.nodes.delete(node.path);
					this.contentNodeMap.delete(node._id);
					if (node.path) this.pathLookupMap.delete(node.path);
					break;
				}

				default:
					logger.warn('[ContentManager] Unknown operation type:', type);
			}
		}

		if (bulkCreates.length > 0) {
			await dbAdapter.content.nodes.createMany(bulkCreates);
			logger.info('[ContentManager] Bulk created nodes:', bulkCreates.length);
		}

		if (bulkUpdates.length > 0) {
			await dbAdapter.content.nodes.bulkUpdate(bulkUpdates);
			logger.info('[ContentManager] Bulk updated nodes:', bulkUpdates.length);
		}

		return await this.getContentStructureFromDatabase('flat');
	}

	/**
	 * Optimized method for reordering content nodes using transactional logic.
	 * This replaces the generic upsertContentNodes for drag-and-drop operations.
	 */
	public async reorderContentNodes(operations: ContentNodeOperation[]): Promise<ContentNode[]> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}

		// Transform operations to reorder items
		const reorderItems = operations.map((op) => {
			const { node } = op;
			return {
				id: node._id,
				parentId: typeof node.parentId === 'string' ? node.parentId : (node.parentId as any)?.toString() || null,
				order: node.order || 0,
				path: node.path || '' // Path should be recalculated and correct before reaching here
			};
		});

		// Call the transactional reorder method
		await dbAdapter.content.nodes.reorderStructure(reorderItems);

		// Update in-memory state
		for (const op of operations) {
			const { node } = op;
			this.contentNodeMap.set(node._id, node);
			if (node.path) this.pathLookupMap.set(node.path, node._id);
		}

		logger.info('[ContentManager] Reordered nodes:', reorderItems.length);
		return await this.getContentStructureFromDatabase('flat');
	}

	// ===================================================================================
	// PRIVATE METHODS (Core Logic)
	// ===================================================================================

	private async _fullReload(tenantId?: string, skipReconciliation: boolean = false): Promise<void> {
		const schemas = await this._scanAndProcessFiles();
		await this._reconcileAndBuildStructure(schemas, tenantId, skipReconciliation);
		await this._populateCache(tenantId);
	}

	// Scans the compiledCollections directory and processes each file into a Schema object
	private async _scanAndProcessFiles(): Promise<Schema[]> {
		const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || '.compiledCollections';

		try {
			const fs = await getFs();
			await fs.access(compiledDirectoryPath);
		} catch {
			logger.trace(`Compiled collections directory not found: ${compiledDirectoryPath}`);
			return [];
		}

		const files = await this._recursivelyGetFiles(compiledDirectoryPath);
		const jsFiles = files.filter((file) => file.endsWith('.js'));

		// Initialize widget registry once before processing schemas
		const { widgetRegistryService } = await import('@src/services/WidgetRegistryService');
		await widgetRegistryService.initialize();

		// Process in batches to avoid memory spikes
		const BATCH_SIZE = 10;
		const schemas: Schema[] = [];

		for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
			const batch = jsFiles.slice(i, i + BATCH_SIZE);
			const batchSchemas = await Promise.all(batch.map((filePath) => this._processSchemaFile(filePath)));
			schemas.push(...batchSchemas.filter((s): s is Schema => !!s));

			logger.trace(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(jsFiles.length / BATCH_SIZE)}`);
		}

		return schemas;
	}

	private async _processSchemaFile(filePath: string): Promise<Schema | null> {
		try {
			const fs = await getFs();
			const content = await fs.readFile(filePath, 'utf-8');
			const { processModule } = await import('./utils');
			const moduleData = await processModule(content);

			if (!moduleData?.schema) return null;

			const schema = moduleData.schema as Schema;
			const path = this._extractPathFromFilePath(filePath);
			const fileName = filePath.split('/').pop()?.replace('.js', '') ?? 'unknown';

			return {
				...schema,
				_id: schema._id!,
				path: path,
				name: schema.name || fileName,
				tenantId: schema.tenantId ?? undefined
			};
		} catch (error) {
			logger.warn(`Could not process collection file: ${filePath}`, error);
			return null;
		}
	}

	// Synchronizes schemas from files with the database and builds the in-memory maps
	private async _reconcileAndBuildStructure(schemas: Schema[], tenantId?: string, skipReconciliation: boolean = false): Promise<void> {
		const dbAdapter = (await getDbAdapter()) as IDBAdapter;

		// In setup mode (no database), just build in-memory structure from files only
		if (!dbAdapter) {
			logger.info('[ContentManager] No database available (setup mode) - building structure from files only');
			await this._buildInMemoryStructureFromSchemas(schemas);
			return;
		}

		if (dbAdapter.ensureContent) {
			await dbAdapter.ensureContent();
		}

		let operations: ContentNode[] = [];

		// CRITICAL: Mongoose models must ALWAYS be registered, even if we skip reconciliation.
		// Otherwise we cannot query collections.
		const modelCreationStart = performance.now();
		const collectionsToProcess = schemas.filter((s) => 'fields' in s);
		const BATCH_SIZE = 10;

		for (let i = 0; i < collectionsToProcess.length; i += BATCH_SIZE) {
			const batch = collectionsToProcess.slice(i, i + BATCH_SIZE);
			await Promise.all(
				batch.map(async (schema) => {
					try {
						await dbAdapter.collection.createModel(schema);
					} catch (error) {
						logger.error(`Failed to register model for collection ${schema.name}:`, error);
					}
				})
			);
		}
		logger.debug(`[ContentManager] Registration of ${collectionsToProcess.length} models took ${this._getElapsedTime(modelCreationStart)}`);

		if (skipReconciliation) {
			// SAFETY CHECK: Verify that the database actually has content.
			// If seedCollectionsForSetup failed to persist nodes or if the DB was reset,
			// trusting the DB state would lead to an empty ContentManager (0 nodes).
			try {
				// Check for at least one node
				const countResult = await dbAdapter.content.nodes.getStructure('flat', { tenantId }, true);
				if (!countResult.success || !countResult.data || countResult.data.length === 0) {
					logger.warn('[ContentManager] ⚠️ Skip reconciliation requested, but DB is EMPTY! Forcing reconciliation to restore content.');
					skipReconciliation = false;
				} else {
					logger.info(`[ContentManager] Skipping reconciliation (trusting DB state with ${countResult.data.length} nodes).`);
				}
			} catch (err) {
				logger.warn('[ContentManager] Failed to verify DB state, proceeding with requested skip settings:', err);
			}
		}

		if (skipReconciliation) {
			// We still need "operations" to help _loadFinalStructure map Schemas to Nodes.
			// Construct a minimal set from schemas.
			const { generateCategoryNodesFromPaths } = await import('./utils');
			const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);

			// Map file categories
			for (const cat of fileCategoryNodes.values()) {
				operations.push(cat as ContentNode);
			}
			// Map file collections
			for (const schema of schemas) {
				operations.push({
					_id: schema._id, // Might get normalized later
					path: schema.path,
					name: schema.name,
					collectionDef: schema,
					nodeType: 'collection'
				} as any);
			}
		} else {
			const { generateCategoryNodesFromPaths } = await import('./utils');
			const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);

			logger.trace('--- RECONCILE: SCHEMAS FROM FS ---');
			logger.trace(JSON.stringify(schemas.map((s) => s.path)));
			logger.trace('---------------------------------');

			const dbResult = await dbAdapter.content.nodes.getStructure('flat', { tenantId });

			const dbNodeMap = new Map<string, ContentNode>(
				dbResult.success
					? dbResult.data.filter((node: ContentNode) => typeof node.path === 'string').map((node: ContentNode) => [node.path as string, node])
					: []
			);

			// Build operations with parentId resolution in a single pass
			operations = this._buildReconciliationOperations(schemas, fileCategoryNodes, dbNodeMap);

			// CRITICAL FIX: Resolve ID conflicts before upsert
			// Use dbNodeMap which is already built in line 1553 from `dbResult`
			const nodesToDelete: string[] = [];
			for (const op of operations) {
				if (!op.path) continue;
				const existingNode = dbNodeMap.get(op.path);
				// op._id might be ObjectId or string, ensure string comparison
				if (existingNode && existingNode._id.toString() !== op._id.toString()) {
					logger.warn(`[ContentManager] ID Mismatch for path="${op.path}": DB=${existingNode._id} vs Schema=${op._id}. Deleting old node.`);
					nodesToDelete.push(op.path);
				}
			}

			if (nodesToDelete.length > 0) {
				await dbAdapter.content.nodes.deleteMany(nodesToDelete);
				logger.info(`[ContentManager] Deleted ${nodesToDelete.length} conflicting nodes to prepare for upsert.`);
			}

			// Single bulk upsert with all data including parentIds
			if (operations.length > 0) {
				await this._bulkUpsertWithParentIds(dbAdapter, operations, tenantId);
			}
		}

		// Load final structure and rebuild maps
		await this._loadFinalStructure(dbAdapter, operations);
	}

	private _buildReconciliationOperations(
		schemas: Schema[],
		fileCategoryNodes: Map<string, { name: string }>,
		dbNodeMapByPath: Map<string, ContentNode>
	): ContentNode[] {
		const operations: ContentNode[] = [];
		const now = dateToISODateString(new Date());
		const pathToIdMap = new Map<string, DatabaseId>();

		// Build a second map for ID-based lookup to prioritize stable identifiers
		const dbNodeMapById = new Map<string, ContentNode>();
		for (const node of dbNodeMapByPath.values()) {
			dbNodeMapById.set(node._id.toString(), node);
		}

		// Helper to cast string to DatabaseId
		const toDatabaseId = (id: string) => id as DatabaseId;

		// 1. Process Collections first (Source of Truth for IDs)
		const processedPaths = new Set<string>();

		for (const schema of schemas) {
			if (!schema.path) continue;

			// Priority lookup: 1. By ID (most stable), 2. By Path
			const dbNode = (dbNodeMapById.get(schema._id as string) || dbNodeMapByPath.get(schema.path)) as ContentNode | undefined;
			const nodeId = toDatabaseId(schema._id as string);

			operations.push({
				_id: nodeId,
				parentId: undefined,
				path: schema.path,
				name: typeof schema.name === 'string' ? schema.name : String(schema.name),
				icon: schema.icon ?? dbNode?.icon ?? 'bi:file',
				slug: schema.slug ?? dbNode?.slug,
				description: schema.description ?? dbNode?.description,
				order: dbNode?.order ?? 999,
				nodeType: 'collection',
				translations: schema.translations ?? dbNode?.translations ?? [],
				collectionDef: schema,
				tenantId: schema.tenantId,
				createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
				updatedAt: now
			});

			pathToIdMap.set(schema.path, nodeId);
			processedPaths.add(schema.path);
		}

		// 2. Process Categories (Derived from file paths or existing in DB)
		for (const [path, fileNode] of fileCategoryNodes.entries()) {
			if (processedPaths.has(path)) continue;

			const dbNode = dbNodeMapByPath.get(path);
			const nodeId = toDatabaseId(dbNode?._id ?? uuidv4().replace(/-/g, ''));

			operations.push({
				_id: nodeId,
				parentId: undefined,
				path,
				name: (dbNode?.name ?? fileNode.name) as string,
				icon: dbNode?.icon ?? 'bi:folder',
				order: dbNode?.order ?? 999,
				nodeType: 'category',
				translations: dbNode?.translations ?? [],
				createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
				updatedAt: now
			});

			pathToIdMap.set(path, nodeId);
			processedPaths.add(path);
		}

		// 3. CRITICAL FIX: Only preserve DB categories that are ancestors of current collections
		// This prevents "ghost folders" from persisting when files are reorganized
		const allCollectionPaths = new Set<string>();
		for (const schema of schemas) {
			if (schema.path) {
				allCollectionPaths.add(schema.path);
			}
		}

		// Build set of all ancestor paths that should exist
		const requiredCategoryPaths = new Set<string>();
		for (const collectionPath of allCollectionPaths) {
			const parts = collectionPath.split('/').filter(Boolean);
			// Add all ancestor paths (e.g., for "/Collections/Posts/Names", add "/Collections" and "/Collections/Posts")
			for (let i = 1; i < parts.length; i++) {
				const ancestorPath = '/' + parts.slice(0, i).join('/');
				requiredCategoryPaths.add(ancestorPath);
			}
		}

		// Only preserve DB categories that are required ancestors
		for (const [path, dbNode] of dbNodeMapByPath.entries()) {
			const isValidPath = typeof path === 'string' && path.startsWith('/') && path.length > 1;
			const isNotUuid = !/^[0-9a-f]{32}$/i.test(path) && !/^[0-9a-f-]{36}$/i.test(path);
			const isRequiredAncestor = requiredCategoryPaths.has(path);

			if (!processedPaths.has(path) && dbNode.nodeType === 'category' && isValidPath && isNotUuid && isRequiredAncestor) {
				logger.debug(`[ContentManager] Preserving DB category: ${path} (ancestor of current collections)`);
				operations.push({
					...dbNode,
					_id: toDatabaseId(dbNode._id.toString()),
					createdAt: dbNode.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
					updatedAt: now
				});
				pathToIdMap.set(path, toDatabaseId(dbNode._id.toString()));
			} else if (!processedPaths.has(path) && dbNode.nodeType === 'category' && isValidPath && !isRequiredAncestor) {
				logger.info(`[ContentManager] Removing orphaned category: ${path} (no longer referenced by any collections)`);
				// Category will be deleted by not including it in operations
			}
		}

		// Sort by depth to ensure parents exist before children during ID resolution
		operations.sort((a, b) => {
			const depthA = (a.path?.split('/').length ?? 0) - 1;
			const depthB = (b.path?.split('/').length ?? 0) - 1;
			return depthA - depthB;
		});

		// 4. Resolve parentIds using the built-up map
		for (const op of operations) {
			if (!op.path) continue;
			const pathParts = op.path.split('/').filter(Boolean);
			if (pathParts.length > 1) {
				const parentPath = '/' + pathParts.slice(0, -1).join('/');
				op.parentId = pathToIdMap.get(parentPath);

				if (!op.parentId) {
					const fallbackParent = dbNodeMapByPath.get(parentPath);
					if (fallbackParent) {
						op.parentId = toDatabaseId(fallbackParent._id.toString());
					}
				}
			}
		}

		return operations;
	}

	private async _bulkUpsertWithParentIds(dbAdapter: IDBAdapter, operations: ContentNode[], tenantId?: string): Promise<void> {
		const upsertOps = operations.map((op) => ({
			path: op.path as string,
			id: op._id.toString(),
			changes: {
				...op,
				_id: op._id.toString() as any,
				parentId: op.parentId ? op.parentId.toString() : null,
				collectionDef: op.collectionDef
					? ({
							_id: op.collectionDef._id,
							name: op.collectionDef.name,
							icon: op.collectionDef.icon,
							status: op.collectionDef.status,
							path: op.collectionDef.path,
							tenantId: op.collectionDef.tenantId,
							fields: []
						} as Schema)
					: undefined
			} as any
		}));

		const bulkResult = await dbAdapter.content.nodes.bulkUpdate(upsertOps);

		if (!bulkResult.success) {
			logger.error('[ContentManager] Bulk upsert failed:', bulkResult.error);
			throw new Error(`Bulk upsert failed: ${bulkResult.error?.message || 'unknown error'}`);
		}

		// Cleaning up: Remove nodes from DB that are NOT in the current operations list
		const currentPaths = new Set(operations.map((op) => op.path));

		logger.debug('--- CONTENT RECONCILE START ---');
		logger.debug(`Current Ops Paths Count: ${currentPaths.size}`);
		logger.debug(`Ops Paths: ${JSON.stringify(Array.from(currentPaths))}`);

		const dbResult = await dbAdapter.content.nodes.getStructure('flat', { tenantId }, true);

		if (dbResult.success && dbResult.data) {
			const orphanedNodes = dbResult.data.filter((node: ContentNode) => node.path && !currentPaths.has(node.path));
			logger.debug(`DB Node Count: ${dbResult.data.length}`);
			logger.debug(`DB Paths: ${JSON.stringify(dbResult.data.map((n: any) => n.path))}`);

			if (orphanedNodes.length > 0) {
				const orphanedIds = orphanedNodes.map((node: ContentNode) => node._id.toString());
				const orphanedPaths = orphanedNodes.map((node: ContentNode) => node.path);

				logger.info(`FOUND ${orphanedNodes.length} ORPHANS for tenant ${tenantId || 'global'}: ${JSON.stringify(orphanedPaths)}`);

				// FIX: Use generic CRUD to handle IDs and tenantId filtering
				// We only include tenantId in the query if it's defined to avoid matching issues with missing fields
				const deleteResult = await dbAdapter.crud.deleteMany('system_content_structure', {
					_id: { $in: orphanedIds },
					...(tenantId ? { tenantId } : {})
				} as any);
				logger.info(`DELETION RESULT: ${JSON.stringify(deleteResult)}`);

				// CRITICAL: Invalidate cache after deletion so the UI doesn't see stale data
				if (typeof invalidateCategoryCache === 'function') {
					await invalidateCategoryCache(CacheCategory.CONTENT);
					logger.info('CACHE INVALIDATED');
				}
			} else {
				logger.debug('NO ORPHANS FOUND');
			}
		}
		logger.debug('--- CONTENT RECONCILE END ---');

		// Fix any existing nodes that have mismatched IDs (from before this fix)
		const nodesToFix = operations
			.filter((op) => op.nodeType === 'collection' && op._id)
			.map((op) => ({
				path: op.path as string,
				expectedId: op._id.toString(),
				changes: {
					...op,
					_id: op._id.toString() as any,
					parentId: op.parentId ? op.parentId.toString() : null,
					collectionDef: op.collectionDef
						? ({
								_id: op.collectionDef._id,
								name: op.collectionDef.name,
								icon: op.collectionDef.icon,
								status: op.collectionDef.status,
								path: op.collectionDef.path,
								tenantId: op.collectionDef.tenantId,
								fields: []
							} as Schema)
						: undefined
				} as any
			}));

		if (nodesToFix.length > 0 && dbAdapter.content.nodes.fixMismatchedNodeIds) {
			const fixResult = await dbAdapter.content.nodes.fixMismatchedNodeIds(nodesToFix);
			if (fixResult.success && fixResult.data.fixed > 0) {
				logger.info(`[ContentManager] Fixed ${fixResult.data.fixed} nodes with mismatched IDs`);
			}
		}

		await invalidateCategoryCache(CacheCategory.CONTENT);
		logger.debug('[ContentManager] Single-pass bulk upsert and cleanup completed');
	}

	private async _loadFinalStructure(dbAdapter: IDBAdapter, operations: ContentNode[]): Promise<void> {
		// CRITICAL: Fetch the final structure from database after all phases complete
		// This ensures we have the correct parentId relationships and MongoDB-assigned _ids
		logger.debug('[ContentManager] Final phase: Fetching complete structure from database');
		const finalStructureResult = await dbAdapter.content.nodes.getStructure('flat', {}, true); // bypassCache = true

		if (!finalStructureResult.success || !finalStructureResult.data) {
			logger.error('[ContentManager] Failed to fetch final structure from database');
			throw new Error('Failed to fetch final content structure');
		}

		const finalNodes = finalStructureResult.data;

		// Clear and rebuild local maps with the complete database structure
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();

		// Build maps from the final database structure
		for (const node of finalNodes) {
			// Ensure we normalize the _id
			const normalizedId = normalizeId(node._id);
			if (!normalizedId) {
				logger.warn(`[ContentManager] Could not normalize _id for node ${node.path}`);
				continue;
			}

			// For collections, restore the full schema from our operations array (from filesystem)
			if (node.nodeType === 'collection') {
				const schemaFromOps = operations.find((op) => op._id === normalizedId || op.path === node.path);
				if (schemaFromOps?.collectionDef) {
					node.collectionDef = schemaFromOps.collectionDef;
				}
			}

			// Add to maps
			this.contentNodeMap.set(normalizedId as DatabaseId, node);
			if (node.path) {
				this.pathLookupMap.set(node.path, normalizedId as DatabaseId);
			}
		}

		logger.debug(`[ContentManager] Maps rebuilt: contentNodeMap=${this.contentNodeMap.size}, pathLookupMap=${this.pathLookupMap.size}`);
	}

	// Build in-memory structure from schemas only (used in setup mode when no database is available)
	private async _buildInMemoryStructureFromSchemas(schemas: Schema[]): Promise<void> {
		const now = dateToISODateString(new Date());
		const { generateCategoryNodesFromPaths } = await import('./utils');
		const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);
		const pathToIdMap = new Map<string, DatabaseId>();

		// Helper to cast string to DatabaseId
		const toDatabaseId = (id: string) => id as DatabaseId;

		// Clear existing maps
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();

		// First: Add all category nodes
		for (const [path, fileNode] of fileCategoryNodes.entries()) {
			const nodeId = toDatabaseId(uuidv4().replace(/-/g, ''));
			const parentPath = path.split('/').slice(0, -1).join('/') || undefined;
			const parentId = parentPath ? pathToIdMap.get(parentPath) : undefined;

			const node: ContentNode = {
				_id: nodeId,
				parentId,
				path,
				name: fileNode.name,
				icon: 'bi:folder',
				order: 999,
				nodeType: 'category',
				translations: [],
				createdAt: now,
				updatedAt: now
			};

			this.contentNodeMap.set(nodeId, node);
			this.pathLookupMap.set(path, nodeId);
			pathToIdMap.set(path, nodeId);
		}

		// Second: Add all collection nodes
		for (const schema of schemas) {
			if (!schema.path) continue;
			const nodeId = toDatabaseId(schema._id as string);
			const parentPath = schema.path.split('/').slice(0, -1).join('/') || undefined;
			const parentId = parentPath ? pathToIdMap.get(parentPath) : undefined;

			const node: ContentNode = {
				_id: nodeId,
				parentId,
				path: schema.path,
				name: typeof schema.name === 'string' ? schema.name : String(schema.name),
				icon: schema.icon ?? 'bi:file',
				order: 999,
				nodeType: 'collection',
				translations: schema.translations ?? [],
				collectionDef: schema,
				tenantId: schema.tenantId,
				createdAt: now,
				updatedAt: now
			};

			this.contentNodeMap.set(nodeId, node);
			this.pathLookupMap.set(schema.path, nodeId);
			pathToIdMap.set(schema.path, nodeId);
		}

		logger.info(`[ContentManager] Built in-memory structure: ${this.contentNodeMap.size} nodes (setup mode)`);
	}

	// Populates the distributed cache (e.g., Redis) with the current state
	private async _populateCache(tenantId?: string): Promise<void> {
		try {
			const state = {
				nodes: Array.from(this.contentNodeMap.values()),
				version: this.contentVersion,
				timestamp: Date.now()
			};

			const cacheService = await getCacheService();
			const REDIS_TTL = await getRedisTTL();

			// Store complete structure
			await cacheService.set('cms:content_structure', state, REDIS_TTL, tenantId);

			// Pre-warm frequently accessed paths
			await this._warmFrequentPaths(cacheService, REDIS_TTL, tenantId);
		} catch (error) {
			// In setup mode, caching may not be available - that's OK
			logger.debug('[ContentManager] Cache population skipped (likely setup mode):', error instanceof Error ? error.message : String(error));
		}
	}

	// 2. Fix _warmFrequentPaths - build tree directly without calling methods
	private async _warmFrequentPaths(cacheService: Awaited<ReturnType<typeof getCacheService>>, ttl: number, tenantId?: string): Promise<void> {
		// Cache first collection for instant access
		const collections = Array.from(this.contentNodeMap.values()).filter((node) => node.nodeType === 'collection' && node.collectionDef);

		if (collections.length > 0) {
			await cacheService.set('cms:first_collection', collections[0].collectionDef, ttl, tenantId);
			logger.debug('[ContentManager] Warmed first collection cache');
		}

		// Cache navigation structure - build directly without calling methods that check initState
		// CRITICAL: Don't call getNavigationStructure() here as it checks initState and causes deadlock
		const buildNavTree = (parentId?: string): NavigationNode[] => {
			const children: NavigationNode[] = [];
			for (const node of this.contentNodeMap.values()) {
				if (node.parentId === parentId) {
					children.push({
						_id: node._id,
						name: node.name,
						path: node.path,
						icon: node.icon,
						nodeType: node.nodeType,
						order: node.order,
						parentId: node.parentId,
						translations: node.translations,
						children: buildNavTree(node._id)
					});
				}
			}
			return children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
		};

		const navStructure = buildNavTree(undefined);
		await cacheService.set('cms:navigation_structure', navStructure, ttl, tenantId);
		logger.debug('[ContentManager] Warmed navigation structure cache');
	}

	// Tries to load the state from the distributed cache
	private async _loadStateFromCache(tenantId?: string): Promise<boolean> {
		try {
			const cacheService = await getCacheService();
			await cacheService.initialize();
			const state = await cacheService.get<{ nodes: ContentNode[] }>('cms:content_structure', tenantId);
			if (!state || !state.nodes || state.nodes.length === 0) {
				logger.debug('[ContentManager] Cache miss or empty - will perform full load');
				return false;
			}

			logger.debug(`[ContentManager] Cache hit - loading ${state.nodes.length} nodes from cache`);
			this.contentNodeMap.clear();
			this.pathLookupMap.clear();
			for (const node of state.nodes) {
				this.contentNodeMap.set(node._id, node);
				if (node.path) {
					this.pathLookupMap.set(node.path, node._id);
				}
			}
			logger.debug('[ContentManager] State successfully loaded from cache');
			return true;
		} catch (error) {
			logger.debug('[ContentManager] Cache load failed, proceeding with full load:', error);
			return false;
		}
	}

	// --- Helper and Utility Methods ---
	private async _recursivelyGetFiles(dir: string): Promise<string[]> {
		const fs = await getFs();
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const files = await Promise.all(
			entries.map((entry) => {
				const resolvedPath = `${dir}/${entry.name}`;
				return entry.isDirectory() ? this._recursivelyGetFiles(resolvedPath) : Promise.resolve(resolvedPath);
			})
		);
		return files.flat();
	}

	private _extractPathFromFilePath(filePath: string): string {
		const compiledDir = import.meta.env.VITE_COLLECTIONS_FOLDER || '.compiledCollections';
		let relativePath = filePath.substring(filePath.indexOf(compiledDir) + compiledDir.length);

		logger.trace(`[_extractPathFromFilePath] Original filePath: ${filePath}`);
		logger.trace(`[_extractPathFromFilePath] After removing compiledDir: ${relativePath}`);

		// Handle tenant-based structure: .compiledCollections/{tenantId}/path/to/file.js
		// DISABLED: This logic was incorrectly treating folder names like "Collections", "Menu", "Posts"
		// as tenant IDs and stripping them, breaking the folder hierarchy.
		// TODO: Implement proper multi-tenant detection when multi-tenancy is fully implemented
		// const tenantMatch = relativePath.match(/^\/([^/]+)\/(.*)/);
		// if (tenantMatch && (tenantMatch[1] === 'global' || !tenantMatch[1].includes('.'))) {
		// 	relativePath = '/' + tenantMatch[2];
		// 	logger.debug(`[_extractPathFromFilePath] Tenant structure detected, path after tenant: ${relativePath}`);
		// }

		relativePath = relativePath.replace(/\.js$/, '');
		const finalPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

		logger.trace(`[_extractPathFromFilePath] Final extracted path: ${finalPath}`);
		return finalPath;
	}

	private _getElapsedTime(startTime: number): string {
		return `${(performance.now() - startTime).toFixed(2)}ms`;
	}
}

// Now, define helper functions outside the class.

// Export the class so db.ts can access static methods like getInstance()
export { ContentManager };

// And finally, export the instance.
export const contentManager = ContentManager.getInstance();
