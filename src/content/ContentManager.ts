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

import { dbAdapter, dbInitPromise } from '@src/databases/db';
import fs from 'fs/promises';
import { publicEnv } from '@root/config/public';


// Types
import type { Schema, ContentTypes, Category, CollectionData } from './types';
import type { SystemContent } from '@src/databases/dbInterface';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import widgetProxy, { initializeWidgets, resolveWidgetPlaceholder } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';

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
			globalThis.widgets = widgetProxy;
			widgetsInitialized = true;
			logger.debug('Widgets initialized successfully');
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
	private contentStructureCache: Map<string, CacheEntry<Category>> = new Map();
	private collectionAccessCount: Map<string, number> = new Map();
	private initialized: boolean = false;
	private loadedCollections: Schema[] = [];
	private contentStructure: Record<string, Category> = {};
	private dbInitPromise: Promise<void> | null = null;

	private constructor() {
		this.dbInitPromise = dbInitPromise;
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
  public async initialize(): Promise<void> {
    logger.debug("Initializing ContentManager...");
    if (this.initialized) return;

    try {
      // First, ensure widgets are initialized
      await ensureWidgetsInitialized();
      logger.debug("Content manager Widgets initialized");
      // Then load collections
      await this.waitForInitialization();
      logger.debug("Content Manager Db initialized");
      await this.updateCollections(true);
      logger.debug("Content Manager Collections updated");
      this.initialized = true;
    } catch (error) {
      logger.error('Initialization failed:', error);
      throw error;
    }
  }

	// Get collection and category data
	getCollectionData() {
		return {
			collections: this.loadedCollections,
			contentStructure: this.contentStructure
		};
	}

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
				.replace(/import\s+.*?;/g, '') // Remove import statements
				.replace(/export\s+default\s+/, '') // Remove export default
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
					return { schema: { ...schema, _id: uuid } };
				} catch (error) {
					logger.warn('Failed to evaluate schema object:', error);
				}
			}

			// Try to extract default export
			const defaultExportMatch = content.match(/export\s+default\s+({[\s\S]*?});/);
			if (defaultExportMatch && defaultExportMatch[1]) {
				try {
					const schema = new Function(`return ${defaultExportMatch[1]}`)();
					if (schema && typeof schema === 'object' && Array.isArray(schema.fields)) {
						return {
							schema: {
								...schema,
								_id: uuid
							}
						};
					}
				} catch (error) {
					logger.error('Failed to parse default export:', error);
				}
			}

			// If we get here, log the error with more context
			logger.error('Failed to parse collection file', {
				content: content.substring(0, 500) // Log first 500 chars for debugging
			});
			return null;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error('Failed to process module:', { error: errorMessage });
			return null;
		}
	}

      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to process module:', { error: errorMessage });
      return null;
    }
  }

  // Load collections
  private async loadCollections(): Promise<Schema[]> {
    try {
      // Server-side collection loading
      const collections: Schema[] = [];
      const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
      const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);

      for (const filePath of files) {
        try {
          const content = await this.readFile(filePath);
          const moduleData = await this.processModule(content);

          if (!moduleData?.schema) continue;

          const schema = moduleData.schema as Schema;
          const filePathName = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '');
          if (!filePathName) continue;

          const path = this.extractPathFromFilePath(filePath);

          const processed: Schema = {
            ...schema,
            id: schema.id!, // Always use the ID from the compiled schema
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

          collections.push(processed);
          await this.setCacheValue(filePath, processed, this.collectionCache);
        } catch (err) {
          logger.error(`Failed to process file ${filePath}:`, err);
          continue;
        }
      }

      // Cache in Redis if available
      if (isRedisEnabled()) {
        await setCache('cms:all_collections', collections, REDIS_TTL);
      }

      this.loadedCollections = collections;
      return collections;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load collections', { error: errorMessage });
      throw new Error(`Failed to load collections: ${errorMessage}`);
    }
  }

  // Update collections  
  async updateCollections(recompile: boolean = false): Promise<void> {
    try {
      if (recompile) {
        // Clear both memory and Redis caches
        this.collectionCache.clear();
        this.fileHashCache.clear();
        if (isRedisEnabled()) {
          await clearCache('cms:all_collections');
        }
      }
      await this.loadCollections();
      await this.createCategories();
      logger.info('Collections updated successfully');
      // Convert category array to record structure
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Error in updateCollections: ${errorMessage}`);
      throw new Error(`Failed to update collections: ${errorMessage}`);
    }
  }

  public async getCollection(path: string): Promise<Schema | undefined> {
    try {
      if (!this.initialized) {
        logger.error('Content Manager not initialized');
      }

      const pathParts = path.split('/').filter(Boolean);
      let current = this.contentStructure;

      for (const part of pathParts) {
        if (!current[part]) return undefined;

        if (current[part].collections.length > 0) {
          return current[part].collections[0];
        }

        current = current[part].subcategories!;
      }

      return undefined;
    } catch (error) {
      logger.error('Error getting collection', error);
      throw error;
    }
  }

  // Create categories with Redis caching
  private async createCategories(): Promise<void> {
    try {
      const structure: Record<string, Category> = {};

      for (const collection of this.loadedCollections) {
        if (!collection.path) {
          logger.warn(`Collection ${collection.name} has no path`);
          continue;
        }

        const pathParts = collection.path.split('/').filter(Boolean);
        let currentLevel = structure;
        let currentPath = '';

        for (const [index, part] of pathParts.entries()) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          if (!currentLevel[part]) {
            const category: Category = {
              _id: crypto.randomUUID(),
              id: crypto.randomUUID(),
              name: part,
              icon: index === pathParts.length - 1 ? collection.icon || 'bi:file' : 'bi:folder',
              path: currentPath,
              order: 999,
              isCollection: index === pathParts.length - 1,
              collections: [],
              subcategories: new Map(),
              collectionConfig: {},
              updatedAt: new Date(),
              createdAt: new Date(),
              __v: 0
            };

            currentLevel[part] = category;

            // Save to database
            await dbAdapter?.createContentStructure({
              _id: category.id,
              path: currentPath,
              name: part,
              icon: category.icon,
              isCollection: category.isCollection,
              collections: category.collections,
              subcategories: category.subcategories,
            });
          }

          if (index === pathParts.length - 1) {
            // This is a collection
            currentLevel[part].collections.push(collection);
          } else {
            currentLevel = currentLevel[part].subcategories!;
          }
        }
      }

      this.contentStructure = structure;

      // Cache in Redis if available
      if (isRedisEnabled()) {
        await setCache('cms:categories', structure, REDIS_TTL);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to create categories', { error: errorMessage });
      throw new Error(`Failed to create categories: ${errorMessage}`);
    }
  }

  // Generate nested JSON structure
  public async generateNestedJson(): Promise<Record<string, any>> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const buildNestedStructure = (category: Category): Record<string, any> => {
        const nestedStructure: Record<string, any> = {
          id: category.id,
          name: category.name,
          icon: category.icon,
          path: category.path,
          isCollection: category.isCollection,
          collections: category.collections,
          subcategories: {},
        };

        if (category.subcategories) {
          for (const [key, subcategory] of Object.entries(category.subcategories)) {
            nestedStructure.subcategories[key] = buildNestedStructure(subcategory);
          }
        }

        return nestedStructure;
      };

      const nestedJson: Record<string, any> = {};
      for (const [key, category] of Object.entries(this.contentStructure)) {
        nestedJson[key] = buildNestedStructure(category);
      }

      return nestedJson;
    } catch (error) {
      logger.error('Error generating nested JSON:', error);
      throw error;
    }
  }


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
    this.categoryCache.delete(key);
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
        clearCache(keysToClear).catch(err => {
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
    const relativePath = filePath.startsWith(compiledCollectionsPath)
      ? filePath.substring(compiledCollectionsPath.length)
      : filePath;

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
      logger.debug('All files found recursively', {
        Categories: compiledDirectoryPath,
        Collections: allFiles.filter((file) => file.endsWith('.js'))
      });

      // Filter the list to only include .js files
      const filteredFiles = allFiles.filter((file) => file.endsWith('.js'));

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
  public async getContentStructureMap(): Promise<Map<string, SystemContent>> {
    const contentNodes = await (dbAdapter?.getContentStructure() || Promise.resolve([]));
    const contentNodesMap = new Map<string, SystemContent>();
    contentNodes.forEach((node) => {
      contentNodesMap.set(node.path, node);
    });

    return contentNodesMap;
  }

  // Performance monitoring
  private async measurePerformance<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      logger.info(`${operationName} completed in \x1b[32m${duration.toFixed(2)}ms\x1b[0m`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      logger.error(`${operationName} failed after \x1b[34m${duration.toFixed(2)}ms\x1b[0m`);
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
      this.collectionAccessCount.set(name, (this.collectionAccessCount.get(name) || 0) + 1);
      return cached;
    }
    // Load if not cached
    const path = `config/collections/${name}.ts`;
    try {
      logger.debug(`Attempting to read file for collection: \x1b[34m${name}\x1b[0m at path: \x1b[33m${path}\x1b[0m`);
      const content = await this.readFile(path);
      logger.debug(`File content for collection \x1b[34m${name}\x1b[0m: ${content.substring(0, 100)}...`); // Log only the first 100 characters
      const schema = await this.processCollectionFile(path, content);
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
export type { Schema, ContentTypes, Category, CollectionData };

