/**
 * @file src/routes/api/categories/+server.ts
 * @description API endpoints for category management
 *
 * Features:
 * - Category structure retrieval
 * - Category updates
 * - Icon and order management
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { collectionManager } from '@src/collections/CollectionManager';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@utils/logger';
import type { CategoryData } from '@src/collections/types';

// Generate categories file content
function generateCategoriesFileContent(data: Record<string, CategoryData>): string {
	return `/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 * 
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 * 
 * This file is generated from:
 * 1. Folder structure in src/collections/
 * 2. GUI updates via /api/save-categories
 * 3. System updates via /api/updateCategories
 * 
 * Translations are stored in the database, not in this file.
 */

import type { CategoryData } from './types';

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = ${JSON.stringify(data, null, 2)};
`;
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
		const data = await request.json();
		const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');

		// Generate the new categories file content
		const content = generateCategoriesFileContent(data);

		// Write the updated categories file
		await fs.writeFile(categoriesPath, content, 'utf-8');

		// Update collections to reflect the changes
		await collectionManager.updateCollections(true);

		logger.info('Categories updated successfully');
		return json({
			success: true,
			message: 'Categories updated successfully'
		});
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
					// Update category properties
					Object.assign(cats[key], updates);
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
			// Write updated categories to file
			const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');
			const content = generateCategoriesFileContent(categories);
			await fs.writeFile(categoriesPath, content, 'utf-8');

			// Update collections to reflect the changes
			await collectionManager.updateCollections(true);

			logger.info(`Category ${categoryId} updated successfully`);
			return json({
				success: true,
				message: 'Category updated successfully',
				categories
			});
		}

		return json({ error: 'Category not found' }, { status: 404 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in PUT /api/categories:', errorMessage);
		return json({ error: 'Failed to update category' }, { status: 500 });
	}
};
