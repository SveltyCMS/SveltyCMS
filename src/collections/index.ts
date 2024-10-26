/**
 * @file src/collections/index.ts
 * @description Index file for collections. Manages collection loading, caching, and updates using a folder-based structure.
 */

import { error } from '@sveltejs/kit';
import { browser, building, dev } from '$app/environment';
import axios from 'axios';
import deepmerge from 'deepmerge';
import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';
import { createRandomID } from '@utils/utils';

// Stores
import { categories, collections, unAssigned, collection, collectionValue, mode } from '@stores/collectionStore';
import type { Unsubscriber } from 'svelte/store';

// Components
import { initWidgets } from '@components/widgets';

// Types
import type { Schema, CollectionNames } from './types';

// System logger
import { logger } from '@utils/logger';

// Cache for collection models
let importsCache: Partial<Record<CollectionNames, Schema>> = {};
let unsubscribe: Unsubscriber | undefined;
// Cache for collection models
let collectionModelsCache: Partial<Record<CollectionNames, Schema>> | null = null;

// Function to parse path and create nested categories
function parsePath(path: string): string[] {
	// Handle :: notation for virtual paths
	return path.split('::').map((segment) => segment.trim());
}

// Function to merge permissions recursively
function mergePermissions(parentPerms: Record<string, any> = {}, childPerms: Record<string, any> = {}): Record<string, any> {
	return deepmerge(parentPerms, childPerms);
}

interface CategoryNode {
	id: number;
	name: string;
	icon: string;
	collections: Schema[];
	subcategories: Record<string, CategoryNode>;
}

// Function to create categories from folder structure
async function createCategoriesFromPath(collections: Schema[]): Promise<Array<{ id: number; name: string; icon: string; collections: Schema[] }>> {
	const categoryTree: Record<string, CategoryNode> = {};

	for (const col of collections) {
		if (!col.path) continue;

		const pathSegments = parsePath(col.path);
		let currentLevel = categoryTree;
		let currentPermissions = {};

		for (const segment of pathSegments) {
			if (!currentLevel[segment]) {
				const randomId = await createRandomID();
				currentLevel[segment] = {
					id: parseInt(randomId.toString().slice(0, 8), 16),
					name: segment,
					icon: col.categoryIcon || 'iconoir:category',
					collections: [],
					subcategories: {}
				};
			}

			// Merge permissions along the path
			currentPermissions = mergePermissions(currentPermissions, col.permissions || {});

			if (segment === pathSegments[pathSegments.length - 1]) {
				currentLevel[segment].collections.push(col);
			}

			currentLevel = currentLevel[segment].subcategories;
		}
	}

	// Convert tree to flat array
	const result: Array<{ id: number; name: string; icon: string; collections: Schema[] }> = [];

	function processCategory(category: CategoryNode) {
		result.push({
			id: category.id,
			name: category.name,
			icon: category.icon,
			collections: category.collections
		});

		Object.values(category.subcategories).forEach(processCategory);
	}

	Object.values(categoryTree).forEach(processCategory);
	return result;
}

// Function to get collections with cache support
export async function getCollections(): Promise<Partial<Record<CollectionNames, Schema>>> {
	logger.debug('Starting getCollections');
	// Initialize widgets
	initWidgets();

	// Return cached collections if available
	if (collectionModelsCache) {
		logger.debug(`Returning cached collections. Count: ${Object.keys(collectionModelsCache).length}`);
		return collectionModelsCache;
	}

	return new Promise<Partial<Record<CollectionNames, Schema>>>((resolve) => {
		unsubscribe = collections.subscribe((cols) => {
			if (Object.keys(cols).length > 0) {
				unsubscribe?.();
				collectionModelsCache = cols;
				resolve(cols);
			}
		});
	});
}

