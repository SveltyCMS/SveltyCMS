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

// Types
import type { Schema, ContentTypes, Category, CollectionData } from './types';
import type { SystemContent } from '@src/databases/dbInterface';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import widgetProxy, { initializeWidgets, resolveWidgetPlaceholder } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
// Server-side imports
import fs from 'fs/promises';
import { contentStructure } from '../stores/collectionStore.svelte';

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
  private categoryCache: Map<string, CacheEntry<Category>> = new Map();
  private collectionAccessCount: Map<string, number> = new Map();
  private initialized: boolean = false;
  private loadedCollections: Schema[] = [];
  private loadedCategories: Map<string, SystemContent> = new Map();

  private dbInitPromise: Promise<void> | null = null;

  private constructor() {
    // Server-side initialization
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
      await this.measurePerformance(async () => {
        try {
          // First, ensure widgets are initialized
          await ensureWidgetsInitialized();
          logger.debug("Content manager Widgtes initialized");
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
      contentStructure: this.loadedCategories
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
        .replace(/import\s+.*?;/g, '') // Remove import statements
        .replace(/export\s+default\s+/, '') // Remove export default
        .replace(/export\s+const\s+/, 'const ') // Handle export const
        .trim();

      // Replace the global widgets before evaluating the schema
      const modifiedContent = cleanedContent.replace(
        /globalThis\.widgets\.(\w+)\((.*?)\)/g,
        (match, widgetName, widgetConfig) => {
          return `await resolveWidgetPlaceholder({ __widgetName: '${widgetName}', __widgetConfig: ${widgetConfig || '{}'} })`;
        }
      );

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
        // Server-side collection loading
        const collections: Schema[] = [];
        const contentNodesMap = await this.getContentStructureMap();
        const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
        const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);
        const extractedPaths = new Set<string>();

        for (const filePath of files) {
          try {
            // Remove compiledDirectoryPath prefix if it exists
            const relativeFilePath = filePath.startsWith(compiledDirectoryPath)
              ? filePath.substring(compiledDirectoryPath.length + 1)
              : filePath;

            const fullFilePath = `${compiledDirectoryPath}/${relativeFilePath}`;
            const content = await this.readFile(fullFilePath);
            const moduleData = await this.processModule(content);

            if (!moduleData || !moduleData.schema) {
              logger.error(`Invalid collection file format: ${relativeFilePath}`, {
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

            const filePathName = filePath
              .split('/')
              .pop()
              ?.replace(/\.(ts|js)$/, '');
            if (!filePathName) {
              logger.error(`Could not extract name from \x1b[34m${filePath}\x1b[0m`);
              continue;
            }
            const path = this.extractPathFromFilePath(filePath);

            // Log the extracted path only if it hasn't been logged before
            if (!extractedPaths.has(path)) {
              logger.debug(`Extracted path: \x1b[34m${path}\x1b[0m`);
              extractedPaths.add(path);
            }

            const existingNode = contentNodesMap.get(path);

            const processed: Schema = {
              ...schema,
              id: schema.id!, // Always use the ID from the compiled schema
              name: schema.name || filePathName,
              filePathName,
              icon: schema.icon || 'iconoir:info-empty',
              path: path,
              fields: schema.fields || [],
              permissions: schema.permissions || {},
              livePreview: schema.livePreview || false,
              strict: schema.strict || false,
              revision: schema.revision || false,
              description: schema.description || '',
              label: schema.label || filePathName,
              slug: schema.slug || filePathName.toLowerCase()
            };

            if (!processed.id) {
              logger.error(`Missing UUID in compiled schema for ${filePath}`);
              continue;
            }



            // Update node if UUID matches
            if (existingNode && existingNode._id?.toString() === processed.id) {
              await dbAdapter!.updateContentStructure(existingNode._id!.toString(), {
                icon: processed.icon,
                order: processed.order,
                name: processed.name,
                path: processed.path,
                isCollection: processed.fields.length > 0
              });
              logger.info(`Updated metadata for content: \x1b[34m${path}\x1b[0m`);
            } else {
              // Create if not existent
              await dbAdapter!.createContentStructure({
                _id: processed.id, // Use UUID as _id
                path: processed.path,
                name: processed.name,
                icon: processed.icon || (processed.fields.length > 0 ? 'bi:file-text' : 'bi:folder'),
                order: 999,
                isCollection: processed.fields.length > 0
              });
            }
            // If this is a collection, create the collection model using the _id
            if (processed.fields.length > 0) {
              try {
                const collectionName = `collection_${processed.id}`;
                logger.debug(
                  `Processing collection model for \x1b[34m${processed.name}\x1b[0m with ID \x1b[34m${processed.id}\x1b[0m`
                );

                const collectionConfig = {
                  id: processed.id,
                  name: processed.name,
                  schema: {
                    fields: processed.fields,
                    strict: processed.strict,
                    revision: processed.revision,
                    livePreview: processed.livePreview
                  }
                };

                await dbAdapter!.createCollectionModel(collectionConfig);
                logger.info(`Collection model \x1b[34m${collectionName}\x1b[0m is ready`);
              } catch (err) {
                logger.error(
                  `Failed to process collection model for \x1b[34m${processed.name}\x1b[0m:`,
                  err instanceof Error ? err.stack : err
                );
                logger.error(`Collection data that caused error:`, JSON.stringify(processed, null, 2));
              }
            }

            logger.info(`Created content node from file:  \x1b[34m${path}\x1b[0m`);


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
            logger.warn(`Orphaned content node found in database: \x1b[34m${nodePath}\x1b[0m`);
            await dbAdapter!.deleteContentStructure(node._id!.toString());
            logger.info(`Deleted orphaned content node: \x1b[34m${nodePath}\x1b[0m`);
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
    }, 'Update Collections');
  }

  public async getCollection(path: string): Promise<Schema> {
    return this.measurePerformance(async () => {
      try {

        if (!this.initialized) {
          logger.error('Content Manager not initialized');
        }

        const collection_uuid = this.loadedCategories.get(path)?.id;

        const collection = this.loadedCollections.find((collection) => collection.id == collection_uuid?.toString());

        if (!collection) {
          throw new Error(`Collection not found in getCollection: ${path}`);
        }

        return collection;

      } catch (error) {

        logger.error('Error getting collection', error);
        throw error;

      }
    }, "Get Collection");
  }

  // Create categories with optimized processing and Redis caching
  private async createCategories(): Promise<void> {
    this.measurePerformance(async () => {
      try {
        // Try getting from Redis cache first
        if (isRedisEnabled()) {
          const cachedCategories = await getCache<Map<string, SystemContent>>('cms:categories');
          if (cachedCategories) {
            this.loadedCategories = new Map(Object.entries(cachedCategories));
            return cachedCategories;
          }
        }

        const categoryStructure: Record<string, CollectionData> = {};
        const collectionsList = Array.from(this.collectionCache.values()).map((entry) => entry.value);

        // Get content structure from database if available
        let contentNodes: SystemContent[] = [];
        if (dbAdapter) {
          try {
            contentNodes = await dbAdapter.getContentStructure();


          } catch (err) {
            logger.warn('Could not fetch content structure, proceeding with file-based structure', { error: err });
          }
        }

        // If we have content nodes in the database, use them
        if (contentNodes.length > 0) {
          // Convert database structure to category structure
          contentNodes.forEach((node) => {
            categoryStructure[node.path] = {

              id: node._id?.toString() || '',
              path: node.path,
              name: node.name,
              icon: node.icon || 'bi:folder',
              order: node.order || 999,
              isCollection: node.isCollection,
              subcategories: {},
              collections: []
            };
          }
          );

        } else {
          // Process collections into category structure
          logger.debug("Processing collections into category structure");
          if (!dbAdapter) {
            logger.error("No dbAdapter");
            throw new Error("Databse Adapter not initialized");
          }

          for (const collection of collectionsList) {
            if (!collection.path) {
              logger.warn(`Collection \x1b[34m${String(collection.name)}\x1b[0m has no path`);
              continue;
            }

            const pathParts = collection.path.split('/');
            let currentLevel = categoryStructure;
            let currentPath = '';



            for (const [index, part] of pathParts.entries()) {
              currentPath = currentPath ? `${currentPath}/${part}` : part;



              if (!currentLevel[part]) {
                const id = '';
                if (!id) {
                  continue;
                }
                currentLevel[part] = {

                  name: part,
                  icon: index === 0 ? 'bi:collection' : 'bi:folder',
                  subcategories: {},
                  order: 999,
                  collections: []
                };

                // Store in database
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

              if (index === pathParts.length - 1) {
                // This is a collection
                currentLevel[part].collections.push(collection);
                currentLevel[part].icon = collection.icon || currentLevel[part].icon;
                currentLevel[part].isCollection = true;


                // Store collection reference in database
                try {
                  logger.debug("Creating collection strucure reference in database");
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
              logger.debug(index, part, currentLevel);
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



        this.loadedCategories = new Map(Object.entries(categoryStructure));

        // Cache in Redis if available

        if (isRedisEnabled()) {
          await setCache('cms:categories', contentStructure, REDIS_TTL);
        }


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
      const entriesToRemove = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, cache.size - MAX_CACHE_SIZE);
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
export type { Schema, ContentTypes, Category, CollectionData };
