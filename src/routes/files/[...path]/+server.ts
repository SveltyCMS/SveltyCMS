/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves media files from the mediaFiles directory
 */

import { error } from '@sveltejs/kit';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { publicEnv } from '@root/config/public';
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const filePath = params.path;

		if (!filePath) {
			logger.warn('File path not provided');
			throw error(400, 'File path required');
		}

		// Construct the full path to the media file
		const mediaFolderPath = publicEnv.MEDIA_FOLDER || 'mediaFiles';
		const fullPath = join(process.cwd(), mediaFolderPath, filePath);

		// Security check: ensure the file is within the media folder
		const normalizedMediaPath = join(process.cwd(), mediaFolderPath);
		if (!fullPath.startsWith(normalizedMediaPath)) {
			logger.warn('Attempted directory traversal attack', { filePath, fullPath });
			throw error(403, 'Access denied');
		}

		// Check if file exists
		if (!existsSync(fullPath)) {
			logger.debug('File not found', { filePath, fullPath });
			throw error(404, 'File not found');
		}

		// Get file stats
		const stats = statSync(fullPath);
		if (!stats.isFile()) {
			logger.warn('Requested path is not a file', { filePath, fullPath });
			throw error(404, 'Not a file');
		}

		// Read the file
		const fileBuffer = readFileSync(fullPath);

		// Determine MIME type based on file extension
		const ext = filePath.split('.').pop()?.toLowerCase();
		let contentType = 'application/octet-stream';

		switch (ext) {
			case 'jpg':
			case 'jpeg':
				contentType = 'image/jpeg';
				break;
			case 'png':
				contentType = 'image/png';
				break;
			case 'gif':
				contentType = 'image/gif';
				break;
			case 'webp':
				contentType = 'image/webp';
				break;
			case 'avif':
				contentType = 'image/avif';
				break;
			case 'svg':
				contentType = 'image/svg+xml';
				break;
			case 'pdf':
				contentType = 'application/pdf';
				break;
			case 'mp4':
				contentType = 'video/mp4';
				break;
			case 'mp3':
				contentType = 'audio/mpeg';
				break;
			case 'wav':
				contentType = 'audio/wav';
				break;
			default:
				contentType = 'application/octet-stream';
		}

		logger.debug('Serving media file', {
			filePath,
			contentType,
			fileSize: stats.size
		});

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Length': stats.size.toString(),
				'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
				ETag: `"${stats.mtime.getTime()}-${stats.size}"`
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			// Re-throw SvelteKit errors
			throw err;
		}

		logger.error('Error serving media file', {
			path: params.path,
			error: err instanceof Error ? err.message : String(err)
		});
		throw error(500, 'Internal server error');
	}
};
