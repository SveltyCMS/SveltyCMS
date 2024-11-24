/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Asynchronous utility function for retrieving collection files.
 */

import { browser } from '$app/environment';

// System Logger
import { logger } from '@src/utils/logger';

// Redis
import { isRedisEnabled, getCache, setCache } from '@src/databases/redis';

// Default collections folder path
const DEFAULT_COLLECTIONS_FOLDER = '../../../../collections';

// Cache TTL
const CACHE_TTL = 300; // 5 minutes

// Custom error type for collection-related errors
class CollectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CollectionError';
	}
}

// Define types for Node.js modules
type FSModule = typeof import('fs/promises');
type PathModule = typeof import('path');
type CryptoModule = typeof import('crypto');

// Create a module loader that only runs on the server
const loadServerModules = async () => {
	if (browser) {
		return null;
	}

	const [fs, path, crypto] = await Promise.all([
		import('fs/promises') as Promise<FSModule>,
		import('path') as Promise<PathModule>,
		import('crypto') as Promise<CryptoModule>
	]);

	// Resolve collections folder path
	const collectionsFolder = process.env.VITE_COLLECTIONS_FOLDER || path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		DEFAULT_COLLECTIONS_FOLDER
	);

	return { fs, path, crypto, collectionsFolder };
};

// Calculate directory hash for cache invalidation
async function calculateDirectoryHash(directoryPath: string): Promise<string> {
	const modules = await loadServerModules();
	if (!modules) return '';

	const { fs, path, crypto } = modules;

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
		logger.error('Error calculating directory hash:', error as Error);
		return '';
	}
}

// This function returns a list of all the valid collection files in the specified directory.
export async function getCollectionFiles(): Promise<string[]> {
	if (browser) {
		throw new CollectionError('This function is server-only.');
	}

	const modules = await loadServerModules();
	if (!modules) {
		throw new CollectionError('Failed to load server modules');
	}

	const { fs, path, collectionsFolder } = modules;

	try {
		// Create main collections directory if it doesn't exist
		await fs.mkdir(collectionsFolder, { recursive: true });

		// Calculate directory hash
		const dirHash = await calculateDirectoryHash(collectionsFolder);

		// Try to get from Redis cache first
		if (isRedisEnabled() && dirHash) {
			const cacheKey = 'collection_files:list';
			const cachedData = await getCache<{ hash: string; files: string[] }>(cacheKey);

			if (cachedData && cachedData.hash === dirHash) {
				logger.debug('Returning cached collection files list');
				return cachedData.files;
			}
		}

		// Get the list of all files in the collections directory
		const files = await fs.readdir(collectionsFolder);
		logger.debug('Files read from directory', { directory: collectionsFolder, files });

		// Filter the list to only include .js files that are not excluded
		const filteredFiles = files.filter((file) => {
			const isJSFile = path.extname(file) === '.js';
			const isNotExcluded = !['types.js', 'categories.js', 'index.js'].includes(file);
			return isJSFile && isNotExcluded;
		});

		logger.info('Filtered collection files', { filteredFiles });

		if (filteredFiles.length === 0) {
			throw new CollectionError('No valid collection files found');
		}

		// Cache in Redis if available
		if (isRedisEnabled() && dirHash) {
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
	if (browser) return false;

	const modules = await loadServerModules();
	if (!modules) return false;

	const { fs, path } = modules;

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
