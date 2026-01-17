import { l as logger } from './logger.server.js';
import { d as dateToISODateString } from './dateUtils.js';
import { v4 } from 'uuid';
import { C as CacheCategory } from './CacheCategory.js';
const getCacheService = async () => (await import('./CacheService.js')).cacheService;
const getRedisTTL = async () => (await import('./CacheService.js')).REDIS_TTL_S;
const invalidateCategoryCache = async (...args) => (await import('./mongoDBCacheUtils.js').then((n) => n.m)).invalidateCategoryCache(...args);
const normalizeId = (id) => id.replace(/-/g, '');
const getFs = async () => (await import('node:fs/promises')).default;
const getDbAdapter = async () => (await import('./db.js').then((n) => n.e)).dbAdapter;
class ContentManager {
	static instance;
	// State for robust initialization, preventing race conditions
	initState = 'uninitialized';
	initPromise = null;
	// --- Unified Data Structures (Single Source of Truth) ---
	/** Primary map holding the complete state. Key is the node's _id. */
	contentNodeMap = /* @__PURE__ */ new Map();
	/** Optimized lookup map to quickly find a node's ID by its path. */
	pathLookupMap = /* @__PURE__ */ new Map();
	/**
	 * Version timestamp for reactive updates.
	 * Incremented whenever content structure changes.
	 * Clients poll this version to trigger updates.
	 */
	contentVersion = Date.now();
	// --- first collection caching for instant access ---
	firstCollectionCache = null;
	FIRST_COLLECTION_CACHE_TTL = 60 * 1e3;
	// 60 seconds
	collectionCache = /* @__PURE__ */ new Map();
	COLLECTION_CACHE_TTL = 20 * 1e3;
	// 20 seconds
	metrics = {
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
	collectionDependencies = /* @__PURE__ */ new Map();
	snapshots = /* @__PURE__ */ new Map();
	performanceMetrics = {
		operations: /* @__PURE__ */ new Map()
	};
	constructor() {}
	static getInstance() {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}
	/**
	 * Health check for monitoring systems
	 */
	getHealthStatus() {
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
	getDiagnostics() {
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
	getMetrics() {
		return {
			...this.metrics,
			uptime: Date.now() - this.metrics.lastRefresh,
			cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
		};
	}
	validateStructure() {
		const errors = [];
		const warnings = [];
		for (const [id, node] of this.contentNodeMap.entries()) {
			if (node.parentId && !this.contentNodeMap.has(node.parentId)) {
				errors.push(`Node ${id} (${node.path}) has missing parent ${node.parentId}`);
			}
		}
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
	trackCacheHit(hit) {
		if (hit) {
			this.metrics.cacheHits++;
		} else {
			this.metrics.cacheMisses++;
		}
	}
	// Initializes the ContentManager, handling race conditions and loading data
	async initialize(tenantId) {
		if (this.initState === 'initialized') {
			return;
		}
		if (this.initPromise) {
			logger.debug('[ContentManager] Waiting for existing initialization to complete');
			return this.initPromise;
		}
		logger.info('[ContentManager] Starting initialization', { tenantId });
		this.initPromise = this._doInitialize(tenantId);
		try {
			await this.initPromise;
		} catch (error) {
			this.initPromise = null;
			throw error;
		}
	}
	// Core initialization logic
	async _doInitialize(tenantId) {
		const { isSetupComplete } = await import('./setupCheck.js');
		if (!isSetupComplete()) {
			logger.info('Setup not complete. ContentManager skipping initialization (SETUP MODE).');
			this.initState = 'initialized';
			this.metrics.initializationTime = 0;
			return;
		}
		this.initState = 'initializing';
		const startTime = performance.now();
		const maxRetries = 3;
		let lastError = null;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				logger.trace(`ContentManager initialization attempt ${attempt}/${maxRetries}`, { tenantId });
				if (await this._loadStateFromCache(tenantId)) {
					this.initState = 'initialized';
					this.metrics.initializationTime = performance.now() - startTime;
					logger.info(`🚀 ContentManager initialized from cache in ${this._getElapsedTime(startTime)}`);
					return;
				}
				await this._fullReload(tenantId);
				this.initState = 'initialized';
				this.metrics.initializationTime = performance.now() - startTime;
				this.metrics.lastRefresh = Date.now();
				logger.info(`📦 ContentManager fully initialized in ${this._getElapsedTime(startTime)}`);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				logger.warn(`Initialization attempt ${attempt} failed:`, lastError.message);
				if (attempt < maxRetries) {
					const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 5e3);
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
	async refresh(tenantId) {
		logger.info('Refreshing ContentManager state...');
		this.initState = 'initializing';
		this.clearFirstCollectionCache();
		this.initPromise = this._fullReload(tenantId).then(() => {
			this.initState = 'initialized';
			this.contentVersion = Date.now();
		});
		await this.initPromise;
	}
	// Returns all loaded collection schemas
	async getCollections(tenantId) {
		return this.withPerfTracking('getCollections', async () => {
			if (this.initState !== 'initialized') {
				await this.initialize(tenantId);
			}
			const collections = [];
			for (const node of this.contentNodeMap.values()) {
				if (node.nodeType === 'collection' && node.collectionDef && (!tenantId || node.tenantId === tenantId)) {
					collections.push(node.collectionDef);
				}
			}
			return collections;
		});
	}
	/**
	 * Returns the current content version timestamp.
	 * Used by the API to expose the version for client-side polling.
	 */
	getContentVersion() {
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
	async getFirstCollection(tenantId, forceRefresh = false) {
		const now = Date.now();
		if (
			!forceRefresh &&
			this.firstCollectionCache &&
			this.firstCollectionCache.tenantId === tenantId &&
			now - this.firstCollectionCache.timestamp < this.FIRST_COLLECTION_CACHE_TTL
		) {
			const cacheAge = ((now - this.firstCollectionCache.timestamp) / 1e3).toFixed(1);
			logger.debug(`⚡ First collection from cache (age: ${cacheAge}s)`);
			return this.firstCollectionCache.collection;
		}
		const startTime = performance.now();
		const collections = await this.getCollections(tenantId);
		const firstCollection = collections.length > 0 ? collections[0] : void 0;
		const fetchTime = performance.now() - startTime;
		this.firstCollectionCache = {
			collection: firstCollection,
			timestamp: now,
			tenantId
		};
		if (firstCollection) {
			logger.info(`📋 First collection loaded: ${firstCollection.name} (${firstCollection._id}) in ${fetchTime.toFixed(2)}ms`);
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
	async getFirstCollectionRedirectUrl(language = 'en', tenantId) {
		const collection = await this.getFirstCollection(tenantId);
		if (!collection || !collection._id) {
			logger.debug('Cannot build redirect URL - no collection or _id available');
			return null;
		}
		const pathOrId = collection.path || collection._id;
		const redirectUrl = `/${language}${pathOrId}`;
		logger.debug(`📍 First collection redirect URL (UUID-based): ${redirectUrl}`);
		return redirectUrl;
	}
	// Clear first collection cache (use when collections are modified)
	clearFirstCollectionCache() {
		this.firstCollectionCache = null;
		logger.debug('First collection cache cleared');
	}
	// Retrieves the entire content structure as a nested tree
	async getContentStructure() {
		if (this.initState === 'initializing') {
			logger.warn('[ContentManager] getContentStructure called during initialization, returning empty array');
			return [];
		}
		if (this.initState !== 'initialized') {
			await this.initialize();
		}
		const nodes = new Map(Array.from(this.contentNodeMap.entries()).map(([id, node]) => [id, { ...node, children: [] }]));
		const tree = [];
		for (const node of nodes.values()) {
			if (node.parentId && nodes.has(node.parentId)) {
				nodes.get(node.parentId).children.push(node);
			} else {
				tree.push(node);
			}
		}
		return tree;
	}
	/**
	 * Get navigation structure with progressive loading
	 * Loads only visible nodes first, defers children until expanded
	 */
	async getNavigationStructureProgressive(options) {
		if (this.initState !== 'initialized') {
			await this.initialize(options?.tenantId);
		}
		const maxDepth = options?.maxDepth ?? 1;
		const expandedIds = options?.expandedIds ?? /* @__PURE__ */ new Set();
		const buildTree = (parentId, currentDepth) => {
			const children = [];
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
						children: shouldLoadChildren ? buildTree(node._id, nodeDepth) : void 0,
						hasChildren: hasChildren && !shouldLoadChildren
					});
				}
			}
			return children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
		};
		return buildTree(void 0, 0);
	}
	/**
	 * Get children of a specific node (for lazy loading in TreeView)
	 */
	getNodeChildren(nodeId, tenantId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const children = [];
		for (const node of this.contentNodeMap.values()) {
			if (node.parentId === nodeId && (!tenantId || node.tenantId === tenantId)) {
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
	async getNavigationStructure() {
		if (this.initState === 'initializing') {
			logger.warn('[ContentManager] getNavigationStructure called during initialization, returning empty array');
			return [];
		}
		if (this.initState !== 'initialized') {
			await this.initialize();
		}
		const fullStructure = await this.getContentStructure();
		const stripToNavigation = (nodes) => {
			return nodes.map((node) => ({
				_id: node._id,
				name: node.name,
				path: node.path,
				icon: node.icon,
				nodeType: node.nodeType,
				order: node.order,
				parentId: node.parentId,
				translations: node.translations,
				// Include translations for client-side localization
				children: node.children && node.children.length > 0 ? stripToNavigation(node.children) : void 0
			}));
		};
		const result = stripToNavigation(fullStructure);
		return result;
	}
	/**
	 * Preload adjacent collections in navigation tree
	 * Called by TreeView on node expand/hover
	 */
	async preloadAdjacentCollections(nodeId, depth = 1) {
		if (this.initState !== 'initialized' || depth <= 0) return;
		const node = this.contentNodeMap.get(nodeId);
		if (!node) return;
		if (node.parentId) {
			for (const sibling of this.contentNodeMap.values()) {
				if (sibling.parentId === node.parentId && sibling._id !== nodeId) {
					await this.getCollection(sibling._id);
				}
			}
		}
		for (const child of this.contentNodeMap.values()) {
			if (child.parentId === nodeId) {
				await this.getCollection(child._id);
				if (depth > 1) {
					await this.preloadAdjacentCollections(child._id, depth - 1);
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
	async getContentStructureFromDatabase(format = 'nested') {
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
	 * @returns Schema or undefined if not found
	 */
	async getCollection(identifier, tenantId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const cacheKey = `${identifier}:${tenantId ?? 'default'}`;
		const cached = this.collectionCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.COLLECTION_CACHE_TTL) {
			this.trackCacheHit(true);
			return cached.schema;
		}
		this.trackCacheHit(false);
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
		if (node?.collectionDef && tenantId && node.tenantId !== tenantId) {
			return void 0;
		}
		const result = node?.collectionDef ?? void 0;
		this.collectionCache.set(cacheKey, { schema: result, timestamp: Date.now() });
		return result;
	}
	/**
	 * Alias for getCollection for backward compatibility
	 */
	async getCollectionById(collectionId, tenantId) {
		return await this.getCollection(collectionId, tenantId);
	}
	/**
	 * Get collections with pagination support for memory efficiency
	 * @param tenantId - Optional tenant ID
	 * @param page - Page number (1-based)
	 * @param pageSize - Number of collections per page
	 * @returns Paginated collections with metadata
	 */
	async getCollectionsPaginated(tenantId, page = 1, pageSize = 20) {
		if (this.initState !== 'initialized') {
			await this.initialize(tenantId);
		}
		const allCollections = [];
		for (const node of this.contentNodeMap.values()) {
			if (node.nodeType === 'collection' && node.collectionDef && (!tenantId || node.tenantId === tenantId)) {
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
	async getCollectionsBulk(identifiers, tenantId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const results = /* @__PURE__ */ new Map();
		for (const identifier of identifiers) {
			const collection = await this.getCollection(identifier, tenantId);
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
	async searchCollections(query, filters) {
		if (this.initState !== 'initialized') {
			await this.initialize(filters?.tenantId);
		}
		const normalizedQuery = query.toLowerCase();
		const results = [];
		for (const node of this.contentNodeMap.values()) {
			if (filters?.nodeType && node.nodeType !== filters.nodeType) {
				continue;
			}
			if (node.nodeType !== 'collection' || !node.collectionDef) {
				continue;
			}
			if (filters?.tenantId && node.tenantId !== filters.tenantId) {
				continue;
			}
			const collection = node.collectionDef;
			if (filters?.status && collection.status !== filters.status) {
				continue;
			}
			if (filters?.hasIcon !== void 0) {
				const hasIcon = !!collection.icon;
				if (hasIcon !== filters.hasIcon) {
					continue;
				}
			}
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
	async invalidateSpecificCaches(paths) {
		for (const path of paths) {
			const nodeId = this.pathLookupMap.get(path);
			if (nodeId) {
				const node = this.contentNodeMap.get(nodeId);
				if (node?.collectionDef?._id) {
					const cacheKeys = [`${node.collectionDef._id}:default`, `${path}:default`];
					for (const key of cacheKeys) {
						this.collectionCache.delete(key);
					}
				}
			}
		}
		this.contentVersion = Date.now();
		logger.debug(`Invalidated cache for ${paths.length} paths`);
	}
	/**
	 * Pre-warm cache for visible entries in EntryList
	 * Called by EntryList's batch preload during idle time
	 */
	async warmEntriesCache(collectionId, entryIds, tenantId) {
		const collection = await this.getCollection(collectionId, tenantId);
		if (!collection) return;
		const cacheKey = `collection:${collectionId}:metadata`;
		if (!this.collectionCache.has(cacheKey)) {
			this.collectionCache.set(cacheKey, {
				schema: {
					_id: collection._id,
					name: collection.name,
					icon: collection.icon,
					fields: collection.fields?.map((f) => ({
						db_fieldName: f.db_fieldName,
						label: f.label,
						type: f.type,
						translated: f.translated
					}))
				},
				timestamp: Date.now()
			});
		}
		logger.debug(`[ContentManager] Warmed cache for ${entryIds.length} entries in collection ${collectionId}`);
	}
	/**
	 * Register that collectionA depends on collectionB
	 * Useful for invalidation cascades
	 */
	registerDependency(collectionId, dependsOn) {
		if (!this.collectionDependencies.has(collectionId)) {
			this.collectionDependencies.set(collectionId, /* @__PURE__ */ new Set());
		}
		this.collectionDependencies.get(collectionId).add(dependsOn);
		logger.debug(`Registered dependency: ${collectionId} -> ${dependsOn}`);
	}
	/**
	 * Get all collections that depend on a given collection
	 */
	getDependentCollections(collectionId) {
		const dependents = [];
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
	async invalidateWithDependents(collectionId) {
		const toInvalidate = [collectionId, ...this.getDependentCollections(collectionId)];
		logger.debug(`Invalidating ${collectionId} and ${toInvalidate.length - 1} dependents`);
		for (const id of toInvalidate) {
			for (const [key] of this.collectionCache.entries()) {
				if (key.startsWith(`${id}:`)) {
					this.collectionCache.delete(key);
				}
			}
		}
		this.contentVersion = Date.now();
	}
	/**
	 * Get lightweight collection stats for EntryList header
	 * Avoids loading full collection definition when only metadata is needed
	 */
	async getCollectionStats(identifier, tenantId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const cacheKey = `stats:${identifier}:${tenantId ?? 'default'}`;
		const cached = this.collectionCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.COLLECTION_CACHE_TTL) {
			return cached.schema;
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
		if (!node?.collectionDef || (tenantId && node.tenantId !== tenantId)) {
			return null;
		}
		const stats = {
			_id: node.collectionDef._id,
			name: node.collectionDef.name,
			icon: node.collectionDef.icon,
			path: node.collectionDef.path,
			fieldCount: node.collectionDef.fields?.length ?? 0,
			hasRevisions: node.collectionDef.revision === true,
			hasLivePreview: node.collectionDef.livePreview === true,
			status: node.collectionDef.status
		};
		this.collectionCache.set(cacheKey, {
			schema: stats,
			timestamp: Date.now()
		});
		return stats;
	}
	async updateCollectionMetadata(collectionId, metadata, tenantId) {
		const collection = await this.getCollectionById(collectionId, tenantId);
		if (!collection) {
			throw new Error(`Collection ${collectionId} not found`);
		}
		if (metadata.name) collection.name = metadata.name;
		if (metadata.icon) collection.icon = metadata.icon;
		this.collectionCache.delete(collectionId);
		await this.invalidateWithDependents(collectionId);
		logger.info(`Updated metadata for collection ${collectionId}`);
	}
	async getCollectionMetadata(identifier, tenantId) {
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
		if (!node?.collectionDef || (tenantId && node.tenantId !== tenantId)) {
			return null;
		}
		const collection = node.collectionDef;
		return {
			_id: collection._id,
			name: collection.name,
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
	async getFieldMetadataWithTranslations(collectionId, availableLanguages, tenantId) {
		const collection = await this.getCollection(collectionId, tenantId);
		if (!collection?.fields) return [];
		return collection.fields.map((field) => {
			const translationStatus = {};
			if (field.translated) {
				for (const lang of availableLanguages) {
					translationStatus[lang] = false;
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
	createSnapshot(snapshotId) {
		this.snapshots.set(snapshotId, {
			nodes: new Map(this.contentNodeMap),
			paths: new Map(this.pathLookupMap),
			timestamp: Date.now()
		});
		logger.info(`Created snapshot: ${snapshotId}`);
		if (this.snapshots.size > 5) {
			const oldestKey = Array.from(this.snapshots.keys())[0];
			this.snapshots.delete(oldestKey);
		}
	}
	/**
	 * Rollback to a previous snapshot
	 * @param snapshotId - Snapshot to restore
	 */
	async rollbackToSnapshot(snapshotId) {
		const snapshot = this.snapshots.get(snapshotId);
		if (!snapshot) {
			logger.warn(`Snapshot not found: ${snapshotId}`);
			return false;
		}
		this.contentNodeMap = new Map(snapshot.nodes);
		this.pathLookupMap = new Map(snapshot.paths);
		this.contentVersion = Date.now();
		this.collectionCache.clear();
		this.firstCollectionCache = null;
		logger.info(`Rolled back to snapshot: ${snapshotId}`);
		return true;
	}
	/**
	 * List available snapshots
	 */
	listSnapshots() {
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
	getDescendants(nodeId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const descendants = [];
		const queue = [nodeId];
		const visited = /* @__PURE__ */ new Set();
		while (queue.length > 0) {
			const currentId = queue.shift();
			if (visited.has(currentId)) continue;
			visited.add(currentId);
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
	getNodePath(nodeId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const path = [];
		let currentNode = this.contentNodeMap.get(nodeId);
		while (currentNode) {
			path.unshift(currentNode);
			currentNode = currentNode.parentId ? this.contentNodeMap.get(currentNode.parentId) : void 0;
		}
		return path;
	}
	/**
	 * Resolve multiple paths in a single operation
	 * Optimizes TreeView node lookup when building navigation
	 */
	resolvePathsBulk(paths) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const results = /* @__PURE__ */ new Map();
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
	getBreadcrumb(path) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const segments = path.split('/').filter(Boolean);
		const breadcrumb = [];
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
	async moveNodeWithDescendants(nodeId, newParentId) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const node = this.contentNodeMap.get(nodeId);
		if (!node) {
			throw new Error(`Node not found: ${nodeId}`);
		}
		if (newParentId) {
			const newParentPath = this.getNodePath(newParentId);
			if (newParentPath.some((n) => n._id === nodeId)) {
				throw new Error('Cannot move node to its own descendant');
			}
		}
		node.parentId = newParentId;
		node.updatedAt = dateToISODateString(/* @__PURE__ */ new Date());
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}
		await dbAdapter.content.nodes.bulkUpdate([
			{
				path: node.path,
				changes: { parentId: newParentId, updatedAt: node.updatedAt }
			}
		]);
		this.contentVersion = Date.now();
		logger.info(`Moved node ${nodeId} to parent ${newParentId || 'root'}`);
	}
	/**
	 * Track operation performance
	 */
	trackOperation(operation, durationMs) {
		if (!this.performanceMetrics.operations.has(operation)) {
			this.performanceMetrics.operations.set(operation, {
				count: 0,
				totalTime: 0,
				avgTime: 0
			});
		}
		const metric = this.performanceMetrics.operations.get(operation);
		metric.count++;
		metric.totalTime += durationMs;
		metric.avgTime = metric.totalTime / metric.count;
	}
	/**
	 * Wrapper for performance tracking
	 */
	async withPerfTracking(operation, fn) {
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
	getPerformanceMetrics() {
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
	async upsertContentNodes(operations) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}
		logger.debug('[ContentManager] upsertContentNodes - processing operations:', operations.length);
		const bulkUpdates = [];
		const bulkCreates = [];
		for (const operation of operations) {
			const { type, node } = operation;
			switch (type) {
				case 'create': {
					if (!node.path) {
						logger.warn('[ContentManager] Node missing path, skipping:', node);
						continue;
					}
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
					const { _id, createdAt, ...changeableFields } = node;
					bulkUpdates.push({
						path: node.path,
						changes: { ...changeableFields, updatedAt: dateToISODateString(/* @__PURE__ */ new Date()) }
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
	async reorderContentNodes(operations) {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			throw new Error('Database adapter is not available');
		}
		const reorderItems = operations.map((op) => {
			const { node } = op;
			return {
				id: node._id,
				parentId: typeof node.parentId === 'string' ? node.parentId : node.parentId?.toString() || null,
				order: node.order || 0,
				path: node.path || ''
				// Path should be recalculated and correct before reaching here
			};
		});
		await dbAdapter.content.nodes.reorderStructure(reorderItems);
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
	async _fullReload(tenantId) {
		const schemas = await this._scanAndProcessFiles();
		await this._reconcileAndBuildStructure(schemas);
		await this._populateCache(tenantId);
	}
	// Scans the compiledCollections directory and processes each file into a Schema object
	async _scanAndProcessFiles() {
		const compiledDirectoryPath = 'compiledCollections';
		try {
			const fs = await getFs();
			await fs.access(compiledDirectoryPath);
		} catch {
			logger.trace(`Compiled collections directory not found: ${compiledDirectoryPath}`);
			return [];
		}
		const files = await this._recursivelyGetFiles(compiledDirectoryPath);
		const jsFiles = files.filter((file) => file.endsWith('.js'));
		const BATCH_SIZE = 10;
		const schemas = [];
		for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
			const batch = jsFiles.slice(i, i + BATCH_SIZE);
			const batchSchemas = await Promise.all(batch.map((filePath) => this._processSchemaFile(filePath)));
			schemas.push(...batchSchemas.filter((s) => !!s));
			logger.trace(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(jsFiles.length / BATCH_SIZE)}`);
		}
		return schemas;
	}
	async _processSchemaFile(filePath) {
		try {
			const fs = await getFs();
			const content = await fs.readFile(filePath, 'utf-8');
			const { processModule } = await import('./utils4.js');
			const moduleData = await processModule(content);
			if (!moduleData?.schema) return null;
			const schema = moduleData.schema;
			const path = this._extractPathFromFilePath(filePath);
			const fileName = filePath.split('/').pop()?.replace('.js', '') ?? 'unknown';
			return {
				...schema,
				_id: schema._id,
				path,
				name: schema.name || fileName,
				tenantId: schema.tenantId ?? void 0
			};
		} catch (error) {
			logger.warn(`Could not process collection file: ${filePath}`, error);
			return null;
		}
	}
	// Synchronizes schemas from files with the database and builds the in-memory maps
	async _reconcileAndBuildStructure(schemas) {
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) {
			logger.info('[ContentManager] No database available (setup mode) - building structure from files only');
			await this._buildInMemoryStructureFromSchemas(schemas);
			return;
		}
		const { generateCategoryNodesFromPaths } = await import('./utils4.js');
		const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);
		const dbResult = await dbAdapter.content.nodes.getStructure('flat');
		const dbNodeMap = new Map(dbResult.success ? dbResult.data.filter((node) => typeof node.path === 'string').map((node) => [node.path, node]) : []);
		const operations = this._buildReconciliationOperations(schemas, fileCategoryNodes, dbNodeMap);
		for (const schema of schemas) {
			try {
				if ('fields' in schema) {
					await dbAdapter.collection.createModel(schema);
				}
			} catch (error) {
				logger.error(`Failed to register model for collection ${schema.name}:`, error);
			}
		}
		if (operations.length > 0) {
			await this._bulkUpsertWithParentIds(dbAdapter, operations);
		}
		await this._loadFinalStructure(dbAdapter, operations);
	}
	_buildReconciliationOperations(schemas, fileCategoryNodes, dbNodeMap) {
		const operations = [];
		const now = dateToISODateString(/* @__PURE__ */ new Date());
		const pathToIdMap = /* @__PURE__ */ new Map();
		const toDatabaseId = (id) => id;
		for (const [path, fileNode] of fileCategoryNodes.entries()) {
			const dbNode = dbNodeMap.get(path);
			const nodeId = toDatabaseId(dbNode?._id ?? v4().replace(/-/g, ''));
			operations.push({
				_id: nodeId,
				parentId: void 0,
				path,
				name: dbNode?.name ?? fileNode.name,
				icon: dbNode?.icon ?? 'bi:folder',
				order: dbNode?.order ?? 999,
				nodeType: 'category',
				translations: dbNode?.translations ?? [],
				createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
				updatedAt: now
			});
			pathToIdMap.set(path, nodeId);
		}
		for (const schema of schemas) {
			if (!schema.path) continue;
			const dbNode = dbNodeMap.get(schema.path);
			const nodeId = toDatabaseId(schema._id);
			operations.push({
				_id: nodeId,
				parentId: void 0,
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
		}
		operations.sort((a, b) => {
			const depthA = (a.path?.split('/').length ?? 0) - 1;
			const depthB = (b.path?.split('/').length ?? 0) - 1;
			return depthA - depthB;
		});
		for (const op of operations) {
			if (!op.path) continue;
			const pathParts = op.path.split('/').filter(Boolean);
			if (pathParts.length > 1) {
				const parentPath = '/' + pathParts.slice(0, -1).join('/');
				op.parentId = pathToIdMap.get(parentPath) ?? dbNodeMap.get(parentPath)?._id;
			}
		}
		return operations;
	}
	async _bulkUpsertWithParentIds(dbAdapter, operations) {
		const upsertOps = operations.map((op) => ({
			path: op.path,
			changes: {
				...op,
				collectionDef: op.collectionDef
					? {
							_id: op.collectionDef._id,
							name: op.collectionDef.name,
							icon: op.collectionDef.icon,
							status: op.collectionDef.status,
							path: op.collectionDef.path,
							tenantId: op.collectionDef.tenantId,
							fields: []
						}
					: void 0
			}
		}));
		await dbAdapter.content.nodes.bulkUpdate(upsertOps);
		const nodesToFix = operations
			.filter((op) => op.nodeType === 'collection' && op._id)
			.map((op) => ({
				path: op.path,
				expectedId: op._id,
				changes: {
					...op,
					collectionDef: op.collectionDef
						? {
								_id: op.collectionDef._id,
								name: op.collectionDef.name,
								icon: op.collectionDef.icon,
								status: op.collectionDef.status,
								path: op.collectionDef.path,
								tenantId: op.collectionDef.tenantId,
								fields: []
							}
						: void 0
				}
			}));
		if (nodesToFix.length > 0 && dbAdapter.content.nodes.fixMismatchedNodeIds) {
			const fixResult = await dbAdapter.content.nodes.fixMismatchedNodeIds(nodesToFix);
			if (fixResult.fixed > 0) {
				logger.info(`[ContentManager] Fixed ${fixResult.fixed} nodes with mismatched IDs`);
			}
		}
		await invalidateCategoryCache(CacheCategory.CONTENT);
		logger.debug('[ContentManager] Single-pass bulk upsert completed');
	}
	async _loadFinalStructure(dbAdapter, operations) {
		logger.debug('[ContentManager] Final phase: Fetching complete structure from database');
		const finalStructureResult = await dbAdapter.content.nodes.getStructure('flat', {}, true);
		if (!finalStructureResult.success || !finalStructureResult.data) {
			logger.error('[ContentManager] Failed to fetch final structure from database');
			throw new Error('Failed to fetch final content structure');
		}
		const finalNodes = finalStructureResult.data;
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();
		for (const node of finalNodes) {
			const normalizedId = normalizeId(node._id);
			if (!normalizedId) {
				logger.warn(`[ContentManager] Could not normalize _id for node ${node.path}`);
				continue;
			}
			if (node.nodeType === 'collection') {
				const schemaFromOps = operations.find((op) => op._id === normalizedId || op.path === node.path);
				if (schemaFromOps?.collectionDef) {
					node.collectionDef = schemaFromOps.collectionDef;
				}
			}
			this.contentNodeMap.set(normalizedId, node);
			if (node.path) {
				this.pathLookupMap.set(node.path, normalizedId);
			}
		}
		logger.debug(`[ContentManager] Maps rebuilt: contentNodeMap=${this.contentNodeMap.size}, pathLookupMap=${this.pathLookupMap.size}`);
	}
	// Build in-memory structure from schemas only (used in setup mode when no database is available)
	async _buildInMemoryStructureFromSchemas(schemas) {
		const now = dateToISODateString(/* @__PURE__ */ new Date());
		const { generateCategoryNodesFromPaths } = await import('./utils4.js');
		const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);
		const pathToIdMap = /* @__PURE__ */ new Map();
		const toDatabaseId = (id) => id;
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();
		for (const [path, fileNode] of fileCategoryNodes.entries()) {
			const nodeId = toDatabaseId(v4().replace(/-/g, ''));
			const parentPath = path.split('/').slice(0, -1).join('/') || void 0;
			const parentId = parentPath ? pathToIdMap.get(parentPath) : void 0;
			const node = {
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
		for (const schema of schemas) {
			if (!schema.path) continue;
			const nodeId = toDatabaseId(schema._id);
			const parentPath = schema.path.split('/').slice(0, -1).join('/') || void 0;
			const parentId = parentPath ? pathToIdMap.get(parentPath) : void 0;
			const node = {
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
	async _populateCache(tenantId) {
		try {
			const state = {
				nodes: Array.from(this.contentNodeMap.values()),
				version: this.contentVersion,
				timestamp: Date.now()
			};
			const cacheService = await getCacheService();
			const REDIS_TTL = await getRedisTTL();
			await cacheService.set('cms:content_structure', state, REDIS_TTL, tenantId);
			await this._warmFrequentPaths(cacheService, REDIS_TTL, tenantId);
		} catch (error) {
			logger.debug('[ContentManager] Cache population skipped (likely setup mode):', error instanceof Error ? error.message : String(error));
		}
	}
	// 2. Fix _warmFrequentPaths - build tree directly without calling methods
	async _warmFrequentPaths(cacheService, ttl, tenantId) {
		const collections = Array.from(this.contentNodeMap.values()).filter((node) => node.nodeType === 'collection' && node.collectionDef);
		if (collections.length > 0) {
			await cacheService.set('cms:first_collection', collections[0].collectionDef, ttl, tenantId);
			logger.debug('[ContentManager] Warmed first collection cache');
		}
		const buildNavTree = (parentId) => {
			const children = [];
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
		const navStructure = buildNavTree(void 0);
		await cacheService.set('cms:navigation_structure', navStructure, ttl, tenantId);
		logger.debug('[ContentManager] Warmed navigation structure cache');
	}
	// Tries to load the state from the distributed cache
	async _loadStateFromCache(tenantId) {
		try {
			const cacheService = await getCacheService();
			await cacheService.initialize();
			const state = await cacheService.get('cms:content_structure', tenantId);
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
	async _recursivelyGetFiles(dir) {
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
	_extractPathFromFilePath(filePath) {
		const compiledDir = 'compiledCollections';
		let relativePath = filePath.substring(filePath.indexOf(compiledDir) + compiledDir.length);
		relativePath = relativePath.replace(/\.js$/, '');
		return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
	}
	_getElapsedTime(startTime) {
		return `${(performance.now() - startTime).toFixed(2)}ms`;
	}
}
const contentManager = ContentManager.getInstance();
export { ContentManager, contentManager };
//# sourceMappingURL=ContentManager.js.map
