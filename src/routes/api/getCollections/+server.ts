/**
 * @file src/routes/api/getCollections/+server.ts
 * @description
 * API endpoint for retrieving collection files or a specific collection file.
 * Implements memory and optional Redis caching for improved performance.
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import path from 'path';
import fs from 'fs/promises';
import { browser } from '$app/environment';

// Redis
import { isRedisEnabled, getCache, setCache } from '@src/databases/redis';

// Types
import type { User } from '@src/auth/types';

// Constants
const projectRoot = '/var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SvelteCMS';
const systemCollectionsFolder = path.join(projectRoot, 'src', 'collections');
const userCollectionsFolder = path.join(projectRoot, 'config', 'collections');
const compiledCollectionsFolder = path.join(projectRoot, 'dist', 'collections');

// Cache configuration
const CACHE_TTL = 300; // 5 minutes
const BATCH_SIZE = 50; // Number of files to process in parallel
const COLLECTION_FILE_CACHE_PREFIX = 'api:collection_file:';
const ALL_COLLECTIONS_CACHE_KEY = 'api:collection_files:all';

// In-memory cache for file paths
const filePathCache = new Map<string, { path: string; mtime: number }>();

// Types
interface CollectionData {
	default: Record<string, unknown>;
}

interface FileInfo {
	content: string;
	path: string;
	mtime: number;
}

interface CachedData {
	data: CollectionData;
	timestamp: number;
}

interface CustomError {
	status: number;
	message: string;
}

function isCustomError(err: unknown): err is CustomError {
	return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const user = locals.user as User | undefined;
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		const fileNameQuery = url.searchParams.get('fileName');

		// Remove any leading path components for security
		const fileName = fileNameQuery ? path.basename(fileNameQuery) : null;

		// If fileName is provided, handle single file request
		return fileName ? await handleSingleFileRequest(fileName, user._id) : await handleAllFilesRequest(user._id);
	} catch (err) {
		logger.error('Error in collections API:', err);
		if (isCustomError(err)) {
			return error(err.status, err.message);
		}
		return error(500, err instanceof Error ? err.message : 'Internal Server Error');
	}
};

// Safely parse collection file content (for JSON files)
function safeParseCollectionFile(content: string): CollectionData {
	try {
		// Parse the content as JSON
		const parsed = JSON.parse(content);
		// Validate the structure
		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('Invalid collection file structure');
		}

		return { default: parsed };
	} catch (err) {
		logger.error('Error parsing collection file:', err);
		throw new Error('Invalid collection file format');
	}
}

// Safe object literal parser
function safeObjectLiteralParse(objStr: string): Record<string, unknown> {
	// Remove whitespace and newlines
	const cleaned = objStr.trim();

	// Validate it starts with { and ends with }
	if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
		throw new Error('Invalid object literal format');
	}

	try {
		// First try parsing as JSON
		return JSON.parse(cleaned);
	} catch {
		// If JSON parsing fails, use a more lenient approach
		// Convert the object literal to valid JSON
		const jsonString = cleaned
			// Handle single quotes
			.replace(/'/g, '"')
			// Handle unquoted property names
			.replace(/(\w+):/g, '"$1":')
			// Handle trailing commas
			.replace(/,\s*([\]}])/g, '$1')
			// Handle undefined values
			.replace(/:\s*undefined/g, ':null');

		try {
			return JSON.parse(jsonString);
		} catch (err) {
			logger.error('Error parsing object literal:', err);
			throw new Error('Invalid object literal format');
		}
	}
}

// Safely process collection file content
async function processCollectionFile(content: string, fileName: string): Promise<CollectionData> {
	try {
		if (fileName.endsWith('.ts')) {
			// For TypeScript files, extract the exported configuration
			const matches = content.match(/export\s+(?:const|let|var)\s+(\w+)(?::\s*[^=]+)?\s*=\s*({[\s\S]*?});/);
			if (!matches || !matches[2]) {
				logger.error('No valid export found in TypeScript file. Content:', content);
				throw new Error('No valid export found in TypeScript file');
			}

			// Get the exported object and parse it safely
			const exportedObj = matches[2].trim();
			const parsedObj = safeObjectLiteralParse(exportedObj);
			return { default: parsedObj };
		}
		// Process as json
		return safeParseCollectionFile(content);
	} catch (err) {
		logger.error('Error processing collection file:', {
			fileName,
			error: err instanceof Error ? err.message : String(err),
			content: content.substring(0, 200) + '...' // Log first 200 chars for debugging
		});
		throw err;
	}
}

// Find file in collections directories with caching
async function findCollectionFile(fileName: string): Promise<FileInfo | null> {
	logger.debug('Finding collection file:', { fileName });

	// Check in-memory cache first
	const cached = filePathCache.get(fileName);
	if (cached) {
		try {
			const stats = await fs.stat(cached.path);
			if (stats.mtimeMs === cached.mtime) {
				const content = await fs.readFile(cached.path, 'utf-8');
				logger.debug('Found in cache:', { path: cached.path });
				return { content, path: cached.path, mtime: cached.mtime };
			}
		} catch (err) {
			logger.debug('Cache invalid:', { error: err });
			filePathCache.delete(fileName);
		}
	}

	// Try all paths in parallel
	const possiblePaths = [
		path.join(systemCollectionsFolder, fileName),
		path.join(userCollectionsFolder, fileName),
		path.join(compiledCollectionsFolder, fileName)
	];

	logger.debug('Searching paths:', { paths: possiblePaths });

	// Try all paths in parallel
	const results = await Promise.allSettled(
		possiblePaths.map(async (filePath) => {
			try {
				logger.debug('Checking path:', { path: filePath });
				const stats = await fs.stat(filePath);
				const content = await fs.readFile(filePath, 'utf-8');
				logger.debug('Found file:', { path: filePath });
				return { content, path: filePath, mtime: stats.mtimeMs };
			} catch (err) {
				logger.debug('Failed to read file:', { path: filePath, error: err });
				throw err;
			}
		})
	);

	// Find the first successful result
	const found = results.find((result): result is PromiseFulfilledResult<FileInfo> => result.status === 'fulfilled');

	if (found) {
		// Update cache
		filePathCache.set(fileName, { path: found.value.path, mtime: found.value.mtime });
		logger.debug('File found and cached:', { path: found.value.path });
		return found.value;
	}

	logger.debug('File not found in any location');
	return null;
}

async function handleSingleFileRequest(fileNameQuery: string, userId: string) {
	logger.debug('Handling single file request:', { fileName: fileNameQuery });

	// Check Redis cache first
	if (!browser && isRedisEnabled()) {
		const cacheKey = `${COLLECTION_FILE_CACHE_PREFIX}${fileNameQuery}:${userId}`;
		const cachedData = await getCache<CachedData>(cacheKey);

		if (cachedData) {
			const fileInfo = await findCollectionFile(fileNameQuery);
			if (fileInfo && cachedData.timestamp >= fileInfo.mtime) {
				logger.debug('Cache hit for collection file', { fileName: fileNameQuery });
				return json(cachedData.data);
			}
		}
	}

	// Find and process file
	const fileInfo = await findCollectionFile(fileNameQuery);
	if (!fileInfo) {
		logger.debug('File not found details:', {
			requestedFile: fileNameQuery,
			searchPaths: [systemCollectionsFolder, userCollectionsFolder, compiledCollectionsFolder]
		});
		throw error(404, `Collection file ${fileNameQuery} not found`);
	}

	const result = await processCollectionFile(fileInfo.content, fileNameQuery);

	// Cache in Redis
	if (!browser && isRedisEnabled()) {
		const cacheKey = `${COLLECTION_FILE_CACHE_PREFIX}${fileNameQuery}:${userId}`;
		await setCache(cacheKey, { data: result, timestamp: fileInfo.mtime }, CACHE_TTL);
		logger.debug('Cached collection file', { fileName: fileNameQuery });
	}

	return json(result);
}

// Optimized directory scanning with caching
async function scanDirectory(dirPath: string, cache = new Set<string>()) {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		const batches: Array<fs.DirEnt[]> = [];

		// Split entries into batches
		for (let i = 0; i < entries.length; i += BATCH_SIZE) {
			batches.push(entries.slice(i, i + BATCH_SIZE));
		}

		// Process batches sequentially to avoid overwhelming the system
		for (const batch of batches) {
			await Promise.all(
				batch.map(async (entry) => {
					const fullPath = path.join(dirPath, entry.name);
					if (entry.isDirectory()) {
						await scanDirectory(fullPath, cache);
					} else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
						cache.add(entry.name);
					}
				})
			);
		}
	} catch (err) {
		if ((err as { code?: string }).code !== 'ENOENT') {
			logger.error(`Error scanning directory ${dirPath}:`, err);
		}
	}
	return cache;
}

async function handleAllFilesRequest(userId: string) {
	// Try Redis cache first
	if (!browser && isRedisEnabled()) {
		const cacheKey = `${ALL_COLLECTIONS_CACHE_KEY}:${userId}`;
		const cached = await getCache<string[]>(cacheKey);
		if (cached) {
			logger.debug('Cache hit for collection files list');
			return json(cached);
		}
	}

	try {
		// Scan directories in parallel with batching
		const fileSet = new Set<string>();
		await Promise.all([
			scanDirectory(systemCollectionsFolder, fileSet),
			scanDirectory(userCollectionsFolder, fileSet),
			scanDirectory(compiledCollectionsFolder, fileSet)
		]);

		const collectionFiles = Array.from(fileSet);

		// Cache in Redis
		if (!browser && isRedisEnabled()) {
			const cacheKey = `${ALL_COLLECTIONS_CACHE_KEY}:${userId}`;
			await setCache(cacheKey, collectionFiles, CACHE_TTL);
			logger.debug('Cached collection files list');
		}

		return json(collectionFiles);
	} catch (err) {
		logger.error('Error retrieving collection files:', err);
		throw error(500, err instanceof Error ? err.message : 'Failed to retrieve collection files');
	}
}
