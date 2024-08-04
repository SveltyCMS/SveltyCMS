/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description Utility function for retrieving collection files.
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

// System Logger
import logger from '@src/utils/logger';

// This function returns a list of all the collection files in the current directory.
export function getCollectionFiles(): string[] {
	try {
		// Get the list of all files in the current directory.
		const files = fs.readdirSync(import.meta.env.collectionsFolderJS);
		logger.debug('Files read from directory', { directory: import.meta.env.collectionsFolderJS, files });

		// Filter the list to only include files that are not config.js or types.js.
		const filteredFiles = files.filter((file) => !['config.js', 'types.js'].includes(file));
		logger.info('Filtered collection files', { filteredFiles });

		return filteredFiles;
	} catch (error) {
		logger.error('Error reading collection files', error as Error);
		throw error; // Re-throw the error after logging it
	}
}
