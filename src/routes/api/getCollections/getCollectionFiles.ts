/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Asynchronous utility function for retrieving collection files.
 *
 * This module provides a function to:
 * - Read all files from the collections directory asynchronously
 * - Filter out specific files (config.js, types.js, and non-JavaScript files)
 * - Return a list of valid collection files
 *
 * Features:
 * - Asynchronous file reading for improved performance
 * - Filtering of non-collection files
 * - Error handling and logging
 * - File extension validation
 *
 * Usage:
 * import { getCollectionFiles } from './getCollectionFiles';
 * const collectionFiles = await getCollectionFiles();
 */

import fs from 'fs/promises';
import path from 'path';

// System Logger
import { logger } from '@src/utils/logger';

// Use process.env for server-side environment variables
const collectionsFolder = process.env.VITE_COLLECTIONS_FOLDER || './collections';

// Custom error type for collection-related errors
class CollectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CollectionError';
	}
}

// This function returns a list of all the valid collection files in the specified directory.
export async function getCollectionFiles(): Promise<string[]> {
	try {
		// Ensure the collections folder path is absolute
		const directoryPath = path.resolve(collectionsFolder);

		// Get the list of all files in the collections directory
		const files = await fs.readdir(directoryPath);
		logger.debug('Files read from directory', { directory: directoryPath, files });

		// Filter the list to only include .js files that are not config.js or types.js
		const filteredFiles = files.filter((file) => {
			const isJSFile = path.extname(file) === '.js';
			const isNotExcluded = !['config.js', 'types.js'].includes(file);
			return isJSFile && isNotExcluded;
		});

		logger.info('Filtered collection files', { filteredFiles });

		if (filteredFiles.length === 0) {
			throw new CollectionError('No valid collection files found');
		}

		return filteredFiles;
	} catch (error) {
		if (error instanceof CollectionError) {
			logger.warn(error.message);
			return [];
		}
		logger.error('Error reading collection files', {
			message: (error as Error).message,
			stack: (error as Error).stack
		});
		throw new CollectionError(`Failed to read collection files: ${(error as Error).message}`);
	}
}
