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

import { v4 as uuidv4 } from 'uuid';

// Types
import type { Schema, ContentTypes, Category, CollectionData } from './types';
import type { CollectionModel, ContentStructureNode, SystemContent } from '@src/databases/dbInterface';

import { processModule } from './utils';

// Redis
// Removed clearCache as it was unused
import { isRedisEnabled, getCache, setCache } from '@src/databases/redis';

// Widgets - Ensure initialized *before* DB is needed if possible, or handle dependency
import { ensureWidgetsInitialized } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';

interface CacheEntry<T> {
	value: T;
	timestamp: number;
}

// Constants
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes (Memory)
const REDIS_TTL = 300; // 5 minutes in seconds (Redis)
const MAX_CACHE_SIZE = 100; // Max items in memory cache

class ContentManager {
	private static instance: ContentManager | null = null;

	// Caches
	private collectionCache: Map<string, CacheEntry<Schema>> = new Map(); // Cache Schema by ID or path? Using ID now.
	private fileHashCache: Map<string, CacheEntry<string>> = new Map();
	private contentStructureCache: Map<string, CacheEntry<Category>> = new Map(); // Consider if this is needed alongside contentStructure

	// State
	private initialized: boolean = false;
	private initializing: boolean = false; // Prevent concurrent initializations

	// Loaded Data
	private loadedCollections: Schema[] = []; // Raw loaded schemas
	private collectionModels: Map<string, CollectionModel> = new Map(); // DB Models by Collection _id
	private collectionMap: Map<string, Schema> = new Map(); // Schema lookup by Collection _id
	private contentStructure: Record<string, ContentStructureNode> = {}; // Flat structure lookup by path
	private nestedContentStructure: ContentStructureNode[] = []; // Hierarchical structure

	static getInstance(): ContentManager {
		if (!ContentManager.instance) {
			ContentManager.instance = new ContentManager();
		}
		return ContentManager.instance;
	}

	// --- Initialization ---

	/**
	 * Waits for the main database initialization promise to resolve.
	 * This is crucial to ensure dbAdapter is ready before use.
	 */
	private async waitForDbInitialization(): Promise<void> {
		// dbInitPromise is imported from db.ts
		if (dbInitPromise) {
			logger.debug('ContentManager waiting for dbInitPromise...');
			try {
				await dbInitPromise;
				logger.debug('ContentManager detected dbInitPromise resolved.');
				// After the promise resolves, dbAdapter *should* be initialized by db.ts
				if (!dbAdapter) {
					logger.error('CRITICAL: dbAdapter is null even after dbInitPromise resolved!');
					throw new Error('Database adapter failed to become available.');
				}
			} catch (error) {
				logger.error('Error occurred while waiting for dbInitPromise:', error);
				throw error; // Re-throw to halt ContentManager initialization
			}
		} else {
			// This signifies a fundamental loading order issue if db.ts hasn't exported the promise yet.
			logger.error('CRITICAL: dbInitPromise was not available when ContentManager needed it.');
			// Adding a small delay and recheck is unlikely to help if the import itself failed or module evaluation order is wrong.
			await new Promise((resolve) => setTimeout(resolve, 300)); // Small delay, then recheck
			if (!dbInitPromise) {
				throw new Error('Database initialization promise (dbInitPromise) could not be accessed.');
			} else {
				await this.waitForDbInitialization(); // Retry waiting
			}
		}
	}

