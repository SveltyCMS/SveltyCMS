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

// Components
import { widgetStoreActions } from '@stores/widgetStore.svelte';

// Types
import type { Category, ContentTypes, Schema } from './types';
import type { DatabaseId, ISODateString } from './types';

// System Logger
import { logger } from '@utils/logger';

// Database
import { dbAdapter } from '@src/databases/db';

// Constants for batch processing
const BATCH_SIZE = 50; // Number of collections to process per batch
const CONCURRENT_BATCHES = 5; // Number of concurrent batches

// Cache and efficient data structures
let importsCache: Record<ContentTypes, Schema> = {} as Record<ContentTypes, Schema>;
let collectionModelsCache: Partial<Record<ContentTypes, Schema>> | null = null;

// Define missing types locally to avoid circular dependencies
interface CategoryNode {
	id: number;
	name: string;
	icon: string;
	order: number;
	collections: Schema[];
	subcategories: Map<string, CategoryNode>;
}

interface ProcessedModule {
	schema?: Schema;
	default?: Schema;
}

const categoryLookup: Map<string, CategoryNode> = new Map();
const collectionsByCategory: Map<string, Set<Schema>> = new Map();

interface CollectionData {
	id: string;
	name: string;
	icon: string;
	collections: Schema[];
	subcategories: Record<string, CollectionData>;
}

// Helper function to create chunks
function chunks<T>(arr: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}

async function getCurrentPath() {
	// Ensure dbAdapter is available
	if (!dbAdapter) {
		logger.warn('dbAdapter is not available in getCurrentPath');
		return {
			config: {
				fields: {},
				isCollection: false,
				name: '',
				icon: '',
				path: typeof window !== 'undefined' ? window.location.pathname : '',
				order: 0
			},
			currentPath: typeof window !== 'undefined' ? window.location.pathname : ''
		};
	}

	const result = await dbAdapter.content.nodes.getStructure('flat');
	if (!result.success || !result.data) {
		logger.warn('Failed to get content nodes from database');
		return {
			config: {
				fields: {},
				isCollection: false,
				name: '',
				icon: '',
				path: typeof window !== 'undefined' ? window.location.pathname : '',
				order: 0
			},
			currentPath: typeof window !== 'undefined' ? window.location.pathname : ''
		};
	}

	const contentNodes = result.data;
	const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
	const config = contentNodes.find((node) => node.path === currentPath) || {
		fields: {},
		isCollection: false,
		name: '',
		icon: '',
		path: currentPath,
		order: 0
	};
	return { config, currentPath };
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

// Function to create categories from folder structure
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
		order: 0,
		collections: cat.collections.map((col) => col.name || '').filter(Boolean),
		subcategories: undefined
	}));
	logger.trace('Created categories:', result);
	return result;
}

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
			for (const collectionName of category.collections) {
				const col = imports[collectionName as ContentTypes];
				if (col && col.name) {
					_collections[col.name as ContentTypes] = col;
				}
			}
		}
		logger.trace(`Collections processed. Count: ${Object.keys(_collections).length}`);
		logger.trace('Setting categories:', _categories);

		// Set the stores
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

		// Mutate collections object (can't reassign const $state)
		Object.keys(collections).forEach((key) => delete collections[key]);
		Object.assign(collections, _collections);

		// Fix unAssigned to pass a valid Schema or empty default
		const unassigned = Object.values(imports).filter((x) => !Object.values(_collections).includes(x));
		Object.assign(unAssigned, unassigned.length > 0 ? unassigned[0] : { fields: [] });

		setCollection({} as Schema);
		setCollectionValue({});
		setMode('view');

		logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
	} catch (err) {
		logger.error(`Error in updateCollections: ${err}`);
		// Don't throw error here, just log it and continue
	}
};

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

	// Production mode optimization: Use direct filesystem scanning for better performance
	// NOTE: Only on server! Browser should use API endpoint
	if (!dev && !building && !browser) {
		logger.trace('Running in production mode - using scanCompiledCollections for optimal performance');
		try {
			const { scanCompiledCollections } = await import('./collectionScanner');
			const compiledCollections = await scanCompiledCollections();

			// Convert to the existing type structure (maintaining backwards compatibility)
			const imports: Record<string, Schema> = {};
			for (const collection of compiledCollections) {
				if (collection._id && collection.name) {
					imports[collection.name] = collection;
				}
			}

			// Cast to ContentTypes to maintain type safety with existing codebase
			importsCache = imports as Record<ContentTypes, Schema>;
			logger.info(`✅ Loaded ${Object.keys(imports).length} collections via filesystem scanning`);
			return importsCache;
		} catch (error) {
			logger.warn('Failed to scan compiled collections, falling back to legacy import method:', error);
			// Fall through to legacy method below
		}
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
			logger.trace(`Running in ${dev ? 'dev' : 'building'} mode`);
			// Look for TypeScript files in config/collections directory
			const modules = import.meta.glob(
				[
					'../../config/collections/**/*.ts',
					'!../../config/collections/**/index.ts',
					'!../../config/collections/**/types.ts',
					'!../../config/collections/**/utils/**/*.ts'
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
									logger.error(`Error processing module ${name}: ${moduleError instanceof Error ? moduleError.message : String(moduleError)}`);
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
