/**
 * @file src/routes/api/categories/+server.ts
 * @description Unified API endpoint for category management
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { collectionManager } from '@src/collections/CollectionManager';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@utils/logger';
import type { CategoryData } from '@src/collections/types';
import crypto from 'crypto';
import { backupCategoryFiles } from './backup-utils';

// Generate categories file content with proper headers
function generateCategoriesFileContent(data: Record<string, CategoryData>): string {
	return `/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 * 
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 * 
 * This file is generated from:
 * 1. Folder structure in config/collections/
 * 2. GUI & System updates via src/routes/api/categories
 * 
 * Translations are stored in the database, not in this file.
 */

import type { CategoryData } from './types';

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = ${JSON.stringify(data, null, 2)};
`;
}

// Process directory structure into categories while preserving existing IDs
async function processDirectory(dirPath: string, existingCategories: Record<string, CategoryData> = {}): Promise<Record<string, CategoryData>> {
	const categories: Record<string, CategoryData> = {};
	const items = await fs.readdir(dirPath);

	// Helper function to get existing category data
	function getExistingCategory(name: string, parentCategory?: CategoryData): CategoryData | undefined {
		if (existingCategories[name]) return existingCategories[name];
		if (parentCategory?.subcategories?.[name]) return parentCategory.subcategories[name];
		return undefined;
	}

	// First pass: Process directories (categories)
	for (const item of items) {
		if (item === '.DS_Store') continue;

		const fullPath = path.join(dirPath, item);
		const stats = await fs.stat(fullPath);

		// Only process directories as categories
		if (stats.isDirectory()) {
			const categoryName = item;
			const existingCategory = getExistingCategory(categoryName);
			const subcategories = await processDirectory(fullPath, existingCategory?.subcategories || {});

			categories[categoryName] = {
				id: existingCategory?.id || `c${crypto.randomBytes(4).toString('hex')}`,
				name: categoryName.replace(/([A-Z])/g, ' $1').trim(),
				icon: existingCategory?.icon || 'bi:folder',
				isCollection: false,
				...(Object.keys(subcategories).length > 0 && { subcategories })
			};
		}
	}

	// Second pass: Process .ts files (collections)
	for (const item of items) {
		if (!item.endsWith('.ts')) continue;

		const collectionTypes = path.parse(item).name;
		const existingCategory = getExistingCategory(collectionTypes);

		categories[CollectionTypes] = {
			id: existingCategory?.id || `c${crypto.randomBytes(4).toString('hex')}`,
			name: collectionTypes.replace(/([A-Z])/g, ' $1').trim(),
			icon: existingCategory?.icon || 'bi:file-text',
			isCollection: true
		};
	}

	return categories;
}

// Move collection files to match their new category locations
async function moveCollectionFiles(oldConfig: Record<string, CategoryData>, newConfig: Record<string, CategoryData>) {
	const collectionsPath = path.join(process.cwd(), 'config', 'collections');

	// Find all collections and their paths in a config
	function findCollections(config: Record<string, CategoryData>, currentPath: string = ''): Map<string, string> {
		const collections = new Map<string, string>();

		for (const [key, item] of Object.entries(config)) {
			const itemPath = path.join(currentPath, key);

			if (item.isCollection) {
				collections.set(item.name, itemPath);
			} else if (item.subcategories) {
				const subCollections = findCollections(item.subcategories, itemPath);
				for (const [name, subPath] of subCollections) {
					collections.set(name, subPath);
				}
			}
		}

		return collections;
	}

	const oldLocations = findCollections(oldConfig);
	const newLocations = findCollections(newConfig);

	// Move collection files that have changed location
	for (const [name, newLoc] of newLocations) {
		const oldLoc = oldLocations.get(name);
		if (oldLoc && oldLoc !== newLoc) {
			const oldPath = path.join(collectionsPath, oldLoc + '.ts');
			const newPath = path.join(collectionsPath, newLoc + '.ts');

			try {
				// Create the target directory if it doesn't exist
				await fs.mkdir(path.dirname(newPath), { recursive: true });

				// Move the collection file
				await fs.rename(oldPath, newPath);
				logger.info(`Moved collection ${name} to ${newPath}`);
			} catch (error) {
				logger.error(`Error moving collection ${name}:`, error);
				throw error;
			}
		}
	}
}

// Reads the existing configuration file
async function readExistingConfig(filePath: string): Promise<string> {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			logger.warn('Categories file does not exist, a new one will be created');
			return '';
		} else {
			logger.error('Error reading the categories file:', error);
			throw error;
		}
	}
}

// Check if categories file exists
async function categoriesFileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

// Compares the new configuration content with the existing one
function shouldUpdateConfig(newContent: string, existingContent: string): boolean {
	const newContentHash = crypto.createHash('md5').update(newContent).digest('hex');
	const existingContentHash = existingContent ? crypto.createHash('md5').update(existingContent).digest('hex') : '';
	return newContentHash !== existingContentHash;
}

export const GET: RequestHandler = async () => {
	try {
		const { categories } = collectionManager.getCollectionData();
		return json({
			success: true,
			categories
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in GET /api/categories:', errorMessage);
		return json({ error: 'Failed to fetch categories' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Check if this is a save action
		const data = await request.json();
		const isSaveAction = data?.save === true;

		if (!isSaveAction) {
			return json({
				success: true,
				message: 'No action taken - save flag not set'
			});
		}

		const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');
		const collectionsPath = path.join(process.cwd(), 'config', 'collections');

		// Check if we need to process directory structure
		const exists = await categoriesFileExists(categoriesPath);
		let oldConfig = {};

		if (exists) {
			const existingModule = await import(categoriesPath);
			oldConfig = existingModule.categoryConfig;
		}

		// Process directory structure while preserving existing IDs
		const newConfig = exists && data.categories ? data.categories : await processDirectory(collectionsPath, oldConfig);

		// Move collection files if needed
		if (exists) {
			await moveCollectionFiles(oldConfig, newConfig);
		}

		// Generate the new categories file content
		const newContent = generateCategoriesFileContent(newConfig);
		const existingContent = await readExistingConfig(categoriesPath);

		// Only update if content has changed
		if (shouldUpdateConfig(newContent, existingContent)) {
			// Backup the current category configuration before saving
			if (exists) {
				await backupCategoryFiles();
				logger.info('Category files backed up successfully');
			}

			// Write the updated categories file
			await fs.writeFile(categoriesPath, newContent, 'utf-8');

			// Update collections to reflect the changes
			await collectionManager.updateCollections(true);

			logger.info('Categories updated successfully');
			return json({
				success: true,
				message: 'Categories updated successfully'
			});
		} else {
			logger.info('Categories file does not need an update');
			return json({
				success: true,
				message: 'Categories are already up to date'
			});
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in POST /api/categories:', errorMessage);
		return json({ error: 'Failed to update categories' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { categoryId, updates } = await request.json();
		const { categories } = collectionManager.getCollectionData();

		// Find and update the category
		function updateCategory(cats: Record<string, CategoryData>, id: string): boolean {
			for (const key in cats) {
				if (cats[key].id === categoryId) {
					// Update category properties while preserving the ID
					Object.assign(cats[key], { ...updates, id: cats[key].id });
					return true;
				}
				if (cats[key].subcategories) {
					if (updateCategory(cats[key].subcategories!, id)) {
						return true;
					}
				}
			}
			return false;
		}

		if (updateCategory(categories, categoryId)) {
			// Generate new content
			const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');
			const newContent = generateCategoriesFileContent(categories);
			const existingContent = await readExistingConfig(categoriesPath);

			// Only update if content has changed
			if (shouldUpdateConfig(newContent, existingContent)) {
				// Backup before saving
				await backupCategoryFiles();
				logger.info('Category files backed up successfully');

				// Write the file
				await fs.writeFile(categoriesPath, newContent, 'utf-8');

				// Update collections to reflect the changes
				await collectionManager.updateCollections(true);

				logger.info(`Category ${categoryId} updated successfully`);
				return json({
					success: true,
					message: 'Category updated successfully',
					categories
				});
			} else {
				return json({
					success: true,
					message: 'Category is already up to date',
					categories
				});
			}
		}

		return json({ error: 'Category not found' }, { status: 404 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in PUT /api/categories:', errorMessage);
		return json({ error: 'Failed to update category' }, { status: 500 });
	}
};
