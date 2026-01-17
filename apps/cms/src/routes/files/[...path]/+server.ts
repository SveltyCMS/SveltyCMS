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

import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicSettingSync } from '@shared/services/settingsService';
import { logger } from '@shared/utils/logger.server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { lookup } from 'mime-types';

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const filePath = params.path;

		if (!filePath) {
			logger.warn('File request missing path');
			throw error(400, 'File path is required');
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
				throw error(500, 'Cloud storage URL not configured');
			}
		}

		// --- LOCAL STORAGE SERVING ---
		const mediaFolder = getPublicSettingSync('MEDIA_FOLDER');
		console.log('Files Route Debug:', { mediaFolder, filePath, storageType });

		if (!mediaFolder) {
			logger.error('MEDIA_FOLDER not configured');
			throw error(500, 'Media storage not configured');
		}

		const normalizedMediaFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '');
		const fullPath = path.join(process.cwd(), normalizedMediaFolder, filePath);
		console.log('Files Route resolving:', fullPath);

		// Security: Directory Traversal Prevention
		const resolvedPath = path.resolve(fullPath);
		const allowedBasePath = path.resolve(process.cwd(), normalizedMediaFolder);

		if (!resolvedPath.startsWith(allowedBasePath)) {
			logger.warn('Directory traversal attempt detected', { requestedPath: filePath, resolvedPath });
			throw error(403, 'Access denied');
		}

		// Async Stat check (Non-blocking)
		const stats = await stat(resolvedPath);

		if (!stats.isFile()) {
			throw error(400, 'Invalid file request');
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
	} catch (err: any) {
		// Handle Redirects (SvelteKit flow control)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Handle File Not Found specifically
		if (err.code === 'ENOENT') {
			logger.debug('File not found', { path: params.path });
			throw error(404, 'File not found');
		}

		logger.error('Error serving file', { error: err, path: params.path });
		throw error(500, 'Failed to serve file');
	}
};
