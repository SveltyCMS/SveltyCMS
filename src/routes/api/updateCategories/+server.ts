/**
 * @file: src/routes/api/updateCategories/+server.ts
 * @description: API endpoint for updating the CMS category configuration
 *
 * Features:
 * - Dynamic category update based on folder structure
 * - Support for nested categories
 * - Error handling and logging
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// System Logger
import { logger } from '@utils/logger';

// Import the CategoryData type from the shared types
import type { CategoryData } from '@src/collections/types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();

		// If data is undefined, return an error response
		if (!data || typeof data !== 'object') {
			logger.warn('Invalid or no data provided in the request');
			return new Response('Invalid or no data provided', { status: 400 });
		}

		// Define the path to the categories.ts file
		const categoriesFilePath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');

		const newConfigFileContent = _generateCategoriesFileContent(data);
		const existingContent = await _readExistingConfig(categoriesFilePath);

		if (_shouldUpdateConfig(newConfigFileContent, existingContent)) {
			await fs.writeFile(categoriesFilePath, newConfigFileContent);
			logger.info('Categories file updated successfully by API');
			return new Response('Categories file updated successfully', { status: 200 });
		} else {
			logger.info('Categories file does not need an update');
			return new Response(null, { status: 304 });
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error updating categories file:', { error: errorMessage });
		return json({ success: false, error: `Error updating categories file: ${errorMessage}` }, { status: 500 });
	}
};

// Generate the categories file content
export function _generateCategoriesFileContent(data: Record<string, CategoryData>): string {
	let content = `/**
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
export const categoryConfig: Record<string, CategoryData> = `;

	content += JSON.stringify(data, null, 4);
	content += ';\n';
	return content;
}

// Reads the existing configuration file
async function _readExistingConfig(filePath: string): Promise<string> {
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

// Compares the new configuration content with the existing one
function _shouldUpdateConfig(newContent: string, existingContent: string): boolean {
	const newContentHash = crypto.createHash('md5').update(newContent).digest('hex');
	const existingContentHash = existingContent ? crypto.createHash('md5').update(existingContent).digest('hex') : '';
	return newContentHash !== existingContentHash;
}
