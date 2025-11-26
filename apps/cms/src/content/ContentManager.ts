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
import { logger } from '@utils/logger.server';
import { dateToISODateString } from '@utils/dateUtils';
import { v4 as uuidv4 } from 'uuid';
import { generateCategoryNodesFromPaths, processModule } from './utils';
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

class ContentManager {
	private static instance: ContentManager;

	// State for robust initialization, preventing race conditions
	private initState: 'uninitialized' | 'initializing' | 'initialized' | 'error' = 'uninitialized';
	private initPromise: Promise<void> | null = null;

	// --- Unified Data Structures (Single Source of Truth) ---
	// Primary map holding the complete state. Key is the node's _id.
	private contentNodeMap: Map<string, ContentNode> = new Map();
	// Optimized lookup map to quickly find a node's ID by its path.
	private pathLookupMap: Map<string, string> = new Map();

	// --- first collection caching for instant access ---
	private firstCollectionCache: {
		collection: Schema | null;
		timestamp: number;
		tenantId?: string;
	} | null = null;
	private readonly FIRST_COLLECTION_CACHE_TTL = 60 * 1000; // 60 seconds

	private constructor() {}

	public static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}

	// Initializes the ContentManager, handling race conditions and loading data
	public async initialize(tenantId?: string): Promise<void> {
		if (this.initState === 'initialized') {
			return;
		}
		// If another request is already initializing, wait for it to complete.
		if (this.initPromise) {
			return this.initPromise;
		}
		// Start initialization and store the promise.
		this.initPromise = this._doInitialize(tenantId);
		return this.initPromise;
	}

	// Core initialization logic
	private async _doInitialize(tenantId?: string): Promise<void> {
		this.initState = 'initializing';
		const startTime = performance.now();
		logger.trace('Initializing ContentManager...', { tenantId });

		try {
			// 1. Attempt to load from a high-speed cache (e.g., Redis).
			if (await this._loadStateFromCache(tenantId)) {
				this.initState = 'initialized';
				logger.info(`🚀 ContentManager initialized from cache in ${this._getElapsedTime(startTime)}`);
				return;
			}

			// 2. If cache fails, perform a full load from source (files and DB).
			await this._fullReload(tenantId);

			this.initState = 'initialized';
			logger.info(`📦 ContentManager fully initialized in ${this._getElapsedTime(startTime)}`);
		} catch (error) {
			this.initState = 'error';
			if (error instanceof Error) {
				logger.error('ContentManager initialization failed:', error.message);
				if (error.stack) {
					logger.error(error.stack);
				}
			} else {
				logger.error('ContentManager initialization failed:', error);
			}
			this.initPromise = null; // Allow retry on next call
			throw error;
		}
	}

	// Forces a full reload of all collections and content structure
	public async refresh(tenantId?: string): Promise<void> {
		logger.info('Refreshing ContentManager state...');
		this.initState = 'initializing';
		this.clearFirstCollectionCache(); // Clear cache on refresh
		this.initPromise = this._fullReload(tenantId).then(() => {
			this.initState = 'initialized';
		});
		await this.initPromise;
	}

	// Returns all loaded collection schemas
	public async getCollections(tenantId?: string): Promise<Schema[]> {
		// Auto-initialize on first access (lazy loading)
		if (this.initState !== 'initialized') {
			await this.initialize(tenantId);
		}
		const collections: Schema[] = [];
		for (const node of this.contentNodeMap.values()) {
			if (node.nodeType === 'collection' && node.collectionDef && (!tenantId || node.tenantId === tenantId)) {
				collections.push(node.collectionDef);
			}
		}
		return collections;
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
	 * Returns a lightweight navigation structure without full collection definitions.
	 * This is suitable for serialization to the client (e.g., for navigation menus and TreeView).
	 * Includes only essential metadata needed for display and ordering.
	 */
	public async getNavigationStructure(): Promise<
		Array<{
			_id: string;
			name: string;
			path?: string;
			icon?: string;
			nodeType: 'category' | 'collection';
			order?: number;
			status?: string; // For category badges
			lastModified?: Date; // For sorting
			parentId?: string; // For tree reconstruction
			translations?: Array<{ languageTag: string; translationName: string }>;
			children?: unknown[];
		}>
	> {
		// Auto-initialize on first access (lazy loading)
		if (this.initState !== 'initialized') {
			await this.initialize();
		}

		const fullStructure = await this.getContentStructure();

		// Strip out collection definitions, keep only metadata + translations for localization
		interface NavigationNode {
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
		}

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

		// Filter by tenantId if provided
		if (node?.collectionDef && tenantId && node.tenantId !== tenantId) {
			return null;
		}

		return node?.collectionDef ?? null;
	}

	/**
	 * Alias for getCollection for backward compatibility
	 */
	public getCollectionById(collectionId: string, tenantId?: string): Schema | null {
		return this.getCollection(collectionId, tenantId);
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

		for (const operation of operations) {
			const { type, node } = operation;

			switch (type) {
				case 'create':
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

		if (bulkUpdates.length > 0) {
			await dbAdapter.content.nodes.bulkUpdate(bulkUpdates);
			logger.info('[ContentManager] Bulk updated nodes:', bulkUpdates.length);
		}

		return await this.getContentStructureFromDatabase('flat');
	}

	// ===================================================================================
	// PRIVATE METHODS (Core Logic)
	// ===================================================================================

	private async _fullReload(tenantId?: string): Promise<void> {
		const schemas = await this._scanAndProcessFiles();
		await this._reconcileAndBuildStructure(schemas);
		await this._populateCache(tenantId);
	}

	// Scans the compiledCollections directory and processes each file into a Schema object
	private async _scanAndProcessFiles(): Promise<Schema[]> {
		const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
		try {
			const fs = await getFs();
			await fs.access(compiledDirectoryPath);
		} catch {
			logger.trace(`Compiled collections directory not found: ${compiledDirectoryPath}. Assuming fresh start.`);
			return [];
		}

		const files = await this._recursivelyGetFiles(compiledDirectoryPath);
		const schemaPromises = files
			.filter((file) => file.endsWith('.js'))
			.map(async (filePath) => {
				try {
					const fs = await getFs();
					const content = await fs.readFile(filePath, 'utf-8');
					const moduleData = await processModule(content);
					if (!moduleData?.schema) return null;

					const schema = moduleData.schema as Schema;
					const path = this._extractPathFromFilePath(filePath);
					const fileName = filePath.split('/').pop()?.replace('.js', '') ?? 'unknown';

					return {
						...schema,
						_id: schema._id!, // The _id from the file is the source of truth.
						path: path,
						name: schema.name || fileName,
						tenantId: schema.tenantId ?? undefined
					};
				} catch (error) {
					logger.warn(`Could not process collection file: ${filePath}`, error);
					return null;
				}
			});

		const schemas = (await Promise.all(schemaPromises)).filter((s): s is NonNullable<typeof s> => !!s);
		logger.trace(`Processed \x1b[34m${schemas.length}\x1b[0m collection schemas from filesystem.`);
		return schemas;
	}

	// Synchronizes schemas from files with the database and builds the in-memory maps
	private async _reconcileAndBuildStructure(schemas: Schema[]): Promise<void> {
		const dbAdapter = await getDbAdapter();
		if (!dbAdapter) throw new Error('Database adapter is not available');

		const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);

		const dbResult = await dbAdapter.content.nodes.getStructure('flat');

		const dbNodeMap = new Map<string, ContentNode>(
			dbResult.success
				? dbResult.data.filter((node: ContentNode) => typeof node.path === 'string').map((node: ContentNode) => [node.path as string, node])
				: []
		);

		const operations: ContentNode[] = [];
		const now = dateToISODateString(new Date());

		// Reconcile categories
		for (const [path, fileNode] of fileCategoryNodes.entries()) {
			const dbNode = dbNodeMap.get(path);
			operations.push({
				_id: toDatabaseId(dbNode?._id ?? uuidv4().replace(/-/g, '')),
				parentId: undefined, // Resolved below
				path,
				name: (dbNode?.name ?? fileNode.name) as string,
				icon: dbNode?.icon ?? 'bi:folder',
				order: dbNode?.order ?? 999,
				nodeType: 'category',
				translations: dbNode?.translations ?? [],
				createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
				updatedAt: now
			});
		}

		// Reconcile collections
		for (const schema of schemas) {
			if (!schema.path) continue;
			const dbNode = dbNodeMap.get(schema.path);
			operations.push({
				_id: toDatabaseId(schema._id as string),
				parentId: undefined, // Resolved below
				path: schema.path,
				name: typeof schema.name === 'string' ? schema.name : String(schema.name),
				icon: schema.icon ?? dbNode?.icon ?? 'bi:file',
				order: dbNode?.order ?? 999,
				nodeType: 'collection',
				translations: schema.translations ?? dbNode?.translations ?? [],
				// Store FULL schema in memory for getCollection() to work
				collectionDef: schema,
				tenantId: schema.tenantId,
				createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
				updatedAt: now
			});
		}

		// Sort operations by path depth (shallowest first) so parents are processed before children
		operations.sort((a, b) => {
			const depthA = (a.path?.split('/').length ?? 0) - 1; // -1 because path starts with /
			const depthB = (b.path?.split('/').length ?? 0) - 1;
			return depthA - depthB;
		});

		// Now resolve parentId for each operation based on its path
		// We'll use a temporary map to track the _id of each path as we process them
		const pathToIdMap = new Map<string, DatabaseId>();

		for (const op of operations) {
			if (!op.path) continue;

			// Calculate parent path
			const pathParts = op.path.split('/').filter(Boolean);
			if (pathParts.length > 1) {
				const parentPath = '/' + pathParts.slice(0, -1).join('/');
				const parentId = pathToIdMap.get(parentPath);
				if (parentId) {
					op.parentId = parentId;
				} else {
					// Parent should have been processed already (due to sorting by depth)
					// Check if it exists in the database
					const dbParent = dbNodeMap.get(parentPath);
					if (dbParent) {
						op.parentId = dbParent._id;
						pathToIdMap.set(parentPath, dbParent._id);
					}
				}
			}

			// Add this node to the map for its children to reference
			pathToIdMap.set(op.path, op._id);
		}

		logger.debug(`[ContentManager] Starting three-phase sync with \x1b[34m${operations.length}\x1b[0m operations`);

		// Phase 1: Batch upsert to DB WITHOUT parentId
		// This ensures all nodes get MongoDB-assigned _ids first
		if (operations.length > 0) {
			logger.debug('[ContentManager] Phase 1: Inserting nodes');
			const minimalOperations = operations.map((op) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { _id, createdAt, parentId, ...changeableFields } = op; // Exclude parentId

				return {
					path: op.path as string,
					changes: {
						...changeableFields,
						// Store only minimal metadata in DB, not full field definitions
						// Full schema lives in memory (contentNodeMap) and is loaded from files on startup
						collectionDef: op.collectionDef
							? ({
									_id: op.collectionDef._id,
									name: op.collectionDef.name,
									icon: op.collectionDef.icon,
									status: op.collectionDef.status,
									path: op.collectionDef.path,
									tenantId: op.collectionDef.tenantId,
									fields: [] // Empty array to satisfy Schema type, not used for navigation
								} as Schema)
							: undefined
					}
				};
			});

			logger.debug(`[ContentManager] Phase 1: Upserting \x1b[34m${minimalOperations.length}\x1b[0m nodes`);
			await dbAdapter.content.nodes.bulkUpdate(minimalOperations);

			// CRITICAL: Invalidate cache IMMEDIATELY after Phase 1 so Phase 2 gets fresh data
			await invalidateCategoryCache(CacheCategory.CONTENT);
			logger.debug('[ContentManager] Cache invalidated after Phase 1');

			// Phase 2: Fetch all inserted nodes to get their MongoDB-assigned _ids
			// IMPORTANT: Bypass cache to ensure we get fresh data immediately after Phase 1
			logger.debug('[ContentManager] Phase 2: Fetching nodes from database');
			const insertedNodesResult = await dbAdapter.content.nodes.getStructure('flat', {}, true); // true = bypassCache
			if (!insertedNodesResult.success || !insertedNodesResult.data) {
				logger.error('[ContentManager] Phase 2: Failed to retrieve nodes from database');
				return;
			}
			const insertedNodes = insertedNodesResult.data;
			const pathToDbIdMap = new Map<string, DatabaseId>();

			logger.debug(`[ContentManager] Phase 2: Retrieved \x1b[34m${insertedNodes.length}\x1b[0m nodes`);

			try {
				for (const node of insertedNodes) {
					if (node.path) {
						// Normalize the _id to string for proper typing and storage
						const normalizedId = normalizeId(node._id);
						if (normalizedId) {
							pathToDbIdMap.set(node.path, normalizedId as DatabaseId);
						} else {
							logger.warn(`[ContentManager] Phase 2: Could not normalize _id for node \x1b[32m${node.path}\x1b[0m`);
						}
					}
				}
			} catch (phase2Error) {
				logger.error('[ContentManager] Phase 2 error:', phase2Error);
				throw phase2Error;
			}

			// Phase 3: Update parentId values using actual MongoDB _ids
			const parentIdUpdates: Array<{ path: string; changes: { parentId: DatabaseId } }> = [];

			try {
				for (const op of operations) {
					if (!op.path) continue;

					const pathParts = op.path.split('/').filter(Boolean);
					if (pathParts.length > 1) {
						const parentPath = '/' + pathParts.slice(0, -1).join('/');
						const parentDbId = pathToDbIdMap.get(parentPath);

						if (parentDbId) {
							// parentDbId is already normalized to string in Phase 2
							parentIdUpdates.push({
								path: op.path,
								changes: { parentId: parentDbId }
							});
						} else {
							logger.warn(`[ContentManager] Missing parent for \x1b[34m${op.path}\x1b[0m (expected: \x1b[32m${parentPath}\x1b[0m)`);
						}
					}
				}

				// Batch update parentIds
				if (parentIdUpdates.length > 0) {
					logger.debug(`[ContentManager] Phase 3: Updating \x1b[34m${parentIdUpdates.length}\x1b[0m parent relationships`);
					await dbAdapter.content.nodes.bulkUpdate(parentIdUpdates);

					// Update the operations array with the new parentIds so they're reflected in memory
					for (const update of parentIdUpdates) {
						const op = operations.find((o) => o.path === update.path);
						if (op && update.changes.parentId) {
							op.parentId = update.changes.parentId;
						}
					}

					// Invalidate cache to ensure fresh reads
					await invalidateCategoryCache(CacheCategory.CONTENT);
					logger.debug('[ContentManager] Cache invalidated after Phase 3');
				}
			} catch (phase3Error) {
				logger.error('[ContentManager] Phase 3 error:', phase3Error);
				throw phase3Error;
			}
		} else {
			logger.warn('[ContentManager] No operations to sync - operations.length is 0');
		}

		// CRITICAL: Fetch the final structure from database after all phases complete
		// This ensures we have the correct parentId relationships and MongoDB-assigned _ids
		logger.debug('[ContentManager] Final phase: Fetching complete structure from database');
		const finalStructureResult = await dbAdapter.content.nodes.getStructure('flat', {}, true); // bypassCache = true

		if (!finalStructureResult.success || !finalStructureResult.data) {
			logger.error('[ContentManager] Failed to fetch final structure from database');
			throw new Error('Failed to fetch final content structure');
		}

		const finalNodes = finalStructureResult.data;
		logger.debug(`[ContentManager] Final structure: \x1b[34m${finalNodes.length}\x1b[0m nodes retrieved`);

		// Clear and rebuild local maps with the complete database structure
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();

		// Build maps from the final database structure
		for (const node of finalNodes) {
			// Ensure we normalize the _id
			const normalizedId = normalizeId(node._id);
			if (!normalizedId) {
				logger.warn(`[ContentManager] Could not normalize _id for node \x1b[32m${node.path}\x1b[0m`);
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

		logger.debug(
			`[ContentManager] Maps rebuilt: contentNodeMap=\x1b[34m${this.contentNodeMap.size}\x1b[0m, pathLookupMap=\x1b[32m${this.pathLookupMap.size}\x1b[0m`
		);
	}

	// Populates the distributed cache (e.g., Redis) with the current state
	private async _populateCache(tenantId?: string): Promise<void> {
		const state = {
			nodes: Array.from(this.contentNodeMap.values())
		};
		const cacheService = await getCacheService();
		const REDIS_TTL = await getRedisTTL();
		await cacheService.set('cms:content_structure', state, REDIS_TTL, tenantId);
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

			logger.debug(`[ContentManager] Cache hit - loading \x1b[34m${state.nodes.length}\x1b[0m nodes from cache`);
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
		const compiledDir = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
		let relativePath = filePath.substring(filePath.indexOf(compiledDir) + compiledDir.length);
		relativePath = relativePath.replace(/\.js$/, '');
		return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
	}

	private _getElapsedTime(startTime: number): string {
		return `${(performance.now() - startTime).toFixed(2)}ms`;
	}
}

// Now, define helper functions outside the class.
function toDatabaseId(id: string): DatabaseId {
	return id as DatabaseId;
}

// And finally, export the instance.
export const contentManager = ContentManager.getInstance();
