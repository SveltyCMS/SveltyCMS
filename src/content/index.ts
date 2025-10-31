/**
 * @file src/content/index.ts
 * @description Index file for Content Management.
 *
 * Features:
 * - Caching and efficient data structures
 * - Content loading, caching, and updates from folder structure
 * - Widget initialization
 * - Error handling
 */

import { browser, building, dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Stores
import { collections, contentStructure, setCollection, setCollectionValue, setMode, unAssigned } from '@root/src/stores/collectionStore.svelte';
import type { Unsubscriber } from 'svelte/store';

// Components
import { widgetStoreActions } from '@stores/widgetStore.svelte';

// Types
import type { Category, CategoryNode, ContentTypes, ProcessedModule, Schema } from './types';
import type { DatabaseId, ISODateString } from './types';

// System Logger
import { logger } from '@utils/logger';

// Constants for batch processing
const BATCH_SIZE = 50; // Number of collections to process per batch
const CONCURRENT_BATCHES = 5; // Number of concurrent batches

// Cache and efficient data structures
let importsCache: Record<ContentTypes, Schema> = {} as Record<ContentTypes, Schema>;
let unsubscribe: Unsubscriber | undefined;
let collectionModelsCache: Partial<Record<ContentTypes, Schema>> | null = null;
const categoryLookup: Map<string, CategoryNode> = new Map();
const collectionsByCategory: Map<string, Set<Schema>> = new Map();

// ...existing code...

interface CollectionData {
	id: string;
	name: string;
	icon: string;
	collections: Schema[];
	subcategories: Record<string, CollectionData>;
}

// Function to create categories from folder structure
// Fix createCategoriesFromPath to return Category[]
async function createCategoriesFromPath(collections: Schema[]): Promise<Category[]> {
	categoryLookup.clear();
	collectionsByCategory.clear();

	const batches = chunks(collections, BATCH_SIZE);
	for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
		const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
		await Promise.all(currentBatches.map(processBatch));
	}

	const categoriesObject = flattenAndSortCategories();
	const result: Category[] = Object.values(categoriesObject).map((cat) => ({
		id: parseInt(cat.id),
		name: cat.name,
		icon: cat.icon,
		order: 0, // Default order, update if needed
		collections: cat.collections,
		subcategories: undefined
	}));
	logger.trace('Created categories:', result);
	return result;
}

// Helper function to create chunks
function chunks<T>(arr: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}

// Process a batch of collections
async function processBatch(collections: Schema[]): Promise<void> {
	for (const col of collections) {
		if (!col.path) {
			logger.warn(`Collection ${col.name} has no path`);
			continue;
		}

		// Split path into segments for nested categories
		const pathSegments = col.path ? col.path.split('/') : [];
		let currentPath = '';
		let currentMap: Map<string, CategoryNode> = categoryLookup;

		// Create or update category nodes for each path segment
		for (let i = 0; i < pathSegments.length; i++) {
			const segment = pathSegments[i] ?? '';
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			if (!currentMap.has(segment)) {
				const randomId = uuidv4().replace(/-/g, '');
				const config = await getCurrentPath();
				const newNode: CategoryNode = {
					id: parseInt(randomId.toString().slice(0, 8), 16),
					name: segment,
					icon: config.config.icon ?? '',
					order: 'order' in config.config && typeof config.config.order === 'number' ? config.config.order : 0,
					collections: [],
					subcategories: new Map()
				};

				currentMap.set(segment, newNode);
				categoryLookup.set(currentPath, newNode);
				collectionsByCategory.set(currentPath, new Set());
			}

			// If this is the last segment, add the collection
			if (i === pathSegments.length - 1) {
				const categoryNode = categoryLookup.get(currentPath);
				if (categoryNode) {
					categoryNode.collections.push(col);
					collectionsByCategory.get(currentPath)?.add(col);
				}
			}

			const nextNode = currentMap.get(segment);
			if (nextNode && nextNode.subcategories) {
				currentMap = nextNode.subcategories;
			}
		}
	}
}

