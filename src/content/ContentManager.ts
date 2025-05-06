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

import { dbAdapter } from '@src/databases/db';
import fs from 'fs/promises';
import path from 'path';

import { v4 as uuidv4 } from 'uuid';

// Types
import type { Schema, ContentTypes, Category, CollectionData, ContentNodeOperation } from './types';
import type { ContentNode } from '@src/databases/dbInterface'; // Commented out unused import

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
import { ensureWidgetsInitialized } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
import { constructContentPaths, generateCategoryNodesFromPaths, processModule } from './utils';
import { compile } from '../routes/api/compile/compile';

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

  // Wait for initialization to complete
  async waitForInitialization(): Promise<void> {
    // if (this.dbInitPromise) {
    //   await this.dbInitPromise;
    // }
  }

  // Initialize the collection manager
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    logger.debug('Initializing ContentManager...');

    try {
      // First, ensure widgets are initialized
      await ensureWidgetsInitialized();

      // Then load collections
      await this.waitForInitialization();

      await this.updateCollections(true);
      logger.debug('Content Manager Collections updated');
      this.initialized = true;
    } catch (error) {
      logger.error('Initialization failed:', error);
      throw error;
    }
  }

  public async getCollectionData() {
    if (!this.initialized) {
      await this.initialize();
    }
    return {
      collectionMap: this.collectionMapId,
      contentStructure: this.contentStructure
    };
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
          const moduleData = await processModule(content);

          if (!moduleData?.schema) continue;

          const schema = moduleData.schema as Schema;
          const filePathName = filePath
            .split('/')
            .pop()
            ?.replace(/\.(ts|js)$/, '');
          if (!filePathName) continue;

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



          // The function only creates models during first run 
          const model = await dbAdapter?.collection.createModel(processed as CollectionData);
          if (!model) logger.error(`Database model creation for  ${schema.name} ${schema.path} Failed`)

          else {
            if (!this.firstCollection) this.firstCollection = processed;
            collections.push(processed);
            this.collectionMapId.set(schema._id, processed);

          }


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
      logger.debug('Content Manager Collections loaded');
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
      await this.updateContentStructure();
      logger.info('Collections updated successfully');
      // Convert category array to record structure
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Error in updateCollections: ${errorMessage}`);
      throw new Error(`Failed to update collections: ${errorMessage}`);
    }
  }

  public getCollectionById(id: string): Schema | null {
    try {
      if (!this.initialized) {
        logger.error('Content Manager not initialized');
        return null;
      }
      const collection = this.collectionMapId.get(id);
      if (!collection) {
        logger.error(`Content with id: ${id} not found`);
        return null;
      }
      return collection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in getCollectionById: ${errorMessage}`);
      throw error;
    }
  }

  public getFirstCollection(): Schema | null {
    try {
      return this.firstCollection;
    }
    catch (error) {
      logger.error(`Error in getFirstCollection: ${error}`);
      throw error;
    }
  }

  public async getCollection(path: string): Promise<(Schema & { module: string | undefined }) | null> {
    try {
      if (!this.initialized) {
        logger.error('Content Manager not initialized');
      }

      const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
      const collectionFile = await this.readFile(`${compiledDirectoryPath}/${path}.js`);

      const schema = this.collectionMapId.get(this.collectionMapPath.get(path)!._id);

      if (!schema || !collectionFile) throw new Error('Collection not found');

      return { module: collectionFile, ...schema };
    } catch (error) {
      logger.error('Error getting collection', error);
      throw error;
    }
  }


  public async upsertContentNodes(nodes: ContentNodeOperation[]) {
    try {

      const newNodes = [];
      const idSet = new Set<string>(nodes.map(node => node.node._id));
      const filteredNodes = this.contentStructure.filter(node => !idSet.has(node._id))

      const collectionPath = import.meta.env.userCollectionsPath;

      for (const operation of nodes) {
        const node = operation.node
        const oldNode = this.contentNodeMap.get(node._id)

        const result = await dbAdapter?.content.nodes.upsertContentStructureNode(node);
        if (!result?.success) throw new Error(`Failed to update content structure ${operation.node.name}`);
        newNodes.push(result.data)


        if (operation.type === 'create') {
          // create file/folder
          const parent = this.contentNodeMap.get(operation.node.parentId ?? "") ?? null
          const newPath = path.join(parent?.path ?? "/", node.name)
          await fs.mkdir(`${collectionPath}/${newPath}`, { recursive: true });
          this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath })

        }


        if (!oldNode) continue
        if (operation.type === 'rename') {
          // rename file/folder

          const newPath = path.join(oldNode.path.split('/').slice(0, -1).join('/'), node.name)
          const fileName = node.nodeType === 'collection' ? `${collectionPath}/${newPath}.ts` : `${collectionPath}/${newPath}`
          const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`

          await fs.rename(oldFileName, fileName);

          this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath })
          this.collectionMapPath.set(`/${newPath}`, { ...result.data })

        }

        else if (operation.type === 'move') {
          // move file/folder
          //


          if (!operation.node.parentId) {
            const fileName = node.nodeType === 'collection' ? `${collectionPath}/${node.name}.ts` : `${collectionPath}/${node.name}`
            const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`

            await fs.rename(oldFileName, fileName);

            this.contentNodeMap.set(result.data._id, { ...result.data, path: `/${node.name}` })
            this.collectionMapPath.set(`/${node.name}`, { ...result.data })
            continue

          }

          const newParent = this.contentNodeMap.get(operation.node.parentId) ?? null
          if (!newParent) throw new Error('Parent not found')

          const newPath = path.join(newParent.path, node.name)
          const fileName = node.nodeType === 'collection' ? `${collectionPath}/${newPath}.ts` : `${collectionPath}/${newPath}`
          const oldFileName = node.nodeType === 'collection' ? `${collectionPath}/${oldNode.path}.ts` : `${collectionPath}/${oldNode.path}`

          await fs.rename(oldFileName, fileName);
          this.contentNodeMap.set(result.data._id, { ...result.data, path: newPath })
          this.collectionMapPath.set(`/${node.name}`, { ...result.data })
        }

        else if (operation.type === 'delete') {
          // delete file/folder
          await fs.unlink(`${collectionPath}/${oldNode.path}`)
          this.contentNodeMap.delete(oldNode._id)
          this.collectionMapPath.delete(oldNode.path)
        }

      }

      this.contentStructure = [...filteredNodes, ...newNodes]
      await compile()
      // await this.loadCollections()
      return this.contentStructure


    } catch (error) {

      logger.error('Error upserting content node', error);
      throw error;
    }

  }


  // Create categories with Redis caching
  private async updateContentStructure(): Promise<void> {
    try {
      if (!dbAdapter) throw new Error('Database adapter not initialized');

      const result = await dbAdapter.content.nodes.getStructure('flat');
      if (!result.success) logger.debug(`Failed retrieve contentNodes`);
      const structure = result.success ? result.data : [];

      this.contentStructure = []

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
          _id: oldNode?._id ?? uuidv4(),
          name: node.name ?? oldNode?.name,
          icon: oldNode?.icon ?? 'bi:folder',
          order: oldNode?.order ?? 999,
          nodeType: 'category',
          parentId: !parentPath ? undefined : contentStructure[parentPath]?._id.toString() ?? undefined,
          translations: oldNode?.translations ?? []
        });
        if (!result.success) {
          throw new Error('Failed to update category');
        }
        const currentCategoryNode = result.data;
        contentStructure[node.path] = currentCategoryNode;
        this.contentStructure.push(currentCategoryNode);
        this.contentNodeMap.set(currentCategoryNode._id, { ...currentCategoryNode, path: node.path })
      }




      for (const collection of this.loadedCollections) {
        if (!collection.path) {
          logger.warn(`Collection ${collection.name} has no path`);
          continue;
        }

        const oldNode = contentStructure[collection.path];
        if (oldNode) logger.warn(`Collection ${collection.name} Node already exists. Updating Node`);

        const parentPath = collection.path === '/' ? null : collection.path.split('/').slice(0, -1).join('/') || '/';

        const result = await dbAdapter?.content.nodes.upsertContentStructureNode({
          _id: oldNode?._id ?? collection._id,
          name: collection.name as string,
          icon: collection.icon ?? oldNode?.icon ?? 'bi:file',
          order: oldNode?.order ?? 999,
          nodeType: 'collection',
          parentId: parentPath !== null ? contentStructure[parentPath]?._id.toString() ?? undefined : undefined,
          translations: collection.translations ?? oldNode?.translations ?? []
        });
        if (!result.success) {
          throw new Error('Failed to update collection');
        }
        const currentNode = result.data;
        contentStructure[collection.path] = currentNode;
        this.contentStructure.push(currentNode);
        this.collectionMapPath.set(collection.path, currentNode);
        this.contentNodeMap.set(currentNode._id, { ...currentNode, path: collection.path })

      }

      logger.debug('Content Manager SysContentStructure loaded');
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

// Export singleton instance
export const contentManager = ContentManager.getInstance();

// Export types
export type { Schema, ContentTypes, Category, CollectionData };
