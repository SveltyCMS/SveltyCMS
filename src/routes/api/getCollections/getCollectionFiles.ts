/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Utility function for retrieving collection files.
 *
 * This module provides a function to:
 * - Read all files from the collections directory
 * - Filter out specific files (config.js and types.js)
 * - Return a list of valid collection files
 *
 * Features:
 * - Synchronous file reading for simplicity
 * - Filtering of non-collection files
 * - Error handling and logging
 *
 * Usage:
 * import { getCollectionFiles } from './getCollectionFiles';
 * const collectionFiles = getCollectionFiles();
 */

import fs from 'fs';
import path from 'path';

// System Logger
import { logger } from '@src/utils/logger';

// Use process.env for server-side environment variables
let collectionsFolder = "";
var process;
if (process) {
	collectionsFolder = process.env.VITE_COLLECTIONS_FOLDER || './collections';
}

// This function returns a list of all the collection files in the specified directory.
export function getCollectionFiles(): string[] {
	try {
		// Ensure the collections folder path is absolute
		const directoryPath = path.resolve(collectionsFolder);

		// Get the list of all files in the collections directory
		const files = fs.readdirSync(directoryPath);
		logger.debug('Files read from directory', { directory: directoryPath, files });

		// Filter the list to only include files that are not config.js or types.js
		const filteredFiles = files.filter((file) => !['config.js', 'types.js'].includes(file));
		logger.info('Filtered collection files', { filteredFiles });

		return filteredFiles;
	} catch (error) {
		logger.error('Error reading collection files', { message: (error as Error).message, stack: (error as Error).stack });
		throw Error(`Failed to read collection files: ${(error as Error).message}`);
	}
}