// Helper function to flatten and sort the category hierarchy
function flattenAndSortCategories(): Record<string, CollectionData> {
	const result: Record<string, CollectionData> = {};

	// Convert Map entries to array and sort
	const sortedCategories = Array.from(categoryLookup.entries()).sort(([, a], [, b]) => a.order - b.order);

	for (const [path, category] of sortedCategories) {
		// Sort collections within category
		const collections = Array.from(collectionsByCategory.get(path) || []).sort((a, b) => {
			// Ensure order is always a number, fallback to 0 if missing
			const orderA: number = a && typeof a.order === 'number' ? a.order : 0;
			const orderB: number = b && typeof b.order === 'number' ? b.order : 0;
			return orderA - orderB;
		});

		result[path] = {
			id: category.id.toString(),
			name: category.name,
			icon: category.icon,
			collections,
			subcategories: {}
		};
	}

	return result;
}

import { dbAdapter } from '@src/databases/db';

// ...existing code...

// Function to get collections with cache support
export async function getCollections(): Promise<Partial<Record<ContentTypes, Schema>>> {
	logger.trace('Starting getCollections');

	// Initialize widgets
	await widgetStoreActions.initializeWidgets();

	// Return cached collections if available
	if (collectionModelsCache) {
		logger.trace(`Returning cached collections. Count: ${Object.keys(collectionModelsCache).length}`);
		return collectionModelsCache;
	}

	collectionModelsCache = collections;
	return collections;
}

// Function to update collections
export const updateCollections = async (recompile: boolean = false): Promise<void> => {
	logger.trace('Starting updateCollections');

	if (recompile) {
		importsCache = {} as Record<ContentTypes, Schema>;
	}

	try {
		const imports = await getImports(recompile);
		logger.trace(`Imports fetched. Count: ${Object.keys(imports).length}`);

		const _categories = await createCategoriesFromPath(Object.values(imports));

		const _collections: Partial<Record<ContentTypes, Schema>> = {};
		for (const category of _categories) {
			for (const col of category.collections) {
				if (col.name) {
					_collections[col.name as ContentTypes] = col;
				}
			}
		}

		logger.trace(`Collections processed. Count: ${Object.keys(_collections).length}`);
		logger.trace('Setting categories:', _categories);

		// Set the stores
		// Map Category[] to ContentNode[] for store, fix _id type
		contentStructure.value = _categories.map((cat) => ({
			_id: cat.id.toString() as DatabaseId,
			name: cat.name,
			nodeType: 'category',
			icon: cat.icon,
			order: cat.order,
			parentId: undefined,
			path: '',
			translations: [],
			collectionDef: undefined,
			children: [],
			createdAt: new Date().toISOString() as ISODateString,
			updatedAt: new Date().toISOString() as ISODateString
		}));
		collections.value = _collections;
		// Fix unAssigned.value to pass a valid Schema or empty default
		const unassigned = Object.values(imports).filter((x) => !Object.values(_collections).includes(x));
		unAssigned.value = unassigned.length > 0 ? unassigned[0] : { fields: [] };

		// Only try to fetch collection models if we're server-side and not in development mode

		setCollection({} as Schema);
		setCollectionValue({});
		setMode('view');

		logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
	} catch (err) {
		logger.error(`Error in updateCollections: ${err}`);
		// Don't throw error here, just log it and continue
		// This allows the collections to still be loaded even if DB isn't ready
	}
};

// Initialize collections
//(async () => {
//  try {
//    await updateCollections();
//    logger.info('Collections initialized successfully');
//  } catch (err) {
//    logger.warn(`Note: Initialization encountered an issue: ${err}. This is expected during initial setup.`);
//  }
//})();