// Function to update collections
export const updateCollections = async (recompile: boolean = false): Promise<void> => {
	logger.debug('Starting updateCollections');

	if (recompile) {
		importsCache = {}; // Clear cache
	}

	try {
		const imports = await getImports(recompile);
		logger.debug(`Imports fetched. Count: ${Object.keys(imports).length}`);

		const fullImports = imports as Record<CollectionNames, Schema>;
		const _categories = await createCategoriesFromPath(Object.values(fullImports));

		const _collections: Partial<Record<CollectionNames, Schema>> = {};
		for (const category of _categories) {
			for (const col of category.collections) {
				if (col.name) {
					_collections[col.name] = col;
				}
			}
		}

		logger.debug(`Collections processed. Count: ${Object.keys(_collections).length}`);

		categories.set(_categories);
		collections.set(_collections as Record<CollectionNames, Schema>);
		unAssigned.set(Object.values(imports).filter((x) => !Object.values(_collections).includes(x)));

		if (typeof window === 'undefined') {
			logger.debug('Fetching collection models in server-side environment');
			try {
				const { getCollectionModels } = await import('@src/databases/db');
				await getCollectionModels();
				logger.debug('Collection models fetched successfully');
			} catch (dbError) {
				logger.error(`Error fetching collection models: ${dbError}`);
				throw error(500, `Failed to fetch collection models: ${dbError}`);
			}
		}

		collection.set({} as Schema);
		collectionValue.set({});
		mode.set('view');

		logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
	} catch (err) {
		logger.error(`Error in updateCollections: ${err}`);
		throw error(500, `Failed to update collections: ${err}`);
	}
};

// Initialize collections
updateCollections().catch((err) => {
	logger.error(`Failed to initialize collections: ${err}`);
	throw error(500, `Failed to initialize collections: ${err}`);
});

// Function to get imports based on environment
async function getImports(recompile: boolean = false): Promise<Partial<Record<CollectionNames, Schema>>> {
	logger.debug('Starting getImports function');

	// Return from cache if available
	if (!recompile && Object.keys(importsCache).length) {
		logger.debug('Returning from cache');
		return importsCache;
	}

	try {
		const processModule = async (name: string, module: any) => {
			const collection = (module as { schema: Schema })?.schema ?? {};
			if (collection) {
				const randomId = await createRandomID();
				collection.name = name as CollectionNames;
				collection.icon = collection.icon || 'iconoir:info-empty';
				collection.id = parseInt(randomId.toString().slice(0, 8), 16); // Generate ID from random hex
				// Extract path from module location if not explicitly set
				if (!collection.path) {
					const modulePath = module.__file || '';
					collection.path = modulePath
						.split('/')
						.slice(0, -1) // Remove filename
						.filter(Boolean)
						.join('::');
				}
				importsCache[name as CollectionNames] = collection as Schema;
			} else {
				logger.error(`Error importing collection: ${name}`);
			}
		};

		// Development/Building mode
		if (dev || building) {
			logger.debug(`Running in {${dev ? 'dev' : 'building'}} mode`);
			// Recursively import all .ts files from collections directory
			const modules = import.meta.glob(['./**/*.ts', '!./index.ts', '!./types.ts']);
			for (const [modulePath, moduleImport] of Object.entries(modules)) {
				const name = modulePath.split('/').pop()?.replace(/\.ts$/, '') || '';
				const module = await moduleImport();
				await processModule(name, module);
			}
		} else {
			// Production mode
			logger.debug('Running in production mode');
			let files: string[] = [];
			try {
				files = browser ? (await axios.get('/api/getCollections')).data : await getCollectionFiles();
				if (!Array.isArray(files)) {
					logger.error(`Files is not an array: ${JSON.stringify(files)}`);
					files = [];
				}
			} catch (error) {
				logger.error(`Error fetching collection files: ${error instanceof Error ? error.message : String(error)}`);
				files = [];
			}

			for (const file of files) {
				const name = file.replace(/\.js$/, '');
				try {
					const collectionModule =
						typeof window !== 'undefined'
							? (await axios.get(`/api/getCollection?fileName=${file}?_t=${Math.floor(Date.now() / 1000)}`)).data
							: await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${file}`);

					await processModule(name, collectionModule);
				} catch (moduleError) {
					logger.error(`Error processing module ${name}: ${moduleError instanceof Error ? moduleError.message : String(moduleError)}`);
				}
			}
		}

		logger.debug('Imported collections:', { collections: Object.keys(importsCache) });
		return importsCache;
	} catch (err) {
		logger.error(`Error in getImports: ${err instanceof Error ? err.message : String(err)}`);
		throw error(500, `Failed to get imports: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export { categories };
