/**
 * @file src/content/ContentManager.ts
 * @description Refactored content management system core.
 *
 * Improvements:
 * - Robust Singleton Initialization: Prevents race conditions during initial server startup.
 * - Unified State Management: Uses a single Map as the source of truth for all content nodes, reducing complexity and memory overhead.
 * - Decoupled & Cohesive Methods: Long methods are broken down into smaller, focused, and more testable private functions.
 * - Optimized Lookups: A secondary path-to-ID lookup map provides fast access to content nodes by their URL path.
 * - Enhanced Caching Strategy: Caching logic is clearer and better integrated into the initialization flow.
 */

import { cacheService, REDIS_TTL_S as REDIS_TTL } from '@src/databases/CacheService';
import { ensureWidgetsInitialized } from '@src/widgets';
import { logger } from '@utils/logger.svelte';
import { v4 as uuidv4 } from 'uuid';
import type { ContentNode, DatabaseId, ISODateString, Schema } from './types';
import { generateCategoryNodesFromPaths, processModule } from './utils';

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

	private constructor() {}

	public static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}

	/**
	 * Initializes the ContentManager, handling race conditions and loading data.
	 */
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

	/**
	 * Core initialization logic.
	 */
	private async _doInitialize(tenantId?: string): Promise<void> {
		this.initState = 'initializing';
		const startTime = performance.now();
		logger.debug('Initializing ContentManager...', { tenantId });

		try {
			// 1. Attempt to load from a high-speed cache (e.g., Redis).
			if (await this._loadStateFromCache(tenantId)) {
				this.initState = 'initialized';
				logger.info(`🚀 ContentManager initialized from cache in ${this._getElapsedTime(startTime)}`);
				return;
			}

			// 2. If cache fails, perform a full load from source (files and DB).
			await ensureWidgetsInitialized();
			await this._fullReload(tenantId);

			this.initState = 'initialized';
			logger.info(`📦 ContentManager fully initialized in ${this._getElapsedTime(startTime)}`);
		} catch (error) {
			this.initState = 'error';
			logger.error('ContentManager initialization failed:', error);
			this.initPromise = null; // Allow retry on next call
			throw error;
		}
	}

	/**
	 * Forces a full reload of all collections and content structure.
	 */
	public async refresh(tenantId?: string): Promise<void> {
		logger.info('Refreshing ContentManager state...');
		this.initState = 'initializing';
		this.initPromise = this._fullReload(tenantId).then(() => {
			this.initState = 'initialized';
		});
		await this.initPromise;
	}

	/**
	 * Returns all loaded collection schemas.
	 */
	public getCollections(tenantId?: string): Schema[] {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
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
	 * Returns the first available collection schema.
	 */
	public getFirstCollection(tenantId?: string): Schema | null {
		const collections = this.getCollections(tenantId);
		return collections.length > 0 ? collections[0] : null;
	}

	/**
	 * Retrieves the entire content structure as a nested tree.
	 */
	public getContentStructure(): ContentNode[] {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
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
	 * This is suitable for serialization to the client (e.g., for navigation menus).
	 */
	public getNavigationStructure(): Array<{
		_id: string;
		name: string;
		path?: string;
		icon?: string;
		nodeType: 'category' | 'collection';
		order?: number;
		translations?: Array<{ languageTag: string; translationName: string }>;
		children?: Array<any>;
	}> {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}

		const fullStructure = this.getContentStructure();

		// Strip out collection definitions, keep only metadata + translations for localization
		const stripToNavigation = (nodes: ContentNode[]): any[] => {
			return nodes.map((node) => ({
				_id: node._id,
				name: node.name,
				path: node.path,
				icon: node.icon,
				nodeType: node.nodeType,
				order: node.order,
				translations: node.translations, // Include translations for client-side localization
				children: node.children && node.children.length > 0 ? stripToNavigation(node.children) : undefined
			}));
		};

		return stripToNavigation(fullStructure);
	}

	/**
	 * Gets a specific collection by its ID or path.
	 */
	public getCollection(identifier: string, tenantId?: string): Schema | null {
		if (this.initState !== 'initialized') {
			throw new Error('ContentManager is not initialized.');
		}
		const nodeId = this.pathLookupMap.get(identifier) ?? identifier;
		const node = this.contentNodeMap.get(nodeId);

		// Filter by tenantId if provided
		if (node?.collectionDef && tenantId && node.tenantId !== tenantId) {
			return null;
		}

		return node?.collectionDef ?? null;
	}

	/**
	 * Alias for getCollection for backward compatibility.
	 */
	public getCollectionById(collectionId: string, tenantId?: string): Schema | null {
		return this.getCollection(collectionId, tenantId);
	}

	// ===================================================================================
	// PRIVATE METHODS (Core Logic)
	// ===================================================================================

	private async _fullReload(tenantId?: string): Promise<void> {
		const schemas = await this._scanAndProcessFiles();
		await this._reconcileAndBuildStructure(schemas);
		await this._populateCache(tenantId);
	}

	/**
	 * Scans the compiledCollections directory and processes each file into a Schema object.
	 */
	private async _scanAndProcessFiles(): Promise<Schema[]> {
		const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
		try {
			const fs = await getFs();
			await fs.access(compiledDirectoryPath);
		} catch {
			logger.debug(`Compiled collections directory not found: ${compiledDirectoryPath}. Assuming fresh start.`);
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
		logger.debug(`Processed \x1b[33m${schemas.length}\x1b[0m collection schemas from filesystem.`);
		return schemas;
	}

	/**
	 * Synchronizes schemas from files with the database and builds the in-memory maps.
	 */
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
		const now = new Date().toISOString() as ISODateString;

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
				createdAt: dbNode?.createdAt ?? now,
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
				collectionDef: schema,
				tenantId: schema.tenantId,
				createdAt: dbNode?.createdAt ?? now,
				updatedAt: now
			});
		}

		// Resolve parentIds
		const pathIdMap = new Map(operations.map((op) => [op.path, op._id]));
		operations.forEach((op) => {
			if (op.path) {
				const parentPath = op.path.split('/').slice(0, -1).join('/') || '/';
				op.parentId = pathIdMap.get(parentPath === op.path ? '' : parentPath) ?? undefined;
			}
		});

		// Batch upsert to DB
		if (operations.length > 0) {
			await dbAdapter.content.nodes.bulkUpdate(
				operations.filter((op) => typeof op.path === 'string').map((op) => ({ path: op.path as string, changes: op }))
			);
		}

		// Clear and rebuild local maps
		this.contentNodeMap.clear();
		this.pathLookupMap.clear();
		for (const node of operations) {
			this.contentNodeMap.set(node._id, node);
			if (node.path) {
				this.pathLookupMap.set(node.path, node._id);
			}
		}
	}

	/**
	 * Populates the distributed cache (e.g., Redis) with the current state.
	 */
	private async _populateCache(tenantId?: string): Promise<void> {
		const state = {
			nodes: Array.from(this.contentNodeMap.values())
		};
		await cacheService.set('cms:content_structure', state, REDIS_TTL, tenantId);
	}

	/**
	 * Tries to load the state from the distributed cache.
	 */
	private async _loadStateFromCache(tenantId?: string): Promise<boolean> {
		try {
			await cacheService.initialize();
			const state = await cacheService.get<{ nodes: ContentNode[] }>('cms:content_structure', tenantId);
			if (!state || !state.nodes) return false;

			this.contentNodeMap.clear();
			this.pathLookupMap.clear();
			for (const node of state.nodes) {
				this.contentNodeMap.set(node._id, node);
				if (node.path) {
					this.pathLookupMap.set(node.path, node._id);
				}
			}
			return true;
		} catch (error) {
			logger.warn('Could not load from cache, proceeding with full load.', error);
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
		return `\x1b[32m${(performance.now() - startTime).toFixed(2)}ms\x1b[0m`;
	}
}

function toDatabaseId(id: string): DatabaseId {
	return id as DatabaseId;
}

export const contentManager = ContentManager.getInstance();