// Function to get imports based on environment
async function getImports(recompile: boolean = false): Promise<Record<ContentTypes, Schema>> {
	logger.trace('Starting getImports function');

	// Ensure widgets are initialized before importing collections
	await widgetStoreActions.initializeWidgets();
	logger.trace('Widgets initialized, proceeding with collection imports');

	// Return from cache if available
	if (!recompile && Object.keys(importsCache).length > 0) {
		logger.trace('Returning from cache');
		return importsCache;
	}

	try {
		const processModule = async (name: string, module: ProcessedModule, modulePath: string) => {
			const collection = (module as { schema: Schema })?.schema ?? {};
			if (collection) {
				const randomId = uuidv4();
				collection.name = name as ContentTypes;
				collection.icon = collection.icon || 'iconoir:info-empty';
				collection.id = parseInt(randomId.toString().slice(0, 8), 16);

				// Extract path from module location
				const pathSegments = modulePath.split('/config/collections/')[1]?.split('/') || [];
				// Get the collection path without the filename
				const collectionPath = pathSegments.slice(0, -1).join('/');
				collection.path = collectionPath;
				logger.trace(`Set path for collection ${name} to ${collection.path}`);

				importsCache[name as ContentTypes] = collection as Schema;
			} else {
				logger.error(`Error importing collection: ${name}`);
			}
		};

		// Development/Building mode
		if (dev || building) {
			logger.trace(`Running in {${dev ? 'dev' : 'building'}} mode`);
			// Look for TypeScript files in config/collections directory
			const modules = import.meta.glob(
				[
					'../../config/collections/**/*.ts',
					'!../../config/collections/**/index.ts', // Exclude any index files
					'!../../config/collections/**/types.ts', // Exclude type definitions
					'!../../config/collections/**/utils/**/*.ts' // Exclude utility files
				],
				{
					eager: false,
					import: 'default'
				}
			);

			// Process modules in batches
			const entries = Object.entries(modules);
			const batches = chunks(entries, BATCH_SIZE);

			for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
				const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
				await Promise.all(
					currentBatches.map(async (batch) => {
						await Promise.all(
							batch.map(async ([modulePath, moduleImport]) => {
								const name = modulePath.split('/').pop()?.replace(/\.ts$/, '') || '';
								const module = await moduleImport();
								// Cast module import as ProcessedModule
								await processModule(name, module as ProcessedModule, modulePath);
							})
						);
					})
				);
			}
		} else {
			// Production mode
			logger.trace('Running in production mode');
			let files: string[] = [];
			try {
				// Use new collections endpoint
				const collectionsResponse = browser ? (await axios.get('/api/collections')).data : await getCollections();
				if (collectionsResponse.success && Array.isArray(collectionsResponse.data.collections)) {
					// Fix type for collectionsResponse.data.collections.map
					files = collectionsResponse.data.collections.map((c: { name: string }) => `${c.name}.js`);
				} else if (Array.isArray(collectionsResponse)) {
					// Fallback for old format
					files = collectionsResponse;
				} else {
					logger.error(`Collections response is not valid: ${JSON.stringify(collectionsResponse)}`);
					files = [];
				}
			} catch (error) {
				logger.error(`Error fetching collection files: ${error instanceof Error ? error.message : String(error)}`);
				files = [];
			}

			// Process files in batches
			const batches = chunks(files, BATCH_SIZE);

			for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
				const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
				await Promise.all(
					currentBatches.map(async (batch) => {
						await Promise.all(
							batch.map(async (file) => {
								const name = file.replace(/\.js$/, '');
								try {
									const collectionModule =
										typeof window !== 'undefined'
											? (await axios.get(`/api/collections/${name}?includeFields=true&_t=${Math.floor(Date.now() / 1000)}`)).data
											: await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${file}`);

									await processModule(name, collectionModule, file);
								} catch (moduleError: unknown) {
									logger.error(
										`Error processing module ${name}: ${moduleError instanceof Error ? (moduleError as Error).message : String(moduleError)}`
									);
								}
							})
						);
					})
				);
			}
		}

		logger.trace('Imported collections:', { collections: Object.keys(importsCache) });
		return importsCache;
	} catch (err) {
		logger.error(`Error in getImports: ${err instanceof Error ? err.message : String(err)}`);
		throw error(500, `Failed to get imports: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export { contentStructure as categories };

async function getCurrentPath() {
	const contentNodes = await dbAdapter.getContentNodes();
	const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
	// Fix type for node in find
	const config = contentNodes.find((node: { path?: string }) => node.path === currentPath) || {
		fields: {},
		isCollection: false,
		name: '',
		icon: '',
		path: currentPath,
		order: 0
	};
	return { config, currentPath };
}
