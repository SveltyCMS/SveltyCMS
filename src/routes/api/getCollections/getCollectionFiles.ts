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

// Cache TTL
const CACHE_TTL = 300; // 5 minutes
const HASH_CACHE_TTL = 60000; // 1 minute

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

interface ServerModules {
	fs: FSModule;
	path: PathModule;
	crypto: CryptoModule;
	systemCollectionsFolder: string;
	userCollectionsFolder: string;
	projectRoot: string;
}

interface DirectoryHashCache {
	hash: string;
	timestamp: number;
}

interface FileStats {
	name: string;
	mtime: number;
	size: number;
}

// Module cache
let moduleCache: ServerModules | null = null;

// Directory hash cache with TTL
const directoryHashCache = new Map<string, DirectoryHashCache>();

// Create a module loader that only runs on the server
const loadServerModules = async (): Promise<ServerModules | null> => {
	if (browser) return null;
	if (moduleCache) return moduleCache;

	try {
		const [fs, path, crypto] = await Promise.all([
			import('fs/promises') as Promise<FSModule>,
			import('path') as Promise<PathModule>,
			import('crypto') as Promise<CryptoModule>
		]);

		const projectRoot = '/var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SvelteCMS';
		moduleCache = {
			fs,
			path,
			crypto,
			systemCollectionsFolder: path.join(projectRoot, 'src', 'collections'),
			userCollectionsFolder: path.join(projectRoot, 'config', 'collections'),
			projectRoot
		};
		return moduleCache;
	} catch (error) {
		logger.error('Failed to load server modules:', error);
		return null;
	}
};

// Calculate directory hash for cache invalidation with caching
async function calculateDirectoryHash(directoryPath: string): Promise<string> {
	const modules = await loadServerModules();
	if (!modules) return '';

	const { fs, path, crypto } = modules;

	// Check cache
	const cached = directoryHashCache.get(directoryPath);
	if (cached && Date.now() - cached.timestamp < HASH_CACHE_TTL) {
		return cached.hash;
	}

	try {
		const files = await fs.readdir(directoryPath);
		const statsPromises = files.map(async (file) => {
			const filePath = path.join(directoryPath, file);
			try {
				const stat = await fs.stat(filePath);
				return {
					name: file,
					mtime: stat.mtime.getTime(),
					size: stat.size
				} as FileStats;
			} catch {
				return null;
			}
		});

		const stats = (await Promise.all(statsPromises)).filter((stat): stat is FileStats => stat !== null);
		const dirState = JSON.stringify(stats.sort((a, b) => a.name.localeCompare(b.name)));
		const hash = crypto.createHash('md5').update(dirState).digest('hex');

		// Update cache
		directoryHashCache.set(directoryPath, { hash, timestamp: Date.now() });
		return hash;
	} catch (error) {
		logger.error('Error calculating directory hash:', error);
		return '';
	}
}

// Optimized recursive file scanning with batch processing
async function getAllFiles(dir: string, fs: FSModule, path: PathModule, batchSize = 50): Promise<string[]> {
	const results: string[] = [];
	const queue: string[] = [dir];

	while (queue.length > 0) {
		const batch = queue.splice(0, batchSize);
		const batchPromises = batch.map(async (currentDir) => {
			try {
				const entries = await fs.readdir(currentDir, { withFileTypes: true });
				const subResults: string[] = [];

				for (const entry of entries) {
					const fullPath = path.join(currentDir, entry.name);
					if (entry.isDirectory()) {
						queue.push(fullPath);
					} else {
						subResults.push(fullPath);
					}
				}

				return subResults;
			} catch (error) {
				logger.error(`Error scanning directory ${currentDir}:`, error);
				return [];
			}
		});

		const batchResults = await Promise.all(batchPromises);
		results.push(...batchResults.flat());
	}

	return results;
}

// Get collection files with optimized caching and error handling
export async function getCollectionFiles(userId?: string): Promise<string[]> {
	if (browser) {
		throw new CollectionError('This function is server-only.');
	}

	const modules = await loadServerModules();
	if (!modules) {
		throw new CollectionError('Failed to load server modules');
	}

	const { fs, path, systemCollectionsFolder, userCollectionsFolder, projectRoot } = modules;

	try {
		// Create directories if needed (in parallel)
		await Promise.all([fs.mkdir(systemCollectionsFolder, { recursive: true }), fs.mkdir(userCollectionsFolder, { recursive: true })]);

		// Calculate directory hashes (in parallel)
		const [systemDirHash, userDirHash] = await Promise.all([
			calculateDirectoryHash(systemCollectionsFolder),
			calculateDirectoryHash(userCollectionsFolder)
		]);

		// Try Redis cache with hash validation
		if (isRedisEnabled() && systemDirHash && userDirHash) {
			const cacheKey = userId ? `collection_files:list:${userId}` : 'collection_files:list';
			const cachedData = await getCache<{
				systemHash: string;
				userHash: string;
				files: string[];
			}>(cacheKey);

			if (cachedData?.systemHash === systemDirHash && cachedData?.userHash === userDirHash) {
				logger.debug('Returning cached collection files list');
				return cachedData.files;
			}
		}

		// Get all files in parallel with optimized scanning
		const [systemFiles, userFiles] = await Promise.all([
			getAllFiles(systemCollectionsFolder, fs, path),
			getAllFiles(userCollectionsFolder, fs, path)
		]);

		// Process paths efficiently
		const excludedFiles = new Set(['index.ts', 'types.ts', 'CollectionManager.ts']);
		const filteredFiles = [...systemFiles, ...userFiles]
			.map((file) => path.relative(projectRoot, file))
			.filter((file) => {
				const ext = path.extname(file);
				const basename = path.basename(file);
				return ext === '.ts' && !excludedFiles.has(basename);
			});

		if (filteredFiles.length === 0) {
			logger.warn('No valid collection files found');
			return [];
		}

		// Cache in Redis if available
		if (isRedisEnabled() && systemDirHash && userDirHash) {
			const cacheKey = userId ? `collection_files:list:${userId}` : 'collection_files:list';
			await setCache(
				cacheKey,
				{
					systemHash: systemDirHash,
					userHash: userDirHash,
					files: filteredFiles
				},
				CACHE_TTL
			).catch((err) => logger.error('Failed to cache collection files:', err));
		}

		return filteredFiles;
	} catch (error) {
		logger.error('Error reading collection files', {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new CollectionError(`Failed to read collection files: ${error instanceof Error ? error.message : String(error)}`);
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
		if (path.extname(filePath) !== '.ts') {
			return false;
		}

		// Check if file exists and is readable
		await fs.access(filePath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
