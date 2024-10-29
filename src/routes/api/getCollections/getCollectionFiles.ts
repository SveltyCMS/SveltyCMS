/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Asynchronous utility function for retrieving collection files.
 *
 * This module provides a function to:
 * - Read all files from the collections directory asynchronously
 * - Filter out specific files (config.js, types.js, and non-JavaScript files)
 * - Return a list of valid collection files
 * - Support memory and Redis caching for improved performance
 *
 * Features:
 * - Asynchronous file reading for improved performance
 * - Filtering of non-collection files
 * - Error handling and logging
 * - File extension validation
 * - Memory and Redis caching support
 * - File hash validation for cache invalidation
 *
 * Usage:
 * import { getCollectionFiles } from './getCollectionFiles';
 * const collectionFiles = await getCollectionFiles();
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { browser } from '$app/environment';

// System Logger
import { logger } from '@src/utils/logger';

// Redis
import { isRedisEnabled, getCache, setCache } from '@src/databases/redis';

// Use import.meta.env for environment variables
const collectionsFolder = import.meta.env.VITE_COLLECTIONS_FOLDER || './collections';

// Cache TTL
const CACHE_TTL = 300; // 5 minutes

// Custom error type for collection-related errors
class CollectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CollectionError';
	}
}

// Calculate directory hash for cache invalidation
async function calculateDirectoryHash(directoryPath: string): Promise<string> {
	try {
		const files = await fs.readdir(directoryPath);
		const stats = await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(directoryPath, file);
				const stat = await fs.stat(filePath);
				return {
					name: file,
					mtime: stat.mtime.getTime(),
					size: stat.size
				};
			})
		);

		// Create a string representation of directory state
		const dirState = JSON.stringify(stats.sort((a, b) => a.name.localeCompare(b.name)));
		return crypto.createHash('md5').update(dirState).digest('hex');
	} catch (error) {
		logger.error('Error calculating directory hash:', error);
		return '';
	}
}

// This function returns a list of all the valid collection files in the specified directory.
export async function getCollectionFiles(): Promise<string[]> {
	try {
		// Ensure the collections folder path is absolute
		const directoryPath = path.resolve(collectionsFolder);

		// Calculate directory hash
		const dirHash = await calculateDirectoryHash(directoryPath);

		// Try to get from Redis cache first
		if (!browser && isRedisEnabled() && dirHash) {
			const cacheKey = 'collection_files:list';
			const cachedData = await getCache<{ hash: string; files: string[] }>(cacheKey);

			if (cachedData && cachedData.hash === dirHash) {
				logger.debug('Returning cached collection files list');
				return cachedData.files;
			}
		}

		// Get the list of all files in the collections directory
		const files = await fs.readdir(directoryPath);
		logger.debug('Files read from directory', { directory: directoryPath, files });

		// Filter the list to only include .js files that are not config.js or types.js
		const filteredFiles = files.filter((file) => {
			const isJSFile = path.extname(file) === '.js';
			const isNotExcluded = !['config.js', 'types.js', 'categories.js', 'index.js'].includes(file);
			return isJSFile && isNotExcluded;
		});

		logger.info('Filtered collection files', { filteredFiles });

		if (filteredFiles.length === 0) {
			throw new CollectionError('No valid collection files found');
		}

		// Cache in Redis if available
		if (!browser && isRedisEnabled() && dirHash) {
			const cacheKey = 'collection_files:list';
			await setCache(cacheKey, { hash: dirHash, files: filteredFiles }, CACHE_TTL);
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

// Helper function to check if a file is a valid collection file
export async function isValidCollectionFile(filePath: string): Promise<boolean> {
	try {
		// Check file extension
		if (path.extname(filePath) !== '.js') {
			return false;
		}

		// Check if file is in excluded list
		const fileName = path.basename(filePath);
		if (['config.js', 'types.js', 'categories.js', 'index.js'].includes(fileName)) {
			return false;
		}

		// Check if file exists and is readable
		await fs.access(filePath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
