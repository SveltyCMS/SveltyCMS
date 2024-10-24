/**
 * @file src/collections/index.ts
 * @description Index file for collections. Manages collection loading, caching, and updates.
 */

import { error } from '@sveltejs/kit';
import { browser, building, dev } from '$app/environment';
import axios from 'axios';
import { createCategories } from './config';
import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';

// Stores
import { categories, collections, unAssigned, collection, collectionValue, mode } from '@stores/collectionStore';
import type { Unsubscriber } from 'svelte/store';

// Components
import { initWidgets } from '@components/widgets';

// Types
import { type Schema, type CollectionNames } from './types';
import { CollectionNamesArray } from './types'

// System logger
import { logger } from '@utils/logger';

// Cache for collection models
let importsCache: Partial<Record<CollectionNames, Schema>> = {};
let unsubscribe: Unsubscriber | undefined;
// Cache for collection models
let collectionModelsCache: Partial<Record<CollectionNames, Schema>> | null = null;

// Type Guard Function to validate collection names
export function isCollectionName(name: string): name is CollectionNames {
	return CollectionNamesArray.includes(name);
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
		let _categories = createCategories(fullImports);

		if (!dev && !building) {
			logger.debug('Fetching new createCategories function');
			try {
				const config = `config.js?${Math.floor(Date.now() / 1000)}`; // Update cache timestamp
				const { createCategories: newCreateCategories } = browser
					? await import(/* @vite-ignore */ `/api/importCollection/${config}`)
					: await import(/* @vite-ignore */ `${import.meta.env.VITE_COLLECTIONS_FOLDER_JS}${config}`);
				_categories = newCreateCategories(fullImports);
				logger.debug('New categories created successfully');
			} catch (importError) {
				logger.error(`Error importing new createCategories function: ${importError}`);
			}
		}

		const _collections: Partial<Record<CollectionNames, Schema>> = {};
		_categories.forEach((category) => {
			category.collections.forEach((col) => {
				if (col.name && isCollectionName(col.name)) {
					_collections[col.name] = col;
				}
			});
		});

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
			if (!isCollectionName(name)) {
				logger.error(`Invalid collection name: ${name}`);
				return; // Skip invalid module
			}
			const collection = (module as { schema: Schema })?.schema ?? {};
			if (collection) {
				collection.name = name;
				collection.icon = collection.icon || 'iconoir:info-empty';
				importsCache[name] = collection;
			} else {
				logger.error(`Error importing collection: ${name}`);
			}
		};

		// Development/Building mode
		if (dev || building) {
			logger.debug('Running in dev or building mode');
			const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./types.ts', '!./config.ts']);
			for (const [modulePath, moduleImport] of Object.entries(modules)) {
				const name = modulePath.replace(/\.ts$/, '').replace('./', '');
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
							? (await axios.get(`/api/getCollection?fileName=${file}?${Math.floor(Date.now() / 1000)}`)).data
							: await import(/* @vite-ignore */ `${import.meta.env.VITE_COLLECTIONS_FOLDER_JS}${file}?${Math.floor(Date.now() / 1000)}`);

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
