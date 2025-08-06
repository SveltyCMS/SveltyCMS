/**
 * @file src/content/ContentManager.ts
 * @description Content management system core functionality
 * Features:
 * - Singleton pattern for centralized content management
 * - Category & collection loading, caching, and updates from folder structure
 * - Widget initialization
 * - Dynamic schema generation based on widget configurations
 * - Caching and efficient data structures (Memory + optional Redis)
 * - Error handling
 */

// Server-side only file system operations
async function getFs() {
	if (!import.meta.env.SSR) {
		throw new Error('File operations can only be performed on the server');
	}
	const fs = await import('node:fs/promises');
	return fs.default;
}

// Server-side only path operations
async function getPath() {
	if (!import.meta.env.SSR) {
		throw new Error('Path operations can only be performed on the server');
	}
	const path = await import('node:path');
	return path.default;
}

// Server-side only database adapter access
async function getDbAdapter() {
	if (!import.meta.env.SSR) {
		throw new Error('Database operations can only be performed on the server');
	}
	const { dbAdapter } = await import('@src/databases/db');
	return dbAdapter;
}

// Existing imports

import { v4 as uuidv4 } from 'uuid';

// Config
import { privateEnv } from '@root/config/private';

// Types
import type { Schema, ContentTypes, Category, CollectionData, ContentNodeOperation } from './types';
import type { ContentNode } from '@src/databases/dbInterface'; // Commented out unused import

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
import { ensureWidgetsInitialized } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
import { constructContentPaths, generateCategoryNodesFromPaths, processModule } from './utils';

// Server-side only compilation function
async function getCompile() {
	if (!import.meta.env.SSR) {
		throw new Error('Compilation can only be performed on the server');
	}
	const { compile } = await import('../utils/compilation/compile');
	return compile;
}

interface CacheEntry<T> {
	value: T;
	timestamp: number;
}

// Constants
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const REDIS_TTL = 300; // 5 minutes in seconds for Redis
const MAX_CACHE_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

class ContentManager {
	private static instance: ContentManager | null = null;
	private collectionCache: Map<string, CacheEntry<Schema>> = new Map();
	private fileHashCache: Map<string, CacheEntry<string>> = new Map();

	private collectionAccessCount: Map<string, number> = new Map();
	private initialized: boolean = false;

	private loadedCollections: Schema[] = [];

	private collectionMapId: Map<string, Schema> = new Map(); // keys are colleciton _ids
	private collectionMapPath: Map<string, ContentNode> = new Map(); // keys are path
	private contentStructure: ContentNode[] = [];

	private firstCollection: Schema | null = null;

	private contentNodeMap: Map<string, ContentNode & { path: string }> = new Map(); // _ids are path

	// private constructor() {
	//   this.dbInitPromise = dbInitPromise;
	// }

