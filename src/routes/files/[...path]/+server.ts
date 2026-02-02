/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves media files via Streams (Non-blocking) or redirects to cloud storage.
 *
 * Improvements:
 * - **Streaming:** Uses `createReadStream` to serve files with near-zero memory footprint.
 * - **Async I/O:** Uses `fs.promises` to prevent blocking the Node.js event loop.
 * - **304 Not Modified:** Handles browser caching headers to save bandwidth.
 * - **Error Handling:** Handles 'ENOENT' specifically for cleaner 404s.
 */

import { redirect } from '@sveltejs/kit';
import { getPublicSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { lookup } from 'mime-types';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ params, request }) => {
	let filePath = params.path;

	if (!filePath) {
		logger.warn('File request missing path');
		throw new AppError('File path is required', 400, 'MISSING_PATH');
	}

	// Clean up the path - remove any leading /files/ prefix that might have been doubled
	if (filePath.startsWith('/files/') || filePath.startsWith('files/')) {
		console.warn('[Files Route] Detected /files/ prefix in path, cleaning:', filePath);
		filePath = filePath.replace(/^\/?files\//, '');
	}

	// Check storage type
	const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE');

	// --- CLOUD STORAGE REDIRECT ---
	if (storageType !== 'local') {
		const cloudUrl = getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL');

		if (cloudUrl) {
			const mediaFolder = getPublicSettingSync('MEDIA_FOLDER') || '';
			const normalizedFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
			const baseUrl = cloudUrl.replace(/\/+$/, '');
			const fullUrl = normalizedFolder ? `${baseUrl}/${normalizedFolder}/${filePath}` : `${baseUrl}/${filePath}`;

			logger.debug('Redirecting to cloud storage', { filePath, cloudUrl: fullUrl });
			throw redirect(307, fullUrl);
		} else {
			logger.error('Cloud storage configured but no public URL available', { storageType });
			throw new AppError('Cloud storage URL not configured', 500, 'CLOUD_CONFIG_ERROR');
		}
	}

	// --- LOCAL STORAGE SERVING ---
	const mediaFolder = getPublicSettingSync('MEDIA_FOLDER');
	console.log('Files Route Debug:', { mediaFolder, filePath, storageType });

	if (!mediaFolder) {
		logger.error('MEDIA_FOLDER not configured');
		throw new AppError('Media storage not configured', 500, 'STORAGE_CONFIG_ERROR');
	}

	const normalizedMediaFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '');
	const fullPath = path.join(process.cwd(), normalizedMediaFolder, filePath);
	console.log('Files Route resolving:', fullPath);

	// Security: Directory Traversal Prevention
	const resolvedPath = path.resolve(fullPath);
	const allowedBasePath = path.resolve(process.cwd(), normalizedMediaFolder);

	if (!resolvedPath.startsWith(allowedBasePath)) {
		logger.warn('Directory traversal attempt detected', { requestedPath: filePath, resolvedPath });
		throw new AppError('Access denied', 403, 'ACCESS_DENIED');
	}

	// Async Stat check (Non-blocking)
	// We use standard try/catch here only for fs operations to throw specific AppErrors
	let stats;
	try {
		stats = await stat(resolvedPath);
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			logger.debug('File not found', { path: params.path });
			throw new AppError('File not found', 404, 'NOT_FOUND');
		}
		throw err;
	}

	if (!stats.isFile()) {
		throw new AppError('Invalid file request', 400, 'INVALID_FILE');
	}

	// Browser Cache Optimization (304 Not Modified)
	const lastModified = stats.mtime.toUTCString();
	if (request.headers.get('if-modified-since') === lastModified) {
		return new Response(null, { status: 304 });
	}

	// MIME Type
	const mimeType = lookup(resolvedPath) || 'application/octet-stream';

	// STREAMING RESPONSE (Memory Efficient)
	// We convert the Node stream to a Web ReadableStream for SvelteKit
	const nodeStream = createReadStream(resolvedPath);
	const stream = Readable.toWeb(nodeStream);

	return new Response(stream as any, {
		status: 200,
		headers: {
			'Content-Type': mimeType,
			'Content-Length': stats.size.toString(),
			'Cache-Control': 'public, max-age=31536000, immutable',
			'Last-Modified': lastModified
		}
	});
});
