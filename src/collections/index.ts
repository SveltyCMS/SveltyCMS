import { browser, building, dev } from '$app/environment';
import axios from 'axios';
import { createCategories } from './config';
import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';
import { categories, collections, unAssigned } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';
import { initWidgets } from '@components/widgets';
import type { Schema } from './types';
import deepmerge from 'deepmerge';
import { defaultPermissions } from '@src/auth/types';

let imports: { [Key: string]: Schema } = {};
let rnd = Math.random();
let unsubscribe: Unsubscriber | undefined;

// Define getCollections function to return a promise that resolves with the value of the collections store
export async function getCollections() {
	initWidgets();
	return new Promise<any>((resolve) => {
		unsubscribe = collections.subscribe((collections) => {
			if (collections?.length > 0) {
				// collection.set(collections[0]);
				unsubscribe && unsubscribe();
				unsubscribe = undefined;
				resolve(collections);
			}
		});
	});
}

// Dynamic Import of Categories and Collections even from build system
export const updateCollections = async (recompile: boolean = false) => {
	if (recompile) rnd = Math.random();

	await getImports(recompile).then(async (imports) => {
		// Create categories using createCategories function and imports object
		let _categories = createCategories(imports);

		// If not running in development or building mode
		if (!dev && !building) {
			// Define config file name
			const config = 'config.js?' + rnd;
			const { createCategories } = browser
				? await import(/* @vite-ignore */ '/api/importCollection/' + config)
				: await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS + config);

			// Create categories using new version of createCategories function and imports object
			_categories = createCategories(imports);
		}

		// For each category Filter out undefined collections
		for (const _category of _categories) {
			_category.collections = _category.collections.filter((x) => !!x == true);
		}
		const _collections = _categories.map((x) => x.collections).reduce((x, acc) => x.concat(acc));
		categories.set(_categories);
		collections.set(_collections); // returns all collections
		unAssigned.set(Object.values(imports).filter((x) => !_collections.includes(x)));
	});
};

updateCollections();

// Export stores and functions
export { categories };

// Define getImports function to dynamically populate imports object
async function getImports(recompile: boolean = false) {
	// If imports object is not empty, return its current value
	if (Object.keys(imports).length && !recompile) return imports;
	imports = {};
	// If running in development or building mode
	if (dev || building) {
		// Dynamically import all TypeScript files in current directory, except for specified files
		const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./types.ts', '!./Auth.ts', '!./config.ts']);

		// Add imported modules to imports object
		for (const module in modules) {
			const name = module.replace(/.ts$/, '').replace('./', '');
			const collection = ((await modules[module]()) as any).default ?? {};
			if (collection) {
				collection.name = name;
				!collection.icon && (collection.icon = 'iconoir:info-empty');
				imports[name] = collection;
			} else {
				console.error('Error importing collection', name, collection);
			}
		}

		// If not running in development or building mode
	} else {
		// If running in browser environment
		if (browser) {
			const files = ((await axios.get('/api/getCollections')) as any).data;
			// console.log('browser files', files);

			// Dynamically import returned files from /api/collections/
			for (const file of files) {
				const name = file.replace(/.js$/, '');
				const collection = (await import(/* @vite-ignore */ '/api/importCollection/' + file + '?' + rnd)).default;
				if (collection) {
					collection.name = name;
					!collection.icon && (collection.icon = 'iconoir:info-empty');
					imports[name] = collection;
				} else {
					console.error('Error importing collection', name, collection);
				}
			}

			// If not running in browser environment
		} else {
			const files = getCollectionFiles();

			// Dynamically import returned files from folder specified by import.meta.env.collectionsFolder
			for (const file of files) {
				const name = file.replace(/.js$/, '');
				const collection = (await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS + file + '?' + rnd)).default;
				if (collection) {
					collection.name = name;
					!collection.icon && (collection.icon = 'iconoir:info-empty');
					imports[name] = collection;
				} else {
					console.error('Error importing collection', name, collection);
				}
			}
		}
	}

	for (const key in imports) {
		const collection = imports[key];
		collection.permissions = deepmerge(defaultPermissions, collection.permissions || {});
	}

	//console.log(imports);
	return imports;
}