	// Initializes the ContentManager. Waits for DB, loads collections, builds structure.
	public async initialize(): Promise<void> {
		if (this.initialized) {
			logger.debug('ContentManager already initialized.');
			return;
		}
		if (this.initializing) {
			logger.debug('ContentManager initialization already in progress. Waiting...');
			// Simple wait loop - consider a more robust promise-based approach if needed
			while (this.initializing) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			logger.debug('ContentManager initialization finished by other process.');
			return; // Return if already initialized by the other process
		}

		this.initializing = true;
		logger.debug('Initializing ContentManager...');

		try {
			// 1. Initialize Widgets (if they don't depend on DB collections yet)
			//    If widgets *do* depend on collections, this needs careful ordering.
			logger.debug('Ensuring widgets are initialized...');
			await ensureWidgetsInitialized();
			logger.debug('Widgets initialized.');

			// 2. *** CRUCIAL: Wait for the Database ***
			await this.waitForDbInitialization();
			// dbAdapter is now guaranteed to be non-null if waitForDbInitialization didn't throw

			// 3. Load Collections & Build Structure (Uses dbAdapter)
			logger.debug('Updating collections and content structure...');
			await this.updateCollections(true); // Force full reload on initial startup
			logger.debug('Content Manager Collections and Structure updated.');

			// 4. Mark as initialized
			this.initialized = true;
			logger.info('ContentManager Initialized Successfully.');
		} catch (error) {
			logger.error('ContentManager Initialization Failed:', error);
			this.initialized = false; // Ensure state reflects failure
			// Rethrow the error so the caller (likely db.ts) knows initialization failed
			throw error;
		} finally {
			this.initializing = false; // Release the lock
		}
	}

	// --- Public Data Access ---

	/**
	 * Returns the core data structures after initialization.
	 * Ensures initialization is complete before returning data.
	 */
	public async getCollectionData() {
		if (!this.initialized) {
			// Attempt initialization if not done yet. This handles cases where
			// getInstance() is called but initialize() wasn't awaited externally.
			logger.warn('getCollectionData called before explicit initialization. Attempting lazy init...');
			await this.initialize();
			// initialize() will throw if it fails
		}
		// Check again in case initialization failed
		if (!this.initialized) {
			throw new Error('ContentManager failed to initialize. Cannot get collection data.');
		}
		return {
			collectionMap: this.collectionMap, // Map<id, Schema>
			contentStructure: this.contentStructure, // Record<path, Node>
			nestedContentStructure: this.nestedContentStructure // Node[]
		};
	}

	// Gets a specific collection schema by its unique ID (_id).
	public getCollectionById(id: string): Schema | null {
		if (!this.initialized) {
			logger.error('ContentManager not initialized. Cannot call getCollectionById.');
			// In a strict setup, you might throw an error here.
			// Returning null might lead to downstream issues if not handled.
			// Consider requiring await contentManager.initialize() before any data access.
			return null;
		}
		const collection = this.collectionMap.get(id);
		if (!collection) {
			logger.warn(`Collection with id: ${id} not found in collectionMap.`);
			return null;
		}
		return collection;
	}

	// Gets the raw compiled module content and schema for a collection by its path.
	public async getCollection(fullPath: string): Promise<(Schema & { module: string | undefined }) | null> {
		if (!this.initialized) {
			logger.error('ContentManager not initialized. Cannot call getCollection.');
			await this.initialize(); // Attempt lazy init
			if (!this.initialized) return null; // If still not initialized, give up
		}

		const node = this.contentStructure[fullPath];
		if (!node || node.nodeType !== 'collection') {
			logger.warn(`No collection found at path: ${fullPath}`);
			return null;
		}

		const schema = this.collectionMap.get(node._id);
		if (!schema) {
			logger.error(`Schema not found for collection ID ${node._id} at path ${fullPath}. Data inconsistency?`);
			return null;
		}

		// Construct the expected file path in the compiled directory
		const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
		// Remove leading slash from path for file system lookup
		const relativePath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
		const filePath = `${compiledDirectoryPath}/${relativePath}.js`;

		try {
			const moduleContent = await this.readFile(filePath);
			return { ...schema, module: moduleContent };
		} catch (error) {
			// ENOENT (file not found) might be expected if compilation failed or path is wrong
			if (error.code === 'ENOENT') {
				logger.warn(`Compiled collection file not found for path '${fullPath}' at expected location '${filePath}'.`);
			} else {
				logger.error(`Error reading compiled collection file '${filePath}' for path '${fullPath}':`, error);
			}
			// Return schema without module content if file reading fails? Or return null?
			// Returning null seems safer to indicate the full data isn't available.
			return null;
		}
	}

