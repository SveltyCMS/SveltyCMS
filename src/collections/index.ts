import { browser, building, dev } from '$app/environment';
import axios from 'axios';
import deepmerge from 'deepmerge';

import { createCategories } from './config';
import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';

// Store
import { categories, collections, unAssigned } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Components
import { initWidgets } from '@components/widgets';

import { defaultPermissions } from '@src/auth/types';
import type { Schema, CollectionNames } from './types';

// System logger
import {logger} from '@src/utils/logger';

let imports = {} as { [key in CollectionNames]: Schema };
let rnd = Math.random();
let unsubscribe: Unsubscriber | undefined;

// Cache for collection models
let collectionModelsCache: { [key: string]: any } | null = null;

export async function getCollections() {
	logger.debug('Starting getCollections');

	initWidgets();
	if (collectionModelsCache) {
		logger.debug(`Returning cached collections. Number of collections: ${Object.keys(collectionModelsCache).length}`);
		return collectionModelsCache;
	}
	return new Promise<{ [key in CollectionNames]: Schema }>((resolve) => {
		unsubscribe = collections.subscribe((cols) => {
			if (Object.keys(cols)?.length > 0) {
				unsubscribe && unsubscribe();
				unsubscribe = undefined;
				collectionModelsCache = cols;
				resolve(cols);
			}
		});
	});
}
export const updateCollections = async (recompile: boolean = false) => {
	logger.debug('Starting updateCollections');

	if (recompile) rnd = Math.random();

	try {
		const imports = await getImports(recompile);
		let _categories = createCategories(imports);

		// If not running in development or building mode
		if (!dev && !building) {
			// Define config file name
			const config = 'config.js?' + rnd;
			const { createCategories: newCreateCategories } = browser
				? await import(/* @vite-ignore */ '/api/importCollection/' + config)
				: await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS + config);

			// Create categories using new version of createCategories function and imports object
			_categories = newCreateCategories(imports);
		}

		// Filter out empty categories
		_categories = _categories.map((category) => ({
			...category,
			collections: category.collections.filter(Boolean)
		}));

		// Define categories and collections
		const _collections = _categories
			.flatMap((x) => x.collections)
			.reduce(
				(acc, x) => {
					if (x && x.name) {
						acc[x.name] = x;
					}
					return acc;
				},
				{} as { [key in CollectionNames]: Schema }
			);

		categories.set(_categories);
		logger.debug('Setting collections:', { collections: Object.keys(_collections) });
		collections.set(_collections); // returns all collections
		unAssigned.set(Object.values(imports).filter((x) => !Object.values(_collections).includes(x)));

		if (typeof window === 'undefined') {
			const { getCollectionModels } = await import('@api/databases/db');
			await getCollectionModels();
		}

		logger.debug(`Collections updated. Number of collections: ${Object.keys(_collections).length}`);
	} catch (error) {
		logger.error('Error updating collections:', error as Error);
		throw error;
	}
};

updateCollections().catch((error) => {
	logger.error('Failed to initialize collections:', error);
});

async function getImports(recompile: boolean = false): Promise<{ [key in CollectionNames]: Schema }> {
	logger.debug('Starting getImports function');

	if (Object.keys(imports).length && !recompile) return imports;
	imports = {} as { [key in CollectionNames]: Schema };

	try {
		if (dev || building) {
			logger.debug('Running in dev or building mode');
			const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./types.ts', '!./Auth.ts', '!./config.ts']);

			for (const [modulePath, moduleImport] of Object.entries(modules)) {
				const name = modulePath.replace(/.ts$/, '').replace('./', '') as CollectionNames;
				const module = await moduleImport();
				const collection = (module as any).default ?? {};

				if (collection) {
					collection.name = name;
					collection.icon = collection.icon || 'iconoir:info-empty';
					imports[name] = collection;
				} else {
					logger.error(`Error importing collection: ${name}`);
				}
			}
			// If not running in browser environment
		} else {
			logger.debug('Running in production mode');
			const files = browser ? (await axios.get('/api/getCollections')).data : getCollectionFiles();

			// Dynamically import returned files from folder specified by import.meta.env.collectionsFolder
			for (const file of files) {
				const name = file.replace(/.js$/, '') as CollectionNames;
				let collectionModule:any=null;
				if(typeof window !== 'undefined')
				collectionModule =(await axios.get('/api/getCollection?fileName=' + file + '?' + rnd)).data;
			else
			collectionModule = await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS + file + '?' + rnd);
				const collection = collectionModule.default;

				if (collection) {
					collection.name = name;
					collection.icon = collection.icon || 'iconoir:info-empty';
					imports[name] = collection;
				} else {
					logger.error(`Error importing collection: ${name}`);
				}
			}
		}

		for (const key in imports) {
			imports[key].permissions = deepmerge(defaultPermissions, imports[key].permissions || {});
		}

		logger.debug('Imported collections:', { collections: Object.keys(imports) });
		return imports;
	} catch (error) {
		logger.error('Error in getImports:', error as Error);
		throw error;
	}
}

export { categories };
