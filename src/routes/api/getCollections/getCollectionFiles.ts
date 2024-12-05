/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Asynchronous utility function for retrieving collection files.
 */

import { browser } from '$app/environment';

// System Logger
import { logger } from '@utils/logger.svelte';

// Redis
import { isRedisEnabled, getCache, setCache } from '@src/databases/redis';
import { fileURLToPath } from "url";

// Default collections folder path - this will be resolved on the server
const DEFAULT_COLLECTIONS_FOLDER = 'config/collections';

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

	// Resolve collections folder path on the server side
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const projectRoot = path.resolve(__dirname, '../../../../');
	const collectionsFolder = process.env.VITE_COLLECTIONS_FOLDER || path.resolve(projectRoot, DEFAULT_COLLECTIONS_FOLDER);

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

// Helper function to recursively get all files in a directory
async function getAllFiles(dir: string, fs: FSModule, path: PathModule): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getAllFiles(res, fs, path) : res;
    }));
    return files.flat();
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

        // Get all files recursively
        const allFiles = await getAllFiles(collectionsFolder, fs, path);
        logger.debug('All files found:', { files: allFiles });

        // Filter to only include .ts files
        const filteredFiles = allFiles.filter(file => {
            const ext = path.extname(file);
            return ext === '.ts';
        });

        logger.info('Filtered collection files', { filteredFiles });

        if (filteredFiles.length === 0) {
            logger.warn('No valid collection files found');
            return [];
        }

        // Cache in Redis if available
        if (isRedisEnabled() && dirHash) {
            const cacheKey = 'collection_files:list';
            await setCache(cacheKey, { hash: dirHash, files: filteredFiles }, CACHE_TTL);
        }

        return filteredFiles;
    } catch (error) {
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
		// Check file extension - we only want TypeScript files
		const ext = path.extname(filePath);
		if (ext !== '.ts') {
			return false;
		}

		// Check if file exists and is readable
		await fs.access(filePath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
