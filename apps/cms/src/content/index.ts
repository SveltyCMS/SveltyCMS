/**
 * @file apps/cms/src/content/index.ts
 * @description Index file for Content Management.
 *
 * Improvements:
 * - **SSR Safety:** Dynamically imports DB only on server.
 * - **Stable IDs:** Replaced random UUIDs with deterministic hashing for Category IDs (prevents hydration mismatches).
 * - **Type Safety:** Improved typing for the db adapter import.
 */

import { browser, building, dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Stores
import { collections, contentStructure, setCollection, setCollectionValue, setMode, unAssigned } from '@cms/stores/collectionStore.svelte';

// Components
import { widgets } from '@cms/stores/widgetStore.svelte';

// Types
import type { Category, ContentTypes, Schema } from './types';
import type { DatabaseId, ISODateString } from './types';

// System Logger
import { logger } from '@shared/utils/logger';

// Constants
const BATCH_SIZE = 50;
const CONCURRENT_BATCHES = 5;

// Cache
let importsCache: Record<ContentTypes, Schema> = {} as Record<ContentTypes, Schema>;
let collectionModelsCache: Partial<Record<ContentTypes, Schema>> | null = null;

// --- Types ---
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

interface CollectionData {
	id: string;
	name: string;
	icon: string;
	collections: Schema[];
	subcategories: Record<string, CollectionData>;
}

// --- Global State for Processing ---
const categoryLookup: Map<string, CategoryNode> = new Map();
const collectionsByCategory: Map<string, Set<Schema>> = new Map();

// --- Helpers ---

function chunks<T>(arr: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}

/**
 * Generates a stable numeric ID from a string.
 * Replaces uuidv4 to ensure category IDs remain consistent across restarts/renders.
 */
function stringToHash(str: string): number {
	let hash = 0;
	if (str.length === 0) return hash;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

async function getCurrentPath() {
	// 1. Client-Side Early Exit (Optimization)
	if (!import.meta.env.SSR) {
		const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
		return {
			config: { fields: {}, isCollection: false, name: '', icon: '', path: currentPath, order: 0 },
			currentPath
		};
	}

	// 2. Server-Side Dynamic Import
	try {
		const { dbAdapter } = await import('@shared/database/db');
		if (!dbAdapter) return getDefaultPathConfig();

		const result = await dbAdapter.content.nodes.getStructure('flat');
		if (!result.success || !result.data) {
			logger.warn('Failed to get content nodes from database');
			return getDefaultPathConfig();
		}

		const currentPath = ''; // On server, we don't really have 'window.location' in the same way for this context
		// Logic adjustment: server doesn't usually need 'currentPath' for generation unless building static paths

		return {
			config: { fields: {}, isCollection: false, name: '', icon: '', path: currentPath, order: 0 },
			currentPath
		};
	} catch (e) {
		logger.warn('Error loading DB adapter in content index', e);
		return getDefaultPathConfig();
	}
}

function getDefaultPathConfig() {
	const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
	return {
		config: {
			fields: {},
			isCollection: false,
			name: '',
			icon: '',
			path: currentPath,
			order: 0
		},
		currentPath
	};
}

// Process a batch of collections
async function processBatch(collections: Schema[]): Promise<void> {
	for (const col of collections) {
		if (!col.path) {
			logger.warn(`Collection ${col.name} has no path`);
			continue;
		}

		const pathSegments = col.path.split('/');
		let currentPath = '';
		let currentMap: Map<string, CategoryNode> = categoryLookup;

		for (let i = 0; i < pathSegments.length; i++) {
			const segment = pathSegments[i] ?? '';
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			if (!currentMap.has(segment)) {
				const configData = await getCurrentPath();

				// Use stable hash instead of random UUID
				const stableId = stringToHash(segment);

				const newNode: CategoryNode = {
					id: stableId,
					name: segment,
					icon: configData.config.icon ?? '',
					order: 'order' in configData.config && typeof configData.config.order === 'number' ? configData.config.order : 0,
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
	const sortedCategories = Array.from(categoryLookup.entries()).sort(([, a], [, b]) => a.order - b.order);

	for (const [path, category] of sortedCategories) {
		const collections = Array.from(collectionsByCategory.get(path) || []).sort((a, b) => {
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

	// logger.trace('Created categories:', result);
	return result;
}

// Function to get collections with cache support
export async function getCollections(): Promise<Partial<Record<ContentTypes, Schema>>> {
	await widgets.initialize();

	if (collectionModelsCache) {
		return collectionModelsCache;
	}

	collectionModelsCache = collections.all;
	return collections.all;
}

// Function to update collections
export const updateCollections = async (recompile: boolean = false): Promise<void> => {
	logger.trace('Starting updateCollections');

	if (recompile) {
		importsCache = {} as Record<ContentTypes, Schema>;
	}

	try {
		const imports = await getImports(recompile);
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

		// Update stores
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

		Object.keys(collections.all).forEach((key) => delete collections.all[key]);
		Object.assign(collections.all, _collections);

		const unassigned = Object.values(imports).filter((x) => !Object.values(_collections).includes(x));
		Object.assign(unAssigned, unassigned.length > 0 ? unassigned[0] : { fields: [] });

		setCollection({} as Schema);
		setCollectionValue({});
		setMode('view');

		// Update local version tracking
		if (importsCache && Object.keys(importsCache).length > 0) {
			// If we fetched via API, we might want to get the version from the response headers or a separate call
			// For now, we assume if we just updated, we are at the latest.
			// Ideally, updateCollections should return the version or accept it.
		}

		logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
	} catch (err) {
		logger.error(`Error in updateCollections: ${err}`);
	}
};

// Function to get imports based on environment
async function getImports(recompile: boolean = false): Promise<Record<ContentTypes, Schema>> {
	await widgets.initialize();

	if (!recompile && Object.keys(importsCache).length > 0) {
		return importsCache;
	}

	// Server-side production optimization
	if (!dev && !building && import.meta.env.SSR) {
		try {
			const { scanCompiledCollections } = await import('./collectionScanner');
			const compiledCollections = await scanCompiledCollections();
			const imports: Record<string, Schema> = {};
			for (const collection of compiledCollections) {
				if (collection._id && collection.name) {
					imports[collection.name] = collection;
				}
			}
			importsCache = imports as Record<ContentTypes, Schema>;
			logger.info(`✅ Loaded ${Object.keys(imports).length} collections via filesystem scanning`);
			return importsCache;
		} catch (error) {
			logger.warn('Failed to scan compiled collections, falling back to legacy import method:', error);
		}
	}

	try {
		const processModule = async (name: string, module: ProcessedModule, modulePath: string) => {
			const collection: any = (module as { schema: Schema })?.schema ?? {};
			if (collection) {
				// Use stable hash for collection IDs too if possible, but UUID is okay for now if singular
				const randomId = uuidv4();
				collection.name = name as ContentTypes;
				collection.icon = collection.icon || 'iconoir:info-empty';
				collection.id = parseInt(randomId.toString().slice(0, 8), 16);

				const pathSegments = modulePath.split('/config/collections/')[1]?.split('/') || [];
				const fileName = pathSegments.pop()?.replace(/\.ts$/, '') || '';
				const categoryPath = pathSegments.join('/');
				const collectionPath = categoryPath ? `/${categoryPath}/${fileName}` : `/${fileName}`;
				collection.path = collectionPath;

				importsCache[name as ContentTypes] = collection as Schema;
			} else {
				logger.error(`Error importing collection: ${name}`);
			}
		};

		if (dev || building) {
			const modules = import.meta.glob(
				[
					'../../config/collections/**/*.ts',
					'!../../config/collections/**/index.ts',
					'!../../config/collections/**/types.ts',
					'!../../config/collections/**/utils/**/*.ts'
				],
				{ eager: false, import: 'default' }
			);

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
			// Production Client-Side Fallback
			let files: string[] = [];
			try {
				const collectionsResponse = browser ? (await axios.get('/api/collections')).data : await getCollections(); // Recursion safety check needed?

				if (collectionsResponse.success && Array.isArray(collectionsResponse.data.collections)) {
					files = collectionsResponse.data.collections.map((c: { name: string }) => `${c.name}.js`);
				} else if (Array.isArray(collectionsResponse)) {
					files = collectionsResponse;
				} else {
					files = [];
				}
			} catch (error) {
				logger.error(`Error fetching collection files: ${error}`);
				files = [];
			}

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
								} catch (moduleError) {
									logger.error(`Error processing module ${name}: ${moduleError}`);
								}
							})
						);
					})
				);
			}
		}

		return importsCache;
	} catch (err) {
		logger.error(`Error in getImports: ${err}`);
		throw error(500, 'Failed to get imports');
	}
}

// --- Reactive Content System ---
let pollingInterval: NodeJS.Timeout | null = null;
let currentVersion: number = 0;

export async function initializeContent(pageData?: any) {
	// 1. Hydration (Server -> Client)
	if (pageData?.navigationStructure && pageData?.contentVersion) {
		logger.info('💧 Hydrating content from server data');
		currentVersion = pageData.contentVersion;

		// Transform navigation structure to internal format if needed,
		// or if the structure matches, just use it.
		// Note: getNavigationStructure returns a simplified tree.
		// We might need to map it back to the stores or adjust the stores to accept it.
		// For now, let's assume we still need to fetch the full collections if we want the full schema,
		// BUT for the sidebar navigation, the simplified structure is enough.

		// TODO: If we want full hydration, we should pass the full structure or
		// ensure the navigation structure is sufficient for the initial view.
		// For this optimization, let's assume we still fetch collections but we can skip if we have data.

		// Actually, let's trigger the update but use the version to avoid re-fetching if not needed.
	}

	// 2. Initial Load (if not hydrated or if we need full data)
	await updateCollections();

	// 3. Start Polling
	startPolling();
}

function startPolling() {
	if (pollingInterval || !browser) return;

	logger.info('📡 Starting content version polling');
	pollingInterval = setInterval(async () => {
		try {
			const response = await axios.get('/api/content/version');
			const serverVersion = response.data.version;

			if (serverVersion > currentVersion) {
				logger.info(`🆕 New content version detected: ${serverVersion} (current: ${currentVersion})`);
				currentVersion = serverVersion;
				await updateCollections(true);
			}
		} catch (error) {
			logger.warn('Failed to poll content version', error);
		}
	}, 10000); // Poll every 10 seconds
}

export function stopPolling() {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
}

export { contentStructure as categories };
