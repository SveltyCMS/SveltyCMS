import { browser, building, dev } from '$app/environment';
import axios from 'axios';
import { createCategories } from './config';
import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';

// Stores
import { categories, collections, unAssigned } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Components
import { initWidgets } from '@components/widgets';

// Types for schemas and collection names
import type { Schema, CollectionNames } from './types';

// System logger
import logger from '@src/utils/logger';

// Cache for collection models
let importsCache: Record<CollectionNames, Schema> = {} as Record<CollectionNames, Schema>;
let unsubscribe: Unsubscriber | undefined; // Store unsubscriber handler

// Cache for collection models
let collectionModelsCache: Record<string, any> | null = null;

// Function to get collections with cache support
export async function getCollections(): Promise<Record<CollectionNames, Schema>> {
	logger.debug('Starting getCollections');

	// Initialize widgets
	initWidgets();

	// Return cached collections if available
	if (collectionModelsCache) {
		logger.debug(`Returning cached collections. Number of collections: ${Object.keys(collectionModelsCache).length}`);
		return collectionModelsCache;
	}

	// Set up a promise to resolve collections from the store
	return new Promise<Record<CollectionNames, Schema>>((resolve) => {
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
		importsCache = {} as Record<CollectionNames, Schema>; // Clear cache with type
	}

	try {
		const imports = await getImports(recompile);
		let _categories = createCategories(imports);

		if (!dev && !building) {
			const config = `config.js?${Date.now()}`; // Unique identifier for caching
			const { createCategories: newCreateCategories } = browser
				? await import(/* @vite-ignore */ `/api/importCollection/${config}`)
				: await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${config}`);
			_categories = newCreateCategories(imports);
		}

		_categories = _categories.map((category) => ({
			...category,
			collections: category.collections.filter(Boolean)
		}));

		const _collections = _categories.reduce(
			(acc, category) => {
				category.collections.forEach((collection) => {
					if (collection && collection.name) {
						acc[collection.name] = collection;
					}
				});
				return acc;
			},
			{} as Record<CollectionNames, Schema>
		);

		categories.set(_categories);
		collections.set(_collections);
		unAssigned.set(Object.values(imports).filter((x) => !Object.values(_collections).includes(x)));

		if (typeof window === 'undefined') {
			const { getCollectionModels } = await import('@src/databases/db');
			await getCollectionModels(); // Fetch collection models in server-side environment
		}

		logger.debug(`Collections updated. Number of collections: ${Object.keys(_collections).length}`);
	} catch (error) {
		logger.error('Error updating collections:', error as Error);
		throw error;
	}
};

// Initialize collections and handle errors
updateCollections().catch((error) => {
	logger.error('Failed to initialize collections:', error);
});

// Function to get imports based on environment
async function getImports(recompile: boolean = false): Promise<Record<CollectionNames, Schema>> {
	logger.debug('Starting getImports function');

	if (!recompile && Object.keys(importsCache).length) return importsCache;

	try {
		if (dev || building) {
			logger.debug('Running in dev or building mode');
			const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./types.ts', '!./Auth.ts', '!./config.ts']);
			for (const [modulePath, moduleImport] of Object.entries(modules)) {
				const name = modulePath.replace(/.ts$/, '').replace('./', '') as CollectionNames;
				const module = await moduleImport();
				const collection = (module as { default: Schema }).default ?? {}; // Ensure typing of imported modules

				if (collection) {
					collection.name = name;
					collection.icon = collection.icon || 'iconoir:info-empty';
					importsCache[name] = collection;
				} else {
					logger.error(`Error importing collection: ${name}`);
				}
			}
		} else {
			logger.debug('Running in production mode');
			const files = browser ? (await axios.get('/api/getCollections')).data : getCollectionFiles();

			for (const file of files) {
				const name = file.replace(/.js$/, '') as CollectionNames;
				const collectionModule =
					typeof window !== 'undefined'
						? (await axios.get(`/api/getCollection?fileName=${file}?${Date.now()}`)).data
						: await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${file}?${Date.now()}`);

				const collection = (collectionModule as { default: Schema })?.default; // Ensure proper typing
				if (collection) {
					collection.name = name;
					collection.icon = collection.icon || 'iconoir:info-empty';
					importsCache[name] = collection;
				} else {
					logger.error(`Error importing collection: ${name}`);
				}
			}
		}

		logger.debug('Imported collections:', { collections: Object.keys(importsCache) });
		return importsCache;
	} catch (error) {
		logger.error('Error in getImports:', error as Error);
		throw error;
	}
}

export { categories };
