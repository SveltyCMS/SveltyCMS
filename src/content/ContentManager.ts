/**
 * @file src/content/ContentManager.ts
 * @description Content Manager for SvelteCMS
 *
 * Features:
 * - Singleton pattern for centralized content management
 * - Category & collection loading, caching, and updates from folder structure
 * - Widget initialization
 * - Dynamic schema generation based on widget configurations
 * - Caching and efficient data structures (Memory + optional Redis)
 * - Error handling
 */

import axios from 'axios';
import { browser, dev } from '$app/environment';
// Types
import type { Schema, CollectionTypes, Category, CollectionData } from './types';
import type { SystemContent } from '@src/databases/dbInterface';
// Utils
import { v4 as uuidv4 } from 'uuid';
// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
// Stores
import { categories, collections, unAssigned, collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
import { dbAdapter, dbInitPromise } from '@src/databases/db';

import widgetProxy, { initializeWidgets, resolveWidgetPlaceholder } from '@components/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
// Server-side imports
let fs: typeof import('fs/promises') | null = null;

if (!browser) {
	const imports = await Promise.all([import('fs/promises')]);
	[fs] = imports;
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

// Widget initialization state
let widgetsInitialized = false;

async function ensureWidgetsInitialized() {
	if (!widgetsInitialized) {
		try {
			await initializeWidgets();
			// Make widgets available globally for eval context
			if (!browser) {
				globalThis.widgets = widgetProxy;
			}
			widgetsInitialized = true;
			logger.info('Widgets initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize widgets:', error);
			throw error;
		}
	}
}

class ContentManager {
	private static instance: ContentManager | null = null;
	private collectionCache: Map<string, CacheEntry<Schema>> = new Map();
	private fileHashCache: Map<string, CacheEntry<string>> = new Map();
	private categoryCache: Map<string, CacheEntry<Category>> = new Map();
	private collectionAccessCount: Map<string, number> = new Map();
	private initialized: boolean = false;
	private loadedCollections: Schema[] = [];
	private loadedCategories: Category[] = [];
	private dbInitPromise: Promise<void> | null = null;

	private constructor() {
		if (!browser) {
			// Server-side initialization
			this.dbInitPromise = dbInitPromise;

		}
	}
	static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}
	// Wait for initialization to complete
	async waitForInitialization(): Promise<void> {
		if (this.dbInitPromise) {
			await this.dbInitPromise;
		}
	}
	// Initialize the collection manager
	private async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			await this.measurePerformance(async () => {
				try {
					// Now load collections
					await this.waitForInitialization();
					await this.updateCollections(true);
					this.initialized = true;
				} catch (error) {
					logger.error('Initialization failed:', error);
					throw error;
				}
			}, 'Content Manager Initialization');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to load Content', { error: errorMessage });
			throw new Error(`Failed to load Content: ${errorMessage}`);
		}
	}
	// Get collection and category data
	getCollectionData() {
		return {
			collections: this.loadedCollections,
			categories: this.loadedCategories
		};
	} // Add this closing bracket


	// Process module content
	private async processModule(content: string): Promise<{ schema?: Partial<Schema> } | null> {
		try {
			// Ensure widgets are initialized before processing module
			await ensureWidgetsInitialized();

			// Extract UUID from file content
			const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
			const uuid = uuidMatch ? uuidMatch[1] : null;

			// Remove any import/export statements and extract the schema object
			const cleanedContent = content
				.replace(/import\s+.*?;/g, '')  // Remove import statements
				.replace(/export\s+default\s+/, '')  // Remove export default
				.replace(/export\s+const\s+/, 'const ') // Handle export const
				.trim();

			// Replace the global widgets before evaluating the schema
			const modifiedContent = cleanedContent.replace(/globalThis\.widgets\.(\w+)\((.*?)\)/g, (match, widgetName, widgetConfig) => {
				return `await resolveWidgetPlaceholder({ __widgetName: '${widgetName}', __widgetConfig: ${widgetConfig || '{}'} })`;
			});

			// Create a safe evaluation context
			const moduleContent = `
				const module = {};
				const exports = {};
                const resolveWidgetPlaceholder = ${resolveWidgetPlaceholder.toString()};
				(async function(module, exports) {
					${modifiedContent}
					return module.exports || exports;
				})(module, exports);
			`;

			// Create and execute the function with widgets as context
			const moduleFunc = new Function('widgets', moduleContent);
			const result = await moduleFunc(widgetProxy);

			// If result is an object with fields, it's likely our schema
			if (result && typeof result === 'object') {
				return { schema: { ...result, id: uuid } };
			}

			// If we got here, try to find a schema object in the content
			const schemaMatch = cleanedContent.match(/(?:const|let|var)\s+(\w+)\s*=\s*({[\s\S]*?});/);
			if (schemaMatch && schemaMatch[2]) {
				try {
					// Evaluate just the schema object
					const schemaFunc = new Function(`return ${schemaMatch[2]}`);
					const schema = schemaFunc();
					return { schema: { ...schema, id: uuid } };
				} catch (error) {
					logger.warn('Failed to evaluate schema object:', error);
				}
			}

			// Try to match export const/let/var schema
			const schemaExportMatch = cleanedContent.match(/(?:export\s+(?:const|let|var)\s+)?(\w+)\s*=\s*({[\s\S]*?});/);
			if (schemaExportMatch && schemaExportMatch[2]) {
				try {
					const schemaFunc = new Function(`return ${schemaExportMatch[2]}`);
					const schema = schemaFunc();
					return { schema: { ...schema, id: uuid } };
				} catch (error) {
					logger.warn('Failed to evaluate schema object:', error);
				}
			}

			// Try to match export default schema
			const schemaDefaultExportMatch = cleanedContent.match(/export\s+default\s+({[\s\S]*?});/);
			if (schemaDefaultExportMatch && schemaDefaultExportMatch[1]) {
				try {
					const schemaFunc = new Function(`return ${schemaDefaultExportMatch[1]}`);
					const schema = schemaFunc();
					return { schema: { ...schema, id: uuid } };
				} catch (error) {
					logger.warn('Failed to evaluate schema object:', error);
				}
			}

			return null;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to process module:', { error: errorMessage });
			return null;
		}
	}
	// Load and process collections with optimized batch processing
	async loadCollections(): Promise<Schema[]> {
		return this.measurePerformance(async () => {
			try {
				// If we're in the browser, fetch collections from the API
				if (browser) {
					const response = await fetch('/api/collections');
					if (!response.ok) {
						throw new Error(`Failed to fetch collections: ${response.statusText}`);
					}
					const collections = await response.json();
					this.loadedCollections = collections;
					return collections;
				}

				// Server-side collection loading
				const collections: Schema[] = [];
				const contentNodesMap = await this.getContentStructureMap();
				const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || './collections';
				const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);

				for (const filePath of files) {
					try {
						const fullFilePath = `${compiledDirectoryPath}/${filePath}`;
						const content = await this.readFile(fullFilePath);
						const moduleData = await this.processModule(content);

						if (!moduleData || !moduleData.schema) {
							logger.error(`Invalid collection file format: ${filePath}`, {
								hasModuleData: !!moduleData,
								hasSchema: !!(moduleData && moduleData.schema)
							});
							continue;
						}

						const schema = moduleData.schema as Partial<Schema>;
						if (!schema || typeof schema !== 'object') {
							logger.error(`Invalid or missing schema in ${filePath}`, {
								hasModuleData: !!moduleData,
								hasSchema: !!(moduleData && moduleData.schema)
							});
							continue;
						}

						// Ensure required fields are present
						if (!schema.fields) {
							schema.fields = [];
						}

						const name = filePath
							.split('/')
							.pop()
							?.replace(/\.(ts|js)$/, '');
						if (!name) {
							logger.error(`Could not extract name from ${filePath}`);
							continue;
						}
						const path = this.extractPathFromFilePath(filePath);
						const existingNode = contentNodesMap.get(path)

						const processed: Schema = {
							...schema,
							id: schema.id, // Always use the ID from the compiled schema
							name,
							icon: schema.icon || 'iconoir:info-empty',
							path: path,
							fields: schema.fields || [],
							permissions: schema.permissions || {},
							livePreview: schema.livePreview || false,
							strict: schema.strict || false,
							revision: schema.revision || false,
							description: schema.description || '',
							label: schema.label || name,
							slug: schema.slug || name.toLowerCase()
						};

						if (!processed.id) {
							logger.error(`Missing UUID in compiled schema for ${filePath}`);
							continue;
						}

						if (existingNode) {
							// Update node if is different
							if (existingNode.icon !== processed.icon || existingNode.order !== processed.order) {
								await dbAdapter.updateContentStructure(existingNode._id!.toString(), { icon: processed.icon, order: processed.order })
								logger.info(`Updated metadata for content node:  \x1b[34m${path}\x1b[0m`)
							}
						} else {
							//Create if not existent
							await dbAdapter.createContentStructure({
								path: processed.path,
								name: processed.name,
								icon: processed.icon || (processed.fields.length > 0 ? 'bi:file-text' : 'bi:folder'),
								order: 999,
								isCollection: processed.fields.length > 0,
								collectionId: processed.id
							})
							logger.info(`Created content node from file:  \x1b[34m${path}\x1b[0m`)
						}

						collections.push(processed);
						await this.setCacheValue(filePath, processed, this.collectionCache);
					} catch (err) {
						const errorMessage = err instanceof Error ? err.message : String(err);
						logger.error(`Failed to process module ${filePath}:`, { error: errorMessage });
						continue;
					}
				}
				// Check for orphaned nodes
				for (const [nodePath, node] of contentNodesMap) {
					const hasFile = files.some((filePath) => this.extractPathFromFilePath(filePath) === nodePath);
					if (!hasFile) {
						logger.warn(`Orphaned content node found in database:  \x1b[34m${nodePath}\x1b[0m`)
						await dbAdapter.deleteContentStructure(node._id!.toString());
						logger.info(`Deleted orphaned content node:  \x1b[34m${nodePath}\x1b[0m`);
					}
				}

				// Cache in Redis if available
				if (!browser && isRedisEnabled()) {
					await setCache('cms:all_collections', collections, REDIS_TTL);
				}
				this.loadedCollections = collections;
				return collections;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				logger.error('Failed to load collections', { error: errorMessage });
				throw new Error(`Failed to load collections: ${errorMessage}`);
			}
		}, 'Load Collections');
	}



	// Update collections with performance monitoring
	async updateCollections(recompile: boolean = false): Promise<void> {
		return this.measurePerformance(async () => {
			try {
				if (recompile) {
					// Clear both memory and Redis caches
					this.collectionCache.clear();
					this.fileHashCache.clear();
					if (!browser && isRedisEnabled()) {
						await clearCache('cms:all_collections');
					}
				}
				const cols = await this.loadCollections();
				const categoryArray = await this.createCategories();
				// Convert category array to record structure
				const categoryRecord: Record<string, CollectionData> = {};
				categoryArray.forEach((cat) => {
					categoryRecord[cat.name] = {
						id: cat.id.toString(),
						name: cat.name,
						icon: cat.icon,
						subcategories: {}
					};
				});

				const collectionRecord: Record<CollectionTypes, Schema> = {} as Record<CollectionTypes, Schema>;
				cols.forEach((col) => {
					if (col.name) {
						collectionRecord[col.name] = col;
					}
				});

				// Update stores using store.set() method
				categories.set(categoryRecord);
				collections.set(collectionRecord);
				unAssigned.set(cols.filter((x) => !Object.values(collectionRecord).includes(x)));
				collection.set({} as Schema);
				collectionValue.set({});
				mode.set('view');
				logger.info(`Collections updated successfully. Count: ${cols.length}`);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				logger.error(`Error in updateCollections: ${errorMessage}`);
				throw new Error(`Failed to update collections: ${errorMessage}`);
			}
		}, 'Update Collections');
	}
	// Create categories with optimized processing and Redis caching
	private async createCategories(): Promise<Category[]> {
		return this.measurePerformance(async () => {
			try {
				// Try getting from Redis cache first
				if (!browser && isRedisEnabled()) {
					const cachedCategories = await getCache<Category[]>('cms:categories');
					if (cachedCategories) {
						this.loadedCategories = cachedCategories;
						return cachedCategories;
					}
				}

				const categoryStructure: Record<string, CollectionData> = {};
				const collectionsList = Array.from(this.collectionCache.values()).map((entry) => entry.value);

				// Get content structure from database if available
				let contentNodes: SystemContent[] = [];
				if (!browser && dbAdapter) {
					try {

						contentNodes = await dbAdapter.getContentStructure();
						logger.debug('Content structure from database', { contentNodes });
					} catch (err) {
						logger.warn('Could not fetch content structure, proceeding with file-based structure', { error: err });
					}
				}

				// If we have content nodes in the database, use them
				if (contentNodes.length > 0) {
					// Convert database structure to category structure
					contentNodes.forEach(node => {
						if (!node.isCollection) {
							categoryStructure[node.path] = {
								id: node._id?.toString() || uuidv4(),
								name: node.name,
								icon: node.icon || 'bi:folder',
								order: node.order || 999,
								subcategories: {},
								collections: []
							};
						}
					});
				} else {
					// Process collections into category structure
					for (const collection of collectionsList) {
						if (!collection.path) {
							logger.warn(`Collection ${String(collection.name)} has no path`);
							continue;
						}

						const pathParts = collection.path.split('/');
						let currentLevel = categoryStructure;
						let currentPath = '';

						for (const [index, part] of pathParts.entries()) {
							currentPath = currentPath ? `${currentPath}/${part}` : part;
							if (!currentLevel[part]) {
								const id = uuidv4();
								currentLevel[part] = {
									id,
									name: part,
									icon: index === 0 ? 'bi:collection' : 'bi:folder',
									subcategories: {},
									order: 999,
									collections: []
								};

								// Store in database
								if (!browser && dbAdapter) {
									try {
										await dbAdapter.createContentStructure({
											path: currentPath,
											name: part,
											icon: index === 0 ? 'bi:collection' : 'bi:folder',
											order: 999,
											isCollection: false
										});
									} catch (err) {
										logger.warn('Failed to store category in database', { error: err });
									}
								}
							}

							if (index === pathParts.length - 1) {
								// This is a collection
								currentLevel[part].collections.push(collection);
								currentLevel[part].icon = collection.icon || currentLevel[part].icon;
								currentLevel[part].isCollection = true;

								// Store collection reference in database
								if (!browser && dbAdapter) {
									try {
										await dbAdapter.createContentStructure({
											_id: collection.id,
											path: currentPath,
											name: collection.name,
											icon: collection.icon || 'bi:file',
											isCollection: true
										});
									} catch (err) {
										logger.warn('Failed to store collection reference in database', { error: err });
									}
								}
							}
							currentLevel = currentLevel[part].subcategories!;
						}
					}
				}

				// Convert category structure to array format
				const processCategory = (name: string, cat: CollectionData, parentPath: string = ''): Category => {
					const currentPath = parentPath ? `${parentPath}/${name}` : name;
					const subcategories: Record<string, Category> = {};

					if (cat.subcategories) {
						Object.entries(cat.subcategories).forEach(([subName, subCat]) => {
							if (!subCat.isCollection) {
								subcategories[subName] = processCategory(subName, subCat, currentPath);
							}
						});
					}

					return {
						id: parseInt(cat.id),
						name,
						icon: cat.icon,
						collections: cat.collections || [],
						subcategories: Object.keys(subcategories).length > 0 ? subcategories : undefined
					};
				};

				const categoryArray: Category[] = Object.entries(categoryStructure)
					.filter(([, cat]) => !cat.isCollection)
					.map(([name, cat]) => processCategory(name, cat));

				// Cache in Redis if available
				if (!browser && isRedisEnabled()) {
					await setCache('cms:categories', categoryArray, REDIS_TTL);
				}

				this.loadedCategories = categoryArray;
				return categoryArray;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				logger.error('Failed to create categories', { error: errorMessage });
				throw new Error(`Failed to create categories: ${errorMessage}`);
			}
		}, 'Create Categories');
	}

	// Cache management methods with Redis support
	private async getCacheValue<T>(key: string, cache: Map<string, CacheEntry<T>>): Promise<T | null> {
		// Try Redis first if available
		if (!browser && isRedisEnabled()) {
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
		if (!browser && isRedisEnabled()) {
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
		if (!browser && isRedisEnabled()) {
			await clearCache(`cms:${key}`);
		}
		// Clear from all memory caches
		this.collectionCache.delete(key);
		this.categoryCache.delete(key);
		this.fileHashCache.delete(key);
	}
	private trimCache<T>(cache: Map<string, CacheEntry<T>>): void {
		if (cache.size > MAX_CACHE_SIZE) {
			const entriesToRemove = Array.from(cache.entries())
				.sort((a, b) => a[1].timestamp - b[1].timestamp)
				.slice(0, cache.size - MAX_CACHE_SIZE);
			entriesToRemove.forEach(([key]) => cache.delete(key));
		}
	}

	// Extract path from file path
	private extractPathFromFilePath(filePath: string): string {
		logger.debug(`Extracting path from file: ${filePath}`);
		const parts = filePath.split('/');
		
		// Remove file extension from last segment if it exists
		if (parts.length > 0) {
			parts[parts.length - 1] = parts[parts.length - 1].replace(/\.(ts|js)$/, '');
		}
		
		// Build the path for compiled collections
		const resultPath = `collections/${parts.join('/')}`;
		logger.debug(`Extracted path: ${resultPath}`);
		return resultPath;
	}
	// Get compiled collection files
	private async getCompiledCollectionFiles(compiledDirectoryPath: string): Promise<string[]> {
		if (!fs) throw new Error('File system operations are only available on the server');

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
			logger.debug('All files found recursively', { directory: compiledDirectoryPath, files: allFiles });

			// Filter the list to only include .js files that are not excluded
			const filteredFiles = allFiles.filter((file) => {
				const fileName = file.split('/').pop() || '';
				const isJsFile = fileName.endsWith('.js');
				const isExcluded = ['types.js', 'categories.js', 'index.js'].includes(fileName);
				return isJsFile && !isExcluded;
			});

			// Convert to relative paths
			return filteredFiles.map((file) => {
				const relativePath = file.replace(compiledDirectoryPath, '');
				return relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
			});
		} catch (error) {
			logger.error(`Error getting compiled collection files: ${error.message}`);
			throw error;
		}
	}
	// Read file with retry mechanism
	private async readFile(filePath: string): Promise<string> {
		if (browser) {
			// Use the new API endpoint to fetch the file content
			const response = await this.retryOperation(async () => axios.get(`/api/getCollections?fileName=${encodeURIComponent(filePath)}`));
			return response.data;
		}
		// Server-side file reading
		if (!fs) throw new Error('File system operations are only available on the server');
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
	//Get a content node map
	private async getContentStructureMap(): Promise<Map<string, SystemContent>> {
		const contentNodes = await (dbAdapter?.getContentStructure() || Promise.resolve([]));
		const contentNodesMap = new Map<string, SystemContent>();
		contentNodes.forEach(node => {
			contentNodesMap.set(node.path, node);
		})
		return contentNodesMap;
	}

	// Performance monitoring
	private async measurePerformance<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
		const start = performance.now();
		try {
			const result = await operation();
			const duration = performance.now() - start;
			logger.info(`${operationName} completed in ${duration.toFixed(2)}ms`);
			return result;
		} catch (error) {
			const duration = performance.now() - start;
			logger.error(`${operationName} failed after ${duration.toFixed(2)}ms`);
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
	private async lazyLoadCollection(name: CollectionTypes): Promise<Schema | null> {
		const cacheKey = `collection_${name}`;
		// Try getting from cache (Redis or memory)
		const cached = await this.getCacheValue(cacheKey, this.collectionCache);
		if (cached) {
			this.collectionAccessCount.set(name, (this.collectionAccessCount.get(name) || 0) + 1);
			return cached;
		}
		// Load if not cached
		const path = `config/collections/${name}.ts`;
		try {
			logger.debug(`Attempting to read file for collection: ${name} at path: ${path}`);
			const content = await this.readFile(path);
			logger.debug(`File content for collection ${name}: ${content.substring(0, 100)}...`); // Log only the first 100 characters
			const schema = await this.processCollectionFile(path, content);
			if (schema) {
				logger.debug(`Schema processed for collection ${name}:`, schema);
				await this.setCacheValue(cacheKey, schema, this.collectionCache);
				this.collectionAccessCount.set(name, (this.collectionAccessCount.get(name) || 0) + 1);
				return schema;
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to lazy load collection ${name}:`, { error: errorMessage });
			throw new Error(`Failed to lazy load collection: ${errorMessage}`);
		}
		return null;
	}
}

// Export singleton instance
export const contentManager = ContentManager.getInstance();
// Export types
export type { Schema, CollectionTypes, Category, CollectionData };