/**
 * @file src/routes/api/importCollection/[...url]/+server.ts
 * @description API endpoint for serving collection files.
 *
 * This module handles GET requests to serve collection files:
 * - Reads the requested file from the collections folder
 * - Determines the appropriate MIME type for the file
 * - Serves the file with the correct Content-Type header
 *
 * Features:
 * - Dynamic file serving based on URL parameters
 * - MIME type detection using mime-types library
 * - Error handling for file not found scenarios
 * - Logging of file access and errors
 * - File caching to improve performance
 * - Cache invalidation mechanism
 * - ETag support for efficient caching
 *
 * Usage:
 * GET /api/importCollection/[...url]
 * Where [...url] is the path to the file within the collections folder
 *
 * Note: This endpoint should be used cautiously as it serves files directly.
 * Ensure proper access controls are in place to prevent unauthorized access.
 */

import { promises as fsPromises } from 'fs';
import mime from 'mime-types';
import type { RequestHandler } from './$types';
import { join } from 'path';
import { createHash } from 'crypto';

// System Logger
import { logger } from '@utils/logger.svelte';

const fileCache = new Map<string, { content: Buffer; lastModified: number; etag: string }>();

export const GET: RequestHandler = async ({ params, request }) => {
	// Construct the file path from the base directory and the URL parameter
	const filePath = join(import.meta.env.collectionsFolderJS, params.url);
	logger.debug(`Attempting to serve file: ${filePath}`);

	try {
		// Read the file asynchronously from the collections folder using the provided URL parameter
		const fileStats = await fsPromises.stat(filePath);
		let fileContent: Buffer;
		let etag: string;

		const cachedFile = fileCache.get(filePath);
		if (cachedFile && cachedFile.lastModified >= fileStats.mtimeMs) {
			fileContent = cachedFile.content;
			etag = cachedFile.etag;
		} else {
			fileContent = await fsPromises.readFile(filePath);
			etag = createHash('md5').update(fileContent).digest('hex');
			fileCache.set(filePath, { content: fileContent, lastModified: fileStats.mtimeMs, etag });
		}

		const ifNoneMatch = request.headers.get('If-None-Match');
		if (ifNoneMatch === etag) {
			return new Response(null, { status: 304 }); // Not Modified
		}

		const contentType = mime.lookup(params.url) || 'application/octet-stream';
		return new Response(fileContent, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Last-Modified': fileStats.mtime.toUTCString(),
				ETag: etag
			}
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			logger.warn('File not found:', { filePath });
			return new Response('File not found', { status: 404 });
		}
		logger.error('Error serving file:', { error, filePath });
		return new Response('Internal Server Error', { status: 500 });
	}
};

export const POST: RequestHandler = async () => {
	fileCache.clear();
	logger.info('Collection file cache cleared');
	return new Response('Cache cleared', { status: 200 });
};