	static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}

	// Wait for any initialization dependencies (database, external services, etc.)
	private async waitForInitialization(): Promise<void> {
		try {
			// Wait for database to be ready
			if (typeof window === 'undefined') {
				// Server-side: wait for database adapter
				const dbAdapter = await getDbAdapter();
				if (dbAdapter && typeof dbAdapter.waitForConnection === 'function') {
					await dbAdapter.waitForConnection();
				}
			}
			// Add any other initialization dependencies here
			logger.debug('ContentManager dependencies ready');
		} catch (error) {
			logger.warn('Non-critical initialization dependency failed:', error);
			// Don't throw - allow ContentManager to continue initializing
		}
	}

	// Initialize the collection manager with performance optimizations
	public async initialize(tenantId?: string): Promise<void> {
		if (this.initialized) return;

		const initStartTime = performance.now();
		logger.debug('Initializing ContentManager...', { tenantId });

		try {
			// Check if we have cached collections in Redis first
			let collections: Schema[] | null = null;
			if (isRedisEnabled()) {
				try {
					const cacheKey = tenantId ? `cms:tenant:${tenantId}:all_collections` : 'cms:all_collections';
					collections = await getCache<Schema[]>(cacheKey);
					if (collections && collections.length > 0) {
						logger.debug(`Loaded ${collections.length} collections from Redis cache`);

						// Populate in-memory structures from cache
						for (const schema of collections) {
							this.collectionMapId.set(schema._id, schema);
							if (!this.firstCollection) this.firstCollection = schema;
						}
						this.loadedCollections = collections;

						// Still need to ensure widgets are initialized in parallel
						await ensureWidgetsInitialized();

						const cacheTime = performance.now() - initStartTime;
						logger.info(`🚀 ContentManager initialized from cache in \x1b[32m${cacheTime.toFixed(2)}ms\x1b[0m`);
						this.initialized = true;
						return;
					}
				} catch (cacheErr) {
					logger.debug('Redis cache miss or error, proceeding with file loading:', cacheErr);
				}
			}

			// If no cache, run full initialization in parallel
			await Promise.all([
				ensureWidgetsInitialized(), // Ensure widgets are initialized
				this.waitForInitialization() // Wait for any dependencies
			]);

			// Load collections with optimized batching
			await this.updateCollections(true, tenantId);

			const totalTime = performance.now() - initStartTime;
			logger.info(`📦 ContentManager fully initialized in \x1b[32m${totalTime.toFixed(2)}ms\x1b[0m`);
			this.initialized = true;
		} catch (error) {
			logger.error('ContentManager initialization failed:', error);
			this.initialized = false; // Reset on failure to allow retry
			throw error;
		}
	}

	public async getCollectionData(tenantId?: string) {
		if (!this.initialized) {
			await this.initialize(tenantId);
		}
		return {
			collections: this.loadedCollections,
			collectionMap: this.collectionMapId,
			contentStructure: this.contentStructure
		};
	}
	// Load collections with optimized batching and caching
	private async loadCollections(tenantId?: string): Promise<Schema[]> {
		try {
			const loadStartTime = performance.now();
			// Server-side collection loading
			const collections: Schema[] = [];
			const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
			const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);

			const dbAdapter = await getDbAdapter();
			if (!dbAdapter) {
				logger.error('Database adapter not initialized during collection loading');
				throw new Error('Database service unavailable');
			}

			// Process files in batches for better performance
			const batchSize = 10; // Process 10 files at a time
			const batches: string[][] = [];

			for (let i = 0; i < files.length; i += batchSize) {
				batches.push(files.slice(i, i + batchSize));
			}

			let processedCount = 0;

			// Process each batch in parallel
			for (const [batchIndex, batch] of batches.entries()) {
				const batchStartTime = performance.now();

				const batchResults = await Promise.allSettled(
					batch.map(async (filePath) => {
						try {
							// Check cache first to avoid file I/O
							const cachedSchema = await this.getCacheValue<Schema>(filePath, this.collectionCache);
							if (cachedSchema) {
								logger.debug(`Cache hit for collection: ${filePath}`);
								return cachedSchema;
							}

							const fs = await getFs();
							const content = await fs.readFile(filePath, 'utf-8');
							const moduleData = await processModule(content);

							if (!moduleData?.schema) {
								logger.warn(`No schema found in ${filePath}`);
								return null;
							}

							const schema = moduleData.schema as Schema;
							const filePathName = filePath
								.split('/')
								.pop()
								?.replace(/\.(ts|js)$/, '');
							if (!filePathName) return null;

							const path = this.extractPathFromFilePath(filePath);

							const processed: Schema = {
								...schema,
								_id: schema._id!, // Always use the ID from the compiled schema
								name: schema.name || filePathName,
								label: schema.label || filePathName,
								path: path,
								icon: schema.icon || 'iconoir:info-empty',
								fields: schema.fields || [],
								permissions: schema.permissions || {},
								livePreview: schema.livePreview || false,
								strict: schema.strict || false,
								revision: schema.revision || false,
								description: schema.description || '',
								slug: schema.slug || filePathName.toLowerCase()
							};

							// Cache the compiled schema to avoid re-processing
							await this.setCacheValue(filePath, processed, this.collectionCache);

							return processed;
						} catch (err) {
							logger.error(`Failed to process file ${filePath}:`, err);
							return null;
						}
					})
				);

				// Process successful results
				for (const result of batchResults) {
					if (result.status === 'fulfilled' && result.value) {
						const schema = result.value;

						// The function only creates models during first run
						if (!dbAdapter.collection) {
							logger.error('Collection service not initialized');
							throw new Error('Collection service unavailable');
						}

						try {
							// In multi-tenant mode, pass tenant context to model creation
							const model = await dbAdapter.collection.createModel(schema as CollectionData);
							if (!model) {
								logger.error(`Database model creation failed for ${schema.name} ${schema.path}`);
								throw new Error('Model creation failed');
							} else {
								// In multi-tenant mode, log tenant context for this collection
								if (privateEnv.MULTI_TENANT && tenantId) {
									logger.debug(`Collection ${schema.name} loaded for tenant ${tenantId}`);
								}

								if (!this.firstCollection) this.firstCollection = schema;
								collections.push(schema);
								this.collectionMapId.set(schema._id, schema);
								processedCount++;
							}
						} catch (modelErr) {
							logger.error(`Model creation failed for ${schema.name}:`, modelErr);
							continue; // Skip failed models but continue processing
						}
					}
				}

				const batchTime = performance.now() - batchStartTime;
				logger.debug(
					`Batch \x1b[34m${batchIndex + 1}/${batches.length}\x1b[0m processed \x1b[34m${batch.length}\x1b[0m files in \x1b[32m${batchTime.toFixed(2)}ms\x1b[0m`
				);
			}

			// Cache in Redis if available
			if (isRedisEnabled()) {
				const cacheKey = tenantId ? `cms:tenant:${tenantId}:all_collections` : 'cms:all_collections';
				await setCache(cacheKey, collections, REDIS_TTL);
			}

			this.loadedCollections = collections;
			const totalTime = performance.now() - loadStartTime;
			logger.info(
				`📦 Loaded \x1b[34m${processedCount}\x1b[0m collections in \x1b[32m${totalTime.toFixed(2)}ms\x1b[0m (${(totalTime / processedCount).toFixed(2)}ms per collection)`
			);
			return collections;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to load collections', { error: errorMessage });
			throw new Error(`Failed to load collections: ${errorMessage}`);
		}
	}

	// Update collections
	async updateCollections(recompile: boolean = false, tenantId?: string): Promise<void> {
		try {
			if (recompile) {
				// Clear both memory and Redis caches - use tenant-specific cache key
				this.collectionCache.clear();
				this.fileHashCache.clear();
				if (isRedisEnabled()) {
					const cacheKey = tenantId ? `cms:tenant:${tenantId}:all_collections` : 'cms:all_collections';
					await clearCache(cacheKey);
				}
			}
			await this.loadCollections(tenantId);
			await this.updateContentStructure();
			logger.info('Collections updated successfully');
			// Convert category array to record structure
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Error in updateCollections: ${errorMessage}`);
			throw new Error(`Failed to update collections: ${errorMessage}`);
		}
	}

	public getCollectionById(id: string, tenantId?: string): Schema | null {
		try {
			if (!this.initialized) {
				logger.error('Content Manager not initialized');
				return null;
			}

			// In multi-tenant mode, ensure tenantId is provided
			if (privateEnv.MULTI_TENANT && !tenantId) {
				logger.error('TenantId is required in multi-tenant mode');
				return null;
			}

			const collection = this.collectionMapId.get(id);
			if (!collection) {
				logger.error(`Content with id: ${id} not found`);
				return null;
			}

			// In multi-tenant mode, verify collection belongs to the tenant
			// This would typically involve checking collection metadata or database records
			// For now, we log the tenant context for proper multi-tenant implementation
			if (privateEnv.MULTI_TENANT && tenantId) {
				logger.debug(`Accessing collection ${id} for tenant ${tenantId}`);
				// TODO: Implement actual tenant validation logic here
				// This could involve checking collection.tenantId or querying database
			}

			return collection;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Error in getCollectionById: ${errorMessage}`);
			throw error;
		}
	}

	// Gets the content structure tree
	public getContentStructure(): ContentNode[] {
		try {
			if (!this.initialized) {
				throw new Error('Content Manager not initialized when accessing content structure');
			}

			if (!this.contentStructure || this.contentStructure.length === 0) {
				logger.warn('Content structure is empty');
				return [];
			}

			// Return a shallow copy to prevent direct modification
			return [...this.contentStructure];
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to get content structure: ${errorMessage}`);
			throw error;
		}
	}

	public getFirstCollection(): Schema | null {
		try {
			if (!this.firstCollection) {
				return null;
			}

			// Validate UUID format

			if (!/^([a-f0-9-]{32})$/i.test(this.firstCollection._id)) {
				logger.error('Invalid UUID format in first collection', {
					collectionId: this.firstCollection._id,
					collectionName: this.firstCollection.name
				});
				return null;
			}

			return this.firstCollection;
		} catch (error) {
			logger.error(`Error in getFirstCollection: ${error}`);
			throw error;
		}
	}

	public async getCollection(identifier: string, tenantId?: string): Promise<(Schema & { module: string | undefined }) | null> {
		try {
			if (!this.initialized) {
				logger.debug('Content Manager not initialized, initializing...');
				await this.initialize(tenantId);
			}

			// Try to resolve as UUID first
			let schema = this.collectionMapId.get(identifier);
			let collectionFile: string | undefined = undefined;
			const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
			if (schema) {
				// If found by UUID, use its path to load the file
				const filePath = normalizePath(schema.path);
				const fullFilePath = `${compiledDirectoryPath}${filePath}.js`;
				logger.debug(`Trying to load collection file by UUID: \x1b[34m${fullFilePath}\x1b[0m`);
				collectionFile = await this.readFile(fullFilePath);
			} else {
				// Fallback: treat as path
				const filePath = normalizePath(identifier);
				const fullFilePath = `${compiledDirectoryPath}${filePath}.js`;
				logger.debug(`Trying to load collection file by path: \x1b[34m${fullFilePath}\x1b[0m`);
				collectionFile = await this.readFile(fullFilePath);
				const contentNode = this.collectionMapPath.get(filePath);
				// logger.debug('contentNode for path', filePath, ':', contentNode);
				if (contentNode) {
					schema = this.collectionMapId.get(contentNode._id);
					//logger.debug('schema for contentNode._id', contentNode._id, ':', schema);
				} else {
					logger.debug('No contentNode found for path', filePath);
				}
			}
			if (!schema || !collectionFile) {
				logger.error(`getCollection: Collection not found for identifier: ${identifier}`);
				logger.debug('Available collectionMapPath keys:', Array.from(this.collectionMapPath.keys()));
				logger.debug('Available collectionMapId keys:', Array.from(this.collectionMapId.keys()));
				logger.debug('Lookup key used:', normalizePath(identifier));
				logger.debug('schema:', schema, 'collectionFile:', collectionFile);
				return null;
			}
			return { module: collectionFile, ...schema };
		} catch (error) {
			logger.error('Error getting collection for identifier:', identifier, error);
			return null;
		}
	}

	public async upsertContentNodes(nodes: ContentNodeOperation[]) {
		try {
			const fs = await getFs(); // ✅ Get fs properly
			const dbAdapter = await getDbAdapter(); // Get dbAdapter dynamically
			const newNodes = [];
			const idSet = new Set<string>(nodes.map((node) => node.node._id));
			const filteredNodes = this.contentStructure.filter((node) => !idSet.has(node._id));

			const collectionPath = import.meta.env.userCollectionsPath;

			for (const operation of nodes) {
				const node = operation.node;
				const oldNode = this.contentNodeMap.get(node._id);

				const result = await dbAdapter?.content.nodes.upsertContentStructureNode(node);
				if (!result?.success) throw new Error(`Failed to update content structure ${operation.node.name}`);
				newNodes.push(result.data);

				if (operation.type === 'create') {
					// create file/folder
					const path = await getPath(); // Get path dynamically
					const parent = this.contentNodeMap.get(operation.node.parentId ?? '') ?? null;
					const newPath = path.join(parent?.path ?? '/', node.name);
					await fs.mkdir(`${collectionPath}/${newPath}`, { recursive: true });
					this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath });
				}

				if (!oldNode) continue;
				if (operation.type === 'rename') {
					// rename file/folder
					const path = await getPath(); // Get path dynamically

					const newPath = path.join(oldNode.path.split('/').slice(0, -1).join('/'), node.name);
					const fileName = node.nodeType === 'collection' ? `${collectionPath}/${newPath}.ts` : `${collectionPath}/${newPath}`;
					const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`;

					await fs.rename(oldFileName, fileName);

					this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath });
					this.collectionMapPath.set(`/${newPath}`, { ...result.data });
				} else if (operation.type === 'move') {
					// move file/folder
					//

					if (!operation.node.parentId) {
						const fileName = node.nodeType === 'collection' ? `${collectionPath}/${node.name}.ts` : `${collectionPath}/${node.name}`;
						const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`;

						await fs.rename(oldFileName, fileName);

						this.contentNodeMap.set(result.data._id, { ...result.data, path: `/${node.name}` });
						this.collectionMapPath.set(`/${node.name}`, { ...result.data });
						continue;
					}

					const newParent = this.contentNodeMap.get(operation.node.parentId) ?? null;
					if (!newParent) throw new Error('Parent not found');

					const path = await getPath(); // Get path dynamically
					const newPath = path.join(newParent.path, node.name);
					const fileName = node.nodeType === 'collection' ? `${collectionPath}/${newPath}.ts` : `${collectionPath}/${newPath}`;
					const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`;

					await fs.rename(oldFileName, fileName);
					this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath });
					this.collectionMapPath.set(`/${node.name}`, { ...result.data });
				} else if (operation.type === 'delete') {
					// delete file/folder
					await fs.unlink(`${collectionPath}/${oldNode.path}`);
					this.contentNodeMap.delete(oldNode._id);
					this.collectionMapPath.delete(oldNode.path);
				}
			}

			this.contentStructure = [...filteredNodes, ...newNodes];
			const compile = await getCompile();
			await compile();
			// await this.loadCollections()
			return this.contentStructure;
		} catch (error) {
			logger.error('Error upserting content node', error);
			throw error;
		}
	}

	// Create categories with Redis caching
	private async updateContentStructure(): Promise<void> {
		try {
			const dbAdapter = await getDbAdapter();
			if (!dbAdapter) {
				logger.error('Database adapter not initialized during content structure update');
				throw new Error('Database service unavailable');
			}
			if (!dbAdapter.content?.nodes) {
				logger.error('Content nodes service not initialized');
				throw new Error('Content nodes service unavailable');
			}

			const result = await dbAdapter.content.nodes.getStructure('flat');
			if (!result.success) logger.debug(`Failed retrieve contentNodes`);
			const structure = result.success ? result.data : [];

			this.contentStructure = [];

			const contentStructure = constructContentPaths(structure);
			const categoryNodes = generateCategoryNodesFromPaths(this.loadedCollections);

			// orderedNodes is sorted by level in the tree
			const orderedNodes = Array.from(categoryNodes.values()).sort((a, b) => {
				return a.path.split('/').length - b.path.split('/').length;
			});

			for (const node of orderedNodes) {
				const oldNode = contentStructure[node.path];
				const parentPath = node.path.split('/').slice(0, -1).join('/') || null;
				const result = await dbAdapter?.content.nodes.upsertContentStructureNode({
					_id: oldNode?._id ?? uuidv4().replace(/-/g, ''),
					name: node.name ?? oldNode?.name,
					icon: oldNode?.icon ?? 'bi:folder',
					order: oldNode?.order ?? 999,
					nodeType: 'category',
					parentId: !parentPath ? undefined : (contentStructure[parentPath]?._id.toString() ?? undefined),
					translations: oldNode?.translations ?? []
				});
				if (!result.success) {
					throw new Error('Failed to update category');
				}
				const currentCategoryNode = result.data;
				contentStructure[node.path] = currentCategoryNode;
				this.contentStructure.push(currentCategoryNode);
				this.contentNodeMap.set(currentCategoryNode._id, {
					...currentCategoryNode,
					path: node.path
				});
			}

			for (const collection of this.loadedCollections) {
				if (!collection.path) {
					logger.warn(`Collection \x1b[34m${collection.name}\x1b[0m has no path`);
					continue;
				}

				const normalizedPath = normalizePath(collection.path);
				const oldNode = contentStructure[normalizedPath];

				const parentPath = normalizedPath === '/' ? null : normalizedPath.split('/').slice(0, -1).join('/') || '/';

				const result = await dbAdapter?.content.nodes.upsertContentStructureNode({
					_id: collection._id, // always use the schema's _id for collection nodes
					name: collection.name as string,
					icon: collection.icon ?? oldNode?.icon ?? 'bi:file',
					order: oldNode?.order ?? 999,
					nodeType: 'collection',
					parentId: parentPath !== null ? (contentStructure[parentPath]?._id.toString() ?? undefined) : undefined,
					translations: collection.translations ?? oldNode?.translations ?? []
				});
				if (!result.success) {
					throw new Error('Failed to update collection');
				}
				const currentNode = result.data;
				contentStructure[normalizedPath] = currentNode;
				this.contentStructure.push(currentNode);
				this.collectionMapPath.set(normalizedPath, currentNode);
				this.contentNodeMap.set(collection._id, { ...currentNode, path: normalizedPath });
			}

			// Cache in Redis if available
			if (isRedisEnabled()) {
				await setCache('cms:categories', categoryNodes, REDIS_TTL);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to create categories', { error: errorMessage });
			throw new Error(`Failed to create categories: ${errorMessage}`);
		}
	}

	// Generate nested JSON structure
	// Cache management methods with Redis support
	private async getCacheValue<T>(key: string, cache: Map<string, CacheEntry<T>>): Promise<T | null> {
		// Try Redis first if available
		if (isRedisEnabled()) {
			const redisValue = await getCache<T>(`cms:${key}`);
			if (redisValue) {
				// Update local cache
				cache.set(key, {
					value: redisValue,
					timestamp: Date.now()
				});
				return redisValue;
			}
		}
		// Fallback to memory cache
		const entry = cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.timestamp > CACHE_TTL) {
			cache.delete(key);
			return null;
		}
		return entry.value;
	}

	private async setCacheValue<T>(key: string, value: T, cache: Map<string, CacheEntry<T>>): Promise<void> {
		// Set in Redis if available
		if (isRedisEnabled()) {
			await setCache(`cms:${key}`, value, REDIS_TTL);
		}
		// Set in memory cache
		cache.set(key, {
			value,
			timestamp: Date.now()
		});
		this.trimCache(cache);
	}

	private async clearCacheValue(key: string): Promise<void> {
		// Clear from Redis if available
		if (isRedisEnabled()) {
			await clearCache(`cms:${key}`);
		}
		// Clear from all memory caches
		this.collectionCache.delete(key);
		// this.categoryCache.delete(key);
		this.fileHashCache.delete(key);
	}

	private trimCache<T>(cache: Map<string, CacheEntry<T>>): void {
		if (cache.size > MAX_CACHE_SIZE) {
			// Remove least recently used entries
			const entriesToRemove = Array.from(cache.entries())
				.sort((a, b) => a[1].timestamp - b[1].timestamp)
				.slice(0, cache.size - MAX_CACHE_SIZE);

			// Clear associated Redis cache if enabled
			if (isRedisEnabled()) {
				const keysToClear = entriesToRemove.map(([key]) => `cms:${key}`);
				clearCache(keysToClear).catch((err) => {
					logger.warn('Failed to clear Redis cache entries:', err);
				});
			}

			// Remove from memory cache
			entriesToRemove.forEach(([key]) => cache.delete(key));
		}
	}

	// Extract path from file path
	private extractPathFromFilePath(filePath: string): string {
		const compiledCollectionsPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections/';
		const relativePath = filePath.startsWith(compiledCollectionsPath) ? filePath.substring(compiledCollectionsPath.length) : filePath;

		// Split path and remove empty parts
		const parts = relativePath.split('/').filter((part) => part !== '');

		// Remove file extension from last segment if it exists
		if (parts.length > 0) {
			parts[parts.length - 1] = parts[parts.length - 1].replace(/\.(ts|js)$/, '');
		}

		// Handle nested directory structures
		if (parts.length > 1) {
			// Join all parts except the last one with slashes
			const directoryPath = parts.slice(0, -1).join('/');
			// Use the last part as the collection name
			const collectionName = parts[parts.length - 1];
			return `/${directoryPath}/${collectionName}`;
		}

		// Default case for single-level collections
		return `/${parts.join('/')}`;
	}

	// Get compiled Categories and Collection files
	private async getCompiledCollectionFiles(compiledDirectoryPath: string): Promise<string[]> {
		const fs = await getFs(); // Use the safe fs function

		const getAllFiles = async (dir: string): Promise<string[]> => {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			const files = await Promise.all(
				entries.map(async (entry) => {
					const resolvedPath = `${dir}/${entry.name}`;
					return entry.isDirectory() ? getAllFiles(resolvedPath) : resolvedPath;
				})
			);
			return files.flat();
		};

		try {
			const allFiles = await getAllFiles(compiledDirectoryPath);
			// Filter the list to only include .js files
			const filteredFiles = allFiles.filter((file) => file.endsWith('.js'));

			logger.debug(`Found \x1b[34m${filteredFiles.length}\x1b[0m collection files in \x1b[34m${compiledDirectoryPath}\x1b[0m`);

			// Return the full paths
			return filteredFiles;
		} catch (error) {
			logger.error(`Error getting compiled collection files: ${error.message}`);
			throw error;
		}
	}
	// Read file with retry mechanism
	private async readFile(filePath: string): Promise<string> {
		// Server-side file reading
		const fs = await getFs(); // Use the safe fs function
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return content;
		} catch (error) {
			if (error.code === 'ENOENT') {
				logger.error(`File not found: ${filePath}`);
			} else {
				logger.error(`Error reading file: ${filePath}`, error);
			}
			throw error;
		}
	}

	// Error recovery
	private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = MAX_RETRIES, delay: number = RETRY_DELAY): Promise<T> {
		let lastError: Error | null = null;
		for (let i = 0; i < maxRetries; i++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error as Error;
				await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
				logger.warn(`Retry ${i + 1}/${maxRetries} for operation after error: ${lastError.message}`);
			}
		}
		throw lastError;
	}

	// Lazy loading with Redis support
	private async lazyLoadCollection(name: ContentTypes): Promise<Schema | null> {
		const cacheKey = `collection_${name}`;
		// Try getting from cache (Redis or memory)
		const cached = await this.getCacheValue(cacheKey, this.collectionCache);
		if (cached) {
			this.collectionAccessCount.set(name.toString(), (this.collectionAccessCount.get(name.toString()) || 0) + 1);
			return cached;
		}
		// Load if not cached
		const path = `config/collections/${name}.ts`;
		try {
			logger.debug(`Attempting to read file for collection: \x1b[34m${name}\x1b[0m at path: \x1b[33m${path}\x1b[0m`);
			const content = await this.readFile(path);
			logger.debug(`File content for collection \x1b[34m${name}\x1b[0m: ${content.substring(0, 100)}...`); // Log only the first 100 characters
			// const schema = await this.processCollectionFile(path, content); // Variable 'schema' was assigned but never used
			await processModule(content); // Call the function but don't assign to unused variable
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to lazy load collection ${name}:`, { error: errorMessage });
			throw new Error(`Failed to lazy load collection: ${errorMessage}`);
		}
		return null;
	}
}

// Utility to normalize collection paths
function normalizePath(p: string): string {
	if (!p) return '/';
	let np = p.trim();
	if (!np.startsWith('/')) np = '/' + np;
	np = np.replace(/\\+/g, '/'); // Replace backslashes with slashes
	np = np.replace(/\/+/g, '/'); // Remove duplicate slashes
	np = np.replace(/\/\/+/, '/'); // Remove double slashes
	np = np.replace(/\/$/, ''); // Remove trailing slash
	return np;
}

// Export singleton instance
export const contentManager = ContentManager.getInstance();

// Export types
export type { Schema, ContentTypes, Category, CollectionData };
