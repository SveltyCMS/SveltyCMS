import { error, redirect } from '@sveltejs/kit';
import { dev, browser } from '../../../chunks/index3.js';
import axios from 'axios';
import { v4 } from 'uuid';
import {
	a as contentStructure,
	c as collections,
	u as unAssigned,
	s as setCollection,
	b as setCollectionValue,
	d as setMode
} from '../../../chunks/collectionStore.svelte.js';
import { widgets } from '../../../chunks/widgetStore.svelte.js';
import { logger } from '../../../chunks/logger.js';
import { b as building } from '../../../chunks/environment.js';
import { l as logger$1 } from '../../../chunks/logger.server.js';
const BATCH_SIZE = 50;
const CONCURRENT_BATCHES = 5;
let importsCache = {};
let collectionModelsCache = null;
const categoryLookup = /* @__PURE__ */ new Map();
const collectionsByCategory = /* @__PURE__ */ new Map();
function chunks(arr, size) {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}
function stringToHash(str) {
	let hash = 0;
	if (str.length === 0) return hash;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return Math.abs(hash);
}
async function getCurrentPath() {
	try {
		const { dbAdapter } = await import('../../../chunks/db.js').then((n) => n.e);
		if (!dbAdapter) return getDefaultPathConfig();
		const result = await dbAdapter.content.nodes.getStructure('flat');
		if (!result.success || !result.data) {
			logger.warn('Failed to get content nodes from database');
			return getDefaultPathConfig();
		}
		const currentPath = '';
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
async function processBatch(collections2) {
	for (const col of collections2) {
		if (!col.path) {
			logger.warn(`Collection ${col.name} has no path`);
			continue;
		}
		const pathSegments = col.path.split('/');
		let currentPath = '';
		let currentMap = categoryLookup;
		for (let i = 0; i < pathSegments.length; i++) {
			const segment = pathSegments[i] ?? '';
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			if (!currentMap.has(segment)) {
				const configData = await getCurrentPath();
				const stableId = stringToHash(segment);
				const newNode = {
					id: stableId,
					name: segment,
					icon: configData.config.icon ?? '',
					order: 'order' in configData.config && typeof configData.config.order === 'number' ? configData.config.order : 0,
					collections: [],
					subcategories: /* @__PURE__ */ new Map()
				};
				currentMap.set(segment, newNode);
				categoryLookup.set(currentPath, newNode);
				collectionsByCategory.set(currentPath, /* @__PURE__ */ new Set());
			}
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
function flattenAndSortCategories() {
	const result = {};
	const sortedCategories = Array.from(categoryLookup.entries()).sort(([, a], [, b]) => a.order - b.order);
	for (const [path, category] of sortedCategories) {
		const collections2 = Array.from(collectionsByCategory.get(path) || []).sort((a, b) => {
			const orderA = a && typeof a.order === 'number' ? a.order : 0;
			const orderB = b && typeof b.order === 'number' ? b.order : 0;
			return orderA - orderB;
		});
		result[path] = {
			id: category.id.toString(),
			name: category.name,
			icon: category.icon,
			collections: collections2,
			subcategories: {}
		};
	}
	return result;
}
async function createCategoriesFromPath(collections2) {
	categoryLookup.clear();
	collectionsByCategory.clear();
	const batches = chunks(collections2, BATCH_SIZE);
	for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
		const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
		await Promise.all(currentBatches.map(processBatch));
	}
	const categoriesObject = flattenAndSortCategories();
	const result = Object.values(categoriesObject).map((cat) => ({
		id: parseInt(cat.id),
		name: cat.name,
		icon: cat.icon,
		order: 0,
		collections: cat.collections.map((col) => col.name || '').filter(Boolean),
		subcategories: void 0
	}));
	return result;
}
async function getCollections() {
	await widgets.initialize();
	if (collectionModelsCache) {
		return collectionModelsCache;
	}
	collectionModelsCache = collections.all;
	return collections.all;
}
const updateCollections = async (recompile = false) => {
	logger.trace('Starting updateCollections');
	if (recompile) {
		importsCache = {};
	}
	try {
		const imports = await getImports(recompile);
		const _categories = await createCategoriesFromPath(Object.values(imports));
		const _collections = {};
		for (const category of _categories) {
			for (const collectionName of category.collections) {
				const col = imports[collectionName];
				if (col && col.name) {
					_collections[col.name] = col;
				}
			}
		}
		contentStructure.value = _categories.map((cat) => ({
			_id: cat.id.toString(),
			name: cat.name,
			nodeType: 'category',
			icon: cat.icon,
			order: cat.order,
			parentId: void 0,
			path: '',
			translations: [],
			collectionDef: void 0,
			children: [],
			createdAt: /* @__PURE__ */ new Date().toISOString(),
			updatedAt: /* @__PURE__ */ new Date().toISOString()
		}));
		Object.keys(collections.all).forEach((key) => delete collections.all[key]);
		Object.assign(collections.all, _collections);
		const unassigned = Object.values(imports).filter((x) => !Object.values(_collections).includes(x));
		Object.assign(unAssigned, unassigned.length > 0 ? unassigned[0] : { fields: [] });
		setCollection({});
		setCollectionValue({});
		setMode('view');
		if (importsCache && Object.keys(importsCache).length > 0) {
		}
		logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
	} catch (err) {
		logger.error(`Error in updateCollections: ${err}`);
	}
};
async function getImports(recompile = false) {
	await widgets.initialize();
	if (!recompile && Object.keys(importsCache).length > 0) {
		return importsCache;
	}
	if (!building && true) {
		try {
			const { scanCompiledCollections } = await import('../../../chunks/collectionScanner.js');
			const compiledCollections = await scanCompiledCollections();
			const imports = {};
			for (const collection of compiledCollections) {
				if (collection._id && collection.name) {
					imports[collection.name] = collection;
				}
			}
			importsCache = imports;
			logger.info(`✅ Loaded ${Object.keys(imports).length} collections via filesystem scanning`);
			return importsCache;
		} catch (error2) {
			logger.warn('Failed to scan compiled collections, falling back to legacy import method:', error2);
		}
	}
	try {
		const processModule = async (name, module, modulePath) => {
			const collection = module?.schema ?? {};
			if (collection) {
				const randomId = v4();
				collection.name = name;
				collection.icon = collection.icon || 'iconoir:info-empty';
				collection.id = parseInt(randomId.toString().slice(0, 8), 16);
				const pathSegments = modulePath.split('/config/collections/')[1]?.split('/') || [];
				const fileName = pathSegments.pop()?.replace(/\.ts$/, '') || '';
				const categoryPath = pathSegments.join('/');
				const collectionPath = categoryPath ? `/${categoryPath}/${fileName}` : `/${fileName}`;
				collection.path = collectionPath;
				importsCache[name] = collection;
			} else {
				logger.error(`Error importing collection: ${name}`);
			}
		};
		if (dev || building) {
			const modules = /* @__PURE__ */ Object.assign({});
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
								await processModule(name, module, modulePath);
							})
						);
					})
				);
			}
		} else {
			let files = [];
			try {
				const collectionsResponse = browser ? (await axios.get('/api/collections')).data : await getCollections();
				if (collectionsResponse.success && Array.isArray(collectionsResponse.data.collections)) {
					files = collectionsResponse.data.collections.map((c) => `${c.name}.js`);
				} else if (Array.isArray(collectionsResponse)) {
					files = collectionsResponse;
				} else {
					files = [];
				}
			} catch (error2) {
				logger.error(`Error fetching collection files: ${error2}`);
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
											? (await axios.get(`/api/collections/${name}?includeFields=true&_t=${Math.floor(Date.now() / 1e3)}`)).data
											: await import(
													/* @vite-ignore */
													`${void 0}${file}`
												);
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
const load = async ({ params }) => {
	const { language } = params;
	try {
		await updateCollections();
		const collections2 = await getCollections();
		const collectionList = Object.values(collections2).filter(Boolean);
		logger$1.info('[Language Redirect] Collections loaded', {
			language,
			collectionCount: collectionList.length,
			collectionNames: collectionList.map((c) => c?.name)
		});
		if (collectionList.length === 0) {
			logger$1.info('[Language Redirect] No collections found, redirecting to collectionbuilder');
			throw redirect(302, `/config/collectionbuilder`);
		}
		const firstCollection = collectionList.find((c) => c && c.path);
		if (firstCollection && firstCollection.path) {
			const redirectPath = firstCollection.path.startsWith(`/${language}`) ? firstCollection.path : `/${language}${firstCollection.path}`;
			logger$1.info('[Language Redirect] Redirecting to first collection', {
				collectionName: firstCollection.name,
				collectionPath: firstCollection.path,
				redirectPath
			});
			throw redirect(302, redirectPath);
		}
		logger$1.warn('[Language Redirect] No collection with valid path found, redirecting to collectionbuilder');
		throw redirect(302, `/config/collectionbuilder`);
	} catch (error2) {
		if (error2 && typeof error2 === 'object' && 'status' in error2 && error2.status === 302) {
			throw error2;
		}
		logger$1.error('Error in language redirect', { error: error2 });
		throw redirect(302, `/config/collectionbuilder`);
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
