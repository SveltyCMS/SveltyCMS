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
// Utils
import { v4 as uuidv4 } from 'uuid';
// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
// Stores
import { categories, collections, unAssigned, collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';

import widgets, { initializeWidgets } from '@components/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
// Server-side imports
let fs: typeof import('fs/promises') | null = null;
let path: typeof import('path') | null = null;
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import type { SystemContent } from '@src/databases/dbInterface';

if (!browser) {
	const imports = await Promise.all([import('fs/promises'), import('path')]);
	[fs, path] = imports;
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
let widgetsInitPromise: Promise<void> | null = null;
async function ensureWidgetsInitialized() {
	if (widgetsInitialized) return;
	if (!widgetsInitPromise) {
		widgetsInitPromise = initializeWidgets().then(() => {
			widgetsInitialized = true;
			logger.info('Widgets initialized successfully');
		}).catch((error) => {
			logger.error('Failed to initialize widgets:', error);
			throw error;
		});
	}
	await widgetsInitPromise;
}
class ContentManager {
	private static instance: ContentManager | null = null;
	private collectionCache: Map<string, CacheEntry<Schema>> = new Map();
	private fileHashCache: Map<string, CacheEntry<string>> = new Map();
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

	// Process module content
	private async processModule(content: string): Promise<{ schema?: Partial<Schema> } | null> {
		try {
			// Ensure widgets are initialized before processing module
			await ensureWidgetsInitialized();
			// Check if the content is already in ES module format
			const isESModule = content.includes('export') || content.includes('import');
			// Create the module wrapper
			const moduleWrapper = isESModule
				? `
					let exports = {};
					${content}
					return { exports, schema: exports.default || exports };
				`
				: `
					let exports = {};
					const module = { exports };
					${content}
					return { exports: module.exports, schema: module.exports };
				`;
			// Create a module from the content using Function constructor
			const moduleFunc = new Function(
				'widgets',
				moduleWrapper
			);
			// Pass the widgets object when executing the function
			const result = moduleFunc(widgets);
			// Handle both ES modules and CommonJS modules
			return {
				schema: result.schema || result.exports.default || result.exports
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to process module:', { error: errorMessage });
			return null;
		}
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
	// Get collection and category data
	getCollectionData() {
		return {
			collections: this.loadedCollections,
			categories: this.loadedCategories
		};
	}

	// Load and process collections with optimized batch processing
	async loadCollections(): Promise<Schema[]> {
		return this.measurePerformance(async () => {
			try {
				const collections: Schema[] = [];
				const contentNodesMap = await this.getContentNodesMap();
				const moduleEntries = Array.from(contentNodesMap.entries());

				if (dev) {
					// Use dynamic imports instead of eager loading
					const modules = await import.meta.glob('/config/collections/**/*.ts', { eager: true });

					// Filter and process modules
					const moduleEntries = Object.entries(modules)
						.filter(([path]) => {
							const fileName = path.split('/').pop() || '';
							return !EXCLUDED_FILES.includes(fileName);
						})
						.sort(([pathA], [pathB]) => {
							const countA = this.collectionAccessCount.get(pathA) || 0;
							const countB = this.collectionAccessCount.get(pathB) || 0;
							return countB - countA;
						});

					for (const [filePath, moduleContent] of moduleEntries) {
						try {
							// Extract schema from module content
							const moduleSchema = moduleContent as { schema?: Partial<Schema> };
							const schema = moduleSchema?.schema;

							if (!schema || typeof schema !== 'object') {
								logger.error(`Invalid or missing schema in ${filePath}`, {
									hasModuleData: !!moduleContent,
									hasSchema: !!(moduleContent && moduleContent.schema)
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
								id: schema.id || uuidv4(), // Only create new ID if one doesn't exist
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

							if (existingNode) {
								// Update node if is different
								if (existingNode.icon !== processed.icon || existingNode.order !== processed.order) {
									await dbAdapter.updateContentNode(existingNode._id!.toString(), { icon: processed.icon, order: processed.order })
									logger.info(`Updated metadata for content node:  \x1b[34m${path}\x1b[0m`)
								}
							} else {
								//Create if not existent
								await dbAdapter.createContentNode({
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
				} else {
					// Production mode implementation
					if (typeof window !== 'undefined') {
						const response = await this.retryOperation(async () => axios.get('/api/collections?action=structure'));
						const data = response.data;
						if (data && Array.isArray(data.collections)) {
							collections.push(...data.collections);
							for (const col of data.collections) {
								await this.setCacheValue(col.path || col.name, col, this.collectionCache);
							}
						} else {
							throw new Error('Invalid response from collections API');
						}
					} else {
						// Server-side compilation
						const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || './collections';
						const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);
						for (const filePath of files) {
							const fullFilePath = path!.join(compiledDirectoryPath, filePath);
							const content = await this.readFile(fullFilePath);
							const schema = await this.processCollectionFile(filePath, content);
							if (schema) {
								collections.push(schema);
								await this.setCacheValue(filePath, schema, this.collectionCache);
							}
						}
					}
					// Check for orphaned nodes
					for (const [nodePath, node] of contentNodesMap) {
						const hasFile = moduleEntries.some(([filePath]) => this.extractPathFromFilePath(filePath) === nodePath);
						if (!hasFile) {
							logger.warn(`Orphaned content node found in database:  \x1b[34m${nodePath}\x1b[0m`)
							await dbAdapter.deleteContentNode(node._id!.toString());
							logger.info(`Deleted orphaned content node:  \x1b[34m${nodePath}\x1b[0m`);
						}
					}


					// Cache in Redis if available
					if (!browser && isRedisEnabled()) {
						await setCache('cms:all_collections', collections, REDIS_TTL);
					}
					this.loadedCollections = collections;
					return collections;
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				logger.error('Failed to load collections', { error: errorMessage });
				throw new Error(`Failed to load collections: ${errorMessage}`);
			}
		}, 'Load Collections');
	}

	// Process collection file with improved error handling
	private async processCollectionFile(filePath: string, content: string): Promise<Schema | null> {
		try {
			// Process the module content
			const moduleData = await this.processModule(content);

			if (!moduleData || !moduleData.schema) {
				logger.error(`Invalid collection file format: ${filePath}`, {
					hasModuleData: !!moduleData,
					hasSchema: !!(moduleData && moduleData.schema)
				});
				return null;
			}
			// Extract the name from the file path
			const name = filePath
				.split('/')
				.pop()
				?.replace(/\.(ts|js)$/, '');

			if (!name) {
				logger.error(`Could not extract name from ${filePath}`);
				return null;
			}

			// Create the processed schema with proper type checking
			const baseSchema = moduleData.schema as Partial<Schema>;

			// Process fields to resolve widget placeholders
			const processedFields = await Promise.all((baseSchema.fields || []).map(async (field) => {
				if (field && typeof field === 'object' && '__isWidgetPlaceholder' in field) {
					// This is a widget placeholder, resolve it
					try {
						return await resolveWidgetPlaceholder(field as WidgetPlaceholder);
					} catch (error) {
						logger.error(`Failed to resolve widget placeholder in ${filePath}:`, error);
						return null;
					}
				}
				return field;
			}));
			// Filter out any null fields from failed widget resolutions
			const validFields = processedFields.filter((field): field is NonNullable<typeof field> => field !== null);


			const processedSchema: Schema = {
				id: baseSchema.id || uuidv4(), // Only create new ID if one doesn't exist
				name: name,
				label: baseSchema.label || name,
				slug: baseSchema.slug || name.toLowerCase(),
				icon: baseSchema.icon || 'iconoir:info-empty',
				description: baseSchema.description || '',
				strict: baseSchema.strict || false,
				revision: baseSchema.revision || false,
				path: filePath,
				permissions: baseSchema.permissions || {},
				livePreview: baseSchema.livePreview || false,
				fields: validFields
			};

			// Create the MongoDB model for this collection
			if (!browser && dbAdapter) {
				await dbAdapter.createCollectionModel(processedSchema);
			}
			return processedSchema;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to process collection file ${filePath}:`, { error: errorMessage });
			return null;
		}
	}
	// Extract path from file path
	private extractPathFromFilePath(filePath: string): string {
		const parts = filePath.split('/');
		const collectionsIndex = parts.findIndex((part) => part === 'collections' || part === 'config/collections');
		if (collectionsIndex === -1) return '';

		// Get all parts after 'collections'
		const pathSegments = parts.slice(collectionsIndex + 1);
		// Remove file extension from last segment
		pathSegments[pathSegments.length - 1] = pathSegments[pathSegments.length - 1].replace(/\.(ts|js)$/, '');
		// Build the path maintaining the full hierarchy
		return pathSegments.join('/');
	}

	// Get compiled collection files
	private async getCompiledCollectionFiles(compiledDirectoryPath: string): Promise<string[]> {
		if (!fs) throw new Error('File system operations are only available on the server');
		// Helper function to recursively get all files
		const getAllFiles = async (dir: string): Promise<string[]> => {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			const files = await Promise.all(
				entries.map(async (entry) => {
					const fullPath = path!.join(dir, entry.name);
					return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
				})
			);
			return files.flat();
		};
		const allFiles = await getAllFiles(compiledDirectoryPath);
		logger.debug('All files found recursively', { directory: compiledDirectoryPath, files: allFiles });
		// Filter the list to only include .js files that are not excluded
		const filteredFiles = allFiles.filter((file) => {
			const isJSFile = path?.extname(file) === '.js';
			const fileName = path?.basename(file);
			const isNotExcluded = !['types.js', 'categories.js', 'index.js'].includes(fileName!);
			return isJSFile && isNotExcluded;
		});
		return filteredFiles.map((file) => path!.relative(compiledDirectoryPath, file)) ?? [];
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

						contentNodes = await dbAdapter.getContentNodes();
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
										const ContentStructureModel = mongoose.model('ContentStructure', contentStructureSchema);
										await ContentStructureModel.create({
											_id: new mongoose.Types.ObjectId(id),
											name: part,
											path: currentPath,
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
										const ContentStructureModel = mongoose.model('ContentStructure', contentStructureSchema);
										await ContentStructureModel.create({
											_id: new mongoose.Types.ObjectId(),
											name: collection.name,
											path: currentPath,
											icon: collection.icon || 'bi:file',
											isCollection: true,
											collectionId: collection.id
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
}
// Export singleton instance
export const contentManager = ContentManager.getInstance();
// Export types
export type { Schema, CollectionTypes, Category, CollectionData };