	// Gets the database model associated with a collection ID.
	public getCollectionModelById(id: string): CollectionModel | null {
		if (!this.initialized) {
			logger.error('ContentManager not initialized. Cannot call getCollectionModelById.');
			return null;
		}
		const collectionModel = this.collectionModels.get(id);
		if (!collectionModel) {
			logger.warn(`Collection model for id: ${id} not found.`);
			return null;
		}
		return collectionModel;
	}

	// Get a map of all content structure nodes (categories and collections) keyed by path.
	public async getContentStructureMap(): Promise<Map<string, ContentStructureNode>> {
		if (!this.initialized) {
			logger.warn('getContentStructureMap called before initialization. Attempting lazy init...');
			await this.initialize();
			if (!this.initialized) throw new Error('ContentManager failed to initialize. Cannot get structure map.');
		}
		// Return a copy to prevent external modification
		return new Map(Object.entries(this.contentStructure));
	}

	// --- Core Logic Methods (Private/Protected) ---

	// Loads collection schemas from compiled files, creates DB models, and caches.
	private async loadCollections(): Promise<Schema[]> {
		// Assumes dbAdapter is ready because initialize() waited. Add check for safety.
		if (!dbAdapter) throw new Error('dbAdapter not available in loadCollections');

		logger.debug('Loading collections from compiled files...');

		const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
		logger.debug(`Compiled directory path: ${compiledDirectoryPath}`);

		try {
			// START of main try block
			const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);
			logger.debug(`Found \x1b[34m${files.length}\x1b[0m potential compiled files:`, files);

			if (files.length === 0) {
				logger.warn(`No compiled collection files found in ${compiledDirectoryPath}. Collections not loaded.`);
			}

			// Temporary holders for this run
			const loaded: Schema[] = [];
			const tempCollectionMap = new Map<string, Schema>();
			const tempCollectionModels = new Map<string, CollectionModel>();

			// START OF LOOP
			for (const filePath of files) {
				logger.debug(`Processing file: \x1b[34m${filePath}\x1b[0m`);
				try {
					// Inner try for single file
					const content = await this.readFile(filePath);
					const moduleData = await processModule(content);

					if (!moduleData?.schema) {
						logger.warn(`No schema extracted by processModule for file: ${filePath}`);
						continue;
					}

					const schema = moduleData.schema as Schema;
					logger.debug(`Raw schema processed for \x1b[34m${filePath}\x1b[0m:`, { _id: schema._id, name: schema.name, path: schema.path });

					// Ensure essential _id
					if (!schema._id) {
						logger.error(`Schema in file ${filePath} is missing required '_id'. Skipping.`);
						continue;
					}

					// --- MODIFICATION START ---
					// Derive name and path from file path FIRST, as fallbacks
					const derivedPath = this.extractPathFromFilePath(filePath);
					const fileNameBasedName = derivedPath.split('/').pop() || ''; // Get the last segment as potential name

					if (!fileNameBasedName) {
						logger.error(`Could not derive a fallback name from path '${derivedPath}' for file ${filePath}. Skipping.`);
						continue;
					}

					// Use name from schema if present, otherwise use derived name from filename
					const finalName = schema.name || fileNameBasedName;
					// Use path from schema if present, otherwise derive from file path
					const finalPath = schema.path || derivedPath;

					logger.debug(
						`Derived path: \x1b[34m${derivedPath}\x1b[0m, ` +
						`File Name Based: \x1b[33m${fileNameBasedName}\x1b[0m, ` +
						`Final name for \x1b[36m${filePath}\x1b[0m: \x1b[32m${finalName}\x1b[0m, ` +
						`Final path: \x1b[35m${finalPath}\x1b[0m`
					);

					// Basic validation / Defaulting using fallbacks
					const processedSchema: Schema = {
						...schema, // Spread the original schema first
						_id: schema._id, // Ensure it's taken from schema
						name: finalName, // Use finalName (schema.name or fallback)
						label: schema.label || finalName, // Fallback label to finalName
						path: finalPath, // Use finalPath
						icon: schema.icon || 'bi:file-earmark-text',
						fields: schema.fields || [],
						permissions: schema.permissions || {},
						// Use finalName (lowercased, dashed) as fallback slug
						slug: schema.slug || finalName.toLowerCase().replace(/\s+/g, '-'),
						livePreview: schema.livePreview ?? false,
						strict: schema.strict ?? true,
						revision: schema.revision ?? false,
						description: schema.description || '',
						translations: schema.translations || []
					};
					// --- MODIFICATION END ---

					// Create DB Model
					const model = await dbAdapter.createCollectionModel(processedSchema as CollectionData);
					if (!model) {
						logger.error(`Database model creation failed for collection: ${processedSchema.name} (ID: ${processedSchema._id})`);
						continue;
					}
					logger.debug(`DB Model created successfully for \x1b[33m${processedSchema.name}\x1b[0m (ID: \x1b[34m${processedSchema._id}\x1b[0m)`);

					// Add to temporary lists for this run
					loaded.push(processedSchema);
					tempCollectionMap.set(processedSchema._id, processedSchema);
					tempCollectionModels.set(processedSchema._id, model);
					logger.debug(`Added \x1b[33m${processedSchema.name}\x1b[0m (Path: \x1b[34m${finalPath}\x1b[0m) to loaded collections.`);

					// Update memory cache
					this.collectionCache.set(processedSchema._id, { value: processedSchema, timestamp: Date.now() });
					this.trimCache(this.collectionCache);
				} catch (err) {
					// Catch for processing a single file
					logger.error(`Failed to process collection file ${filePath}:`, err);
					continue; // Skip this file on error
				}
			} // <-- END OF LOOP

			// *** CORRECT PLACEMENT ***
			// Update main state after successful loop
			this.loadedCollections = loaded;
			this.collectionMap = tempCollectionMap;
			this.collectionModels = tempCollectionModels;

			logger.info(`Successfully loaded \x1b[32m${this.loadedCollections.length}\x1b[0m collections.`);

			// Cache in Redis if enabled
			if (isRedisEnabled()) {
				for (const [id, schema] of this.collectionMap.entries()) {
					await setCache(`cms:collection:${id}`, schema, REDIS_TTL);
				}
			}
			// *** END CORRECT PLACEMENT ***

			// Return is inside the try block
			return this.loadedCollections;
		} catch (err) {
			// CATCH for main try block
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to load collections: ${errorMessage}`);

			// Clear potentially inconsistent state
			this.loadedCollections = [];
			this.collectionMap.clear();
			this.collectionModels.clear();
			throw new Error(`Failed to load collections: ${errorMessage}`);
		}
	} // End of loadCollections method

	/**
	 * Updates collections, optionally recompiling (recompilation logic external).
	 * Then updates the content structure based on loaded collections.
	 */
	async updateCollections(forceReload: boolean = false): Promise<void> {
		logger.debug(`Updating collections... ${forceReload ? '(Forcing Reload)' : ''}`);
		try {
			if (forceReload) {
				// Clear memory caches related to collections
				this.collectionCache.clear();
				this.fileHashCache.clear(); // If used for file changes
				this.collectionMap.clear();
				this.collectionModels.clear();
				this.loadedCollections = [];
				// Clear relevant Redis caches if needed
				if (isRedisEnabled()) {
					logger.debug('Clearing relevant Redis collection caches (if implemented)...');
					// Example: If you cache individual collections by ID, you'd need a way
					// to get all known IDs (perhaps from another cache key or DB) and clear them.
					// For simplicity, we'll skip mass Redis clear here unless a specific pattern is used.
					// await clearCache('cms:all_collections'); // Only if this key is actually used/needed
				}
			}

			// Reload collections from files
			await this.loadCollections();

			// Update the hierarchical structure based on loaded collections
			await this.updateContentStructure();

			logger.info('Collections and content structure updated successfully.');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Error in updateCollections: ${errorMessage}`);
			// Re-throw to signal failure
			throw new Error(`Failed to update collections: ${errorMessage}`);
		}
	}

	/**
	 * Builds the flat and nested content structure based on loaded collections.
	 * Creates/updates category nodes in the database as needed.
	 */

	// Create categories with Redis caching
	private async updateContentStructure(): Promise<void> {
		// Assumes dbAdapter is ready. Add check for safety.
		if (!dbAdapter) throw new Error('dbAdapter not available in updateContentStructure');

		logger.debug('Updating content structure...');
		const newStructure: Record<string, ContentStructureNode> = {};
		const categoryPaths = new Set<string>(); // Keep track of paths that should be categories

		try {
			// 1. Get existing structure nodes from DB to compare/update
			const existingNodesList = await dbAdapter.getContentStructure();
			const existingNodesMap = new Map<string, ContentStructureNode>(existingNodesList.map((node) => [node.path, node]));
			logger.debug(`Fetched \x1b[34m${existingNodesMap.size}\x1b[0m existing structure nodes.`);

			// 2. Process loaded collections to define collection nodes and identify parent categories
			for (const collection of this.loadedCollections) {
				if (!collection.path) {
					logger.warn(`Collection '${collection.name}' (ID: ${collection._id}) is missing a path. Skipping structure update for this item.`);
					continue;
				}

				const collectionPath = collection.path;
				const existingNode = existingNodesMap.get(collectionPath);

				const parentPath = collectionPath === '/' ? null : collectionPath.split('/').slice(0, -1).join('/') || '/';

				// Data for the collection node itself
				const collectionNodeData: Omit<ContentStructureNode, 'createdAt'> = {
					_id: collection._id, // Use the collection's definitive ID
					name: collection.name,
					icon: collection.icon || 'bi:file-earmark-text',
					path: collectionPath,
					order: existingNode?.order ?? 999, // Preserve order if exists
					nodeType: 'collection',
					parentPath: parentPath,
					translations: collection.translations || existingNode?.translations || [],
					updatedAt: new Date() // Always update timestamp
				};

				// --- MODIFICATION START: Handle potential path conflict ---
				try {
					// Attempt to upsert the collection node
					const upsertedCollectionNode = await dbAdapter.upsertContentStructureNode(collectionNodeData);
					newStructure[upsertedCollectionNode.path] = upsertedCollectionNode;
					existingNodesMap.delete(collectionPath); // Remove from map as it's handled
				} catch (error) {
					// --- DEBUG LOGGING START ---
					// logger.error(`Caught error during collection upsert for path ${collectionPath}. Error type: ${typeof error}, Is instanceof Error: ${error instanceof Error}, Message: ${error?.message}`);
					// console.error("Caught Error Object:", error); // Log the full error object
					// --- DEBUG LOGGING END ---

					// Use 'includes' for a more robust check
					if (!(error instanceof Error && error.message.includes('Path conflict:'))) {
						// Re-throw only unexpected errors
						logger.error(`Unexpected error during collection node upsert for ${collectionPath}:`, error);
						throw error;
					} else {
						// Log the handled path conflict
						logger.warn(`Path conflict detected for ${collectionPath}: ${error.message}. Skipping update for this node.`);
						// Explicitly DO NOT re-throw the path conflict error
					}
				}
				// --- MODIFICATION END ---

				// Identify required parent category paths
				if (parentPath) {
					let currentPath = '';
					const parts = parentPath.split('/').filter(Boolean);
					for (const part of parts) {
						currentPath = `${currentPath}/${part}`;
						categoryPaths.add(currentPath);
					}
				}
			}
			logger.debug(`Identified ${categoryPaths.size} required category paths from collections.`);

			// 3. Process and upsert required category nodes
			const sortedCategoryPaths = Array.from(categoryPaths).sort((a, b) => a.split('/').length - b.split('/').length); // Process parents first

			for (const catPath of sortedCategoryPaths) {
				if (newStructure[catPath]) continue; // Already processed (e.g., was a collection path?)

				const existingNode = existingNodesMap.get(catPath);
				const parts = catPath.split('/').filter(Boolean);
				const name = parts[parts.length - 1] || 'Root'; // Fallback name unlikely needed
				const parentPath = parts.length <= 1 ? null : '/' + parts.slice(0, -1).join('/');

				const categoryNodeData: Omit<ContentStructureNode, 'createdAt'> = {
					_id: existingNode?._id ?? uuidv4(), // Generate new ID if not existing
					name: name, // Use segment name
					icon: existingNode?.icon ?? 'bi:folder', // Default folder icon
					path: catPath,
					order: existingNode?.order ?? 999,
					nodeType: 'category',
					parentPath: parentPath,
					translations: existingNode?.translations ?? [],
					updatedAt: new Date()
				};

				// --- MODIFICATION START: Handle potential path conflict (less likely for categories if collections done first, but safer) ---
				try {
					const upsertedCategoryNode = await dbAdapter.upsertContentStructureNode(categoryNodeData);
					newStructure[upsertedCategoryNode.path] = upsertedCategoryNode;
					existingNodesMap.delete(catPath); // Remove from map
				} catch (error) {
					// --- DEBUG LOGGING START ---
					// logger.error(`Caught error during category upsert for path ${catPath}. Error type: ${typeof error}, Is instanceof Error: ${error instanceof Error}, Message: ${error?.message}`);
					// console.error("Caught Error Object:", error); // Log the full error object
					// --- DEBUG LOGGING END ---

					// Use 'includes' for a more robust check
					if (!(error instanceof Error && error.message.includes('Path conflict:'))) {
						// Re-throw only unexpected errors
						logger.error(`Unexpected error during category node upsert for ${catPath}:`, error);
						throw error;
					} else {
						// Log the handled path conflict
						logger.warn(`Path conflict detected for category ${catPath}: ${error.message}. Skipping update for this node.`);
						// Explicitly DO NOT re-throw the path conflict error
					}
				}
				// --- MODIFICATION END ---
			}

			// 4. Handle stale nodes (nodes in existingNodesMap that weren't updated/created)
			if (existingNodesMap.size > 0) {
				logger.warn(`Found ${existingNodesMap.size} stale structure nodes not present in current collections:`, Array.from(existingNodesMap.keys()));
				// Delete stale nodes
				for (const staleNode of existingNodesMap.values()) {
					logger.debug(`Deleting stale structure node: ${staleNode.path} (ID: ${staleNode._id})`);
					try {
						await dbAdapter.deleteContentStructureNode(staleNode._id);
						logger.debug(`Successfully deleted stale node: ${staleNode.path}`);
					} catch (deleteError) {
						logger.error(`Failed to delete stale structure node ${staleNode.path} (ID: ${staleNode._id}):`, deleteError);
					}
				}
			}

			// 5. Update internal state and generate nested structure
			this.contentStructure = newStructure;
			this.nestedContentStructure = this.generateNestedStructure(Object.values(newStructure)); // Pass current nodes

			logger.debug('Content structure updated in DB and memory.');

			// Cache the updated structure (e.g., the flat map) in Redis if needed
			if (isRedisEnabled()) {
				// Cache the flat structure map by path
				await setCache('cms:content_structure_map', this.contentStructure, REDIS_TTL);
				// Cache the nested structure array
				await setCache('cms:content_structure_nested', this.nestedContentStructure, REDIS_TTL);
			}
		} catch (err) {
			// This is the outer catch block - should only catch unexpected errors now
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to update content structure: ${errorMessage}`);
			// Always re-throw errors caught at this level
			throw new Error(`Failed to update content structure: ${errorMessage}`);
		}
	}

	// Generates the nested hierarchical structure from a flat list of nodes.
	private generateNestedStructure(nodes: ContentStructureNode[]): ContentStructureNode[] {
		logger.debug(`Generating nested structure from ${nodes.length} nodes.`);

		// Create a Map for quick lookups
		const nodeMap = new Map<string, ContentStructureNode & { children: ContentStructureNode[] }>();
		const rootNodes: (ContentStructureNode & { children: ContentStructureNode[] })[] = [];

		// Initialize map with children arrays
		nodes.forEach((node) => {
			nodeMap.set(node.path, { ...node, children: [] });
		});

		// Build the nested tree
		nodeMap.forEach((node) => {
			if (node.parentPath && nodeMap.has(node.parentPath)) {
				const parent = nodeMap.get(node.parentPath);
				parent?.children.push(node); // Add to parent's children
			} else if (node.parentPath === null || node.parentPath === '/') {
				// Consider '/' parent path as root for practical purposes unless a node with path '/' exists
				if (node.path === '/') {
					// If this IS the root node
					if (!rootNodes.some((rn) => rn.path === '/')) rootNodes.push(node);
				} else if (node.parentPath === '/' && nodeMap.has('/')) {
					const parent = nodeMap.get('/'); // Attach to explicit root node if exists
					parent?.children.push(node);
				} else {
					rootNodes.push(node); // Otherwise, treat as a root node
				}
			} else {
				logger.warn(`Node '${node.path}' has parentPath '${node.parentPath}' but parent node was not found in the map. Orphaned?`);
				// Decide if orphaned nodes should be included at the root level
				rootNodes.push(node);
			}
		});

		// Sort children within each node (optional, based on 'order' property)
		const sortNodes = (nodeList: (ContentStructureNode & { children: ContentStructureNode[] })[]) => {
			nodeList.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
			nodeList.forEach((node) => sortNodes(node.children)); // Recursively sort children
		};
		sortNodes(rootNodes);

		logger.debug(`Generated nested structure with ${rootNodes.length} root node(s).`);
		return rootNodes;
	}

	// --- File System & Path Utils ---

	// Extract path from file path
	private extractPathFromFilePath(filePath: string): string {
		const compiledCollectionsPath = (import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections') + '/';
		let relativePath = filePath;

		if (filePath.startsWith(compiledCollectionsPath)) {
			relativePath = filePath.substring(compiledCollectionsPath.length);
		} else {
			// Handle cases where path might not start exactly as expected (e.g., symlinks, different base)
			// This might need adjustment based on your exact setup
			logger.warn(
				`File path '${filePath}' did not start with expected compiled path '${compiledCollectionsPath}'. Path derivation might be inaccurate.`
			);
		}

		// Remove .js extension
		relativePath = relativePath.replace(/\.js$/, '');

		// Ensure leading slash
		return '/' + relativePath;
	}

	// Get compiled Categories and Collection files
	private async getCompiledCollectionFiles(compiledDirectoryPath: string): Promise<string[]> {
		if (!fs) throw new Error('File system operations are only available on the server.');

		const files: string[] = [];
		try {
			const entries = await fs.readdir(compiledDirectoryPath, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = `${compiledDirectoryPath}/${entry.name}`;
				if (entry.isDirectory()) {
					files.push(...(await this.getCompiledCollectionFiles(fullPath))); // Recurse
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					files.push(fullPath);
				}
			}
			return files;
		} catch (error) {
			if (error.code === 'ENOENT') {
				logger.warn(`Compiled collections directory not found: ${compiledDirectoryPath}`);
				return []; // No files found is not a critical error here
			}
			logger.error(`Error reading compiled collection directory '${compiledDirectoryPath}': ${error.message}`);
			throw error; // Propagate other errors
		}
	}
	// Read file with retry mechanism
	private async readFile(filePath: string): Promise<string> {
		// Server-side file reading
		if (!fs) throw new Error('File system operations are only available on the server.');
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return content;
		} catch (error) {
			// Log specific ENOENT, rethrow others
			if (error.code === 'ENOENT') {
				logger.warn(`File not found: ${filePath}`);
			} else {
				logger.error(`Error reading file: ${filePath}`, error);
			}
			throw error; // Re-throw error for caller to handle
		}
	}

	// Cache Management - Get content node map
	private async getCacheValue<T>(key: string, cache: Map<string, CacheEntry<T>>): Promise<T | null> {
		const redisKey = `cms:${key}`;
		if (isRedisEnabled()) {
			try {
				const redisValue = await getCache<T>(redisKey);
				if (redisValue !== null && redisValue !== undefined) {
					// Check explicitly for null/undefined
					// Update memory cache as well for faster subsequent access
					cache.set(key, { value: redisValue, timestamp: Date.now() });
					this.trimCache(cache); // Trim after adding
					return redisValue;
				}
			} catch (redisError) {
				logger.warn(`Redis GET error for key '${redisKey}':`, redisError);
				// Proceed to check memory cache
			}
		}

		const entry = cache.get(key);
		if (entry && Date.now() - entry.timestamp <= CACHE_TTL) {
			return entry.value;
		} else if (entry) {
			// Expired from memory cache
			cache.delete(key);
		}
		return null;
	}

	private async setCacheValue<T>(key: string, value: T, cache: Map<string, CacheEntry<T>>): Promise<void> {
		const redisKey = `cms:${key}`;
		if (isRedisEnabled()) {
			try {
				await setCache(redisKey, value, REDIS_TTL);
			} catch (redisError) {
				logger.warn(`Redis SET error for key '${redisKey}':`, redisError);
			}
		}
		cache.set(key, { value, timestamp: Date.now() });
		this.trimCache(cache);
	}

	// Note: clearCacheValue removed as it referenced non-existent categoryCache.
	// Use direct cache clear methods or Redis clearCache utility.
	private trimCache<T>(cache: Map<string, CacheEntry<T>>): void {
		if (cache.size > MAX_CACHE_SIZE) {
			// Simple LRU approximation: remove the oldest entries
			const entriesToDelete = Array.from(cache.entries())
				.sort((a, b) => a[1].timestamp - b[1].timestamp) // Sort oldest first
				.slice(0, cache.size - MAX_CACHE_SIZE); // Get the excess entries

			logger.debug(`Trimming memory cache. Size: ${cache.size}, Max: ${MAX_CACHE_SIZE}. Removing ${entriesToDelete.length} items.`);

			for (const [key] of entriesToDelete) {
				cache.delete(key);
				// Optionally clear from Redis too if trimming memory implies it's less relevant
				// You would need the `clearCache` import back if you uncomment this.
				// if (isRedisEnabled()) {
				//     clearCache(`cms:${key}`).catch(err => logger.warn(`Failed to clear Redis on memory trim for key 'cms:${key}':`, err));
				// }
			}
		}
	}

	// --- Misc / Experimental ---

	// Lazy loading - Seems less relevant if all collections are loaded from compiled files at startup.
	// Keep if there's a use case for dynamically loading *new* definitions not present at startup.
	private async lazyLoadCollection(collectionName: string): Promise<Schema | null> {
		if (!this.initialized) {
			logger.error('Cannot lazy load collection: ContentManager not initialized.');
			return null; // Or attempt init? Depends on desired behavior.
		}

		const cacheKey = `collection:${collectionName}`; // Use name or path? Assuming name for this example
		// Try getting from cache (Redis or memory)
		const cached = await this.getCacheValue(cacheKey, this.collectionCache);
		if (cached) {
			return cached;
		}

		// This assumes a source structure different from compiledCollections, e.g., 'config/collections'
		const sourceFilePath = `config/collections/${collectionName}.ts`; // Adjust path as needed
		logger.debug(`Attempting to lazy load collection: ${collectionName} from ${sourceFilePath}`);

		try {
			const content = await this.readFile(sourceFilePath); // Needs server context
			const moduleData = await processModule(content); // Use the utility

			if (moduleData?.schema) {
				const schema = moduleData.schema as Schema;
				// TODO: Need to potentially create DB model, update maps etc., just like in loadCollections.
				// This makes lazy loading complex if it needs full integration.
				logger.warn(`Lazy loading for ${collectionName} successful, but DB model/structure integration is not fully implemented here.`);
				await this.setCacheValue(cacheKey, schema, this.collectionCache);
				return schema;
			} else {
				logger.warn(`Lazy loading failed: No schema found in ${sourceFilePath}`);
				return null;
			}
		} catch (err) {
			if (err.code !== 'ENOENT') {
				// Don't log error if file simply doesn't exist
				logger.error(`Failed to lazy load collection ${collectionName}:`, err);
			} else {
				logger.debug(`Lazy load source file not found: ${sourceFilePath}`);
			}
			// Don't throw, just return null if lazy load fails
			return null;
		}
	}
}

// Export singleton instance
export const contentManager = ContentManager.getInstance();
// Export types
export type { Schema, ContentTypes, Category, CollectionData, ContentStructureNode, SystemContent };
