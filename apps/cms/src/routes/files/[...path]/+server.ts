/**
 * @file src/routes/files/[...path]/+server.ts
 * @description Serves media files from local storage or redirects to cloud storage
 *
 * This endpoint handles requests to /files/... with the following logic:
 * - **Local Storage**: Serves files directly from MEDIA_FOLDER
 * - **Cloud Storage** (S3/R2/Cloudinary): Redirects to MEDIA_CLOUD_PUBLIC_URL or MEDIASERVER_URL
 *
 * The storage type is determined by the MEDIA_STORAGE_TYPE setting:
 * - 'local': Serve from local filesystem
 * - 's3', 'r2', 'cloudinary': Redirect to cloud URL
 *
 * Examples:
 * - GET /files/avatars/hash-image.avif (local) -> serves mediaFolder/avatars/hash-image.avif
 * - GET /files/avatars/hash-image.avif (cloud) -> redirects to https://cdn.example.com/avatars/hash-image.avif
 */

import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lookup } from 'mime-types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const filePath = params.path;

		if (!filePath) {
			logger.warn('File request missing path');
			throw error(400, 'File path is required');
		}

		// Check storage type
		const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE');

		// If using cloud storage, redirect to the cloud URL
		if (storageType !== 'local') {
			// Try MEDIA_CLOUD_PUBLIC_URL first, then MEDIASERVER_URL as fallback
			const cloudUrl = getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL');

			if (cloudUrl) {
				// Get MEDIA_FOLDER to use as path prefix in cloud storage
				const mediaFolder = getPublicSettingSync('MEDIA_FOLDER') || '';
				const normalizedFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

				// Construct the full cloud URL with MEDIA_FOLDER prefix
				const baseUrl = cloudUrl.replace(/\/+$/, ''); // Remove trailing slash
				const fullUrl = normalizedFolder ? `${baseUrl}/${normalizedFolder}/${filePath}` : `${baseUrl}/${filePath}`;

				logger.debug('Redirecting to cloud storage', {
					filePath,
					cloudUrl: fullUrl,
					storageType,
					mediaFolder: normalizedFolder
				});
				throw redirect(307, fullUrl);
			} else {
				logger.error('Cloud storage configured but no public URL available', { storageType });
				throw error(500, 'Cloud storage URL not configured');
			}
		}

		// LOCAL STORAGE: Serve from filesystem
		const mediaFolder = getPublicSettingSync('MEDIA_FOLDER');
		if (!mediaFolder) {
			logger.error('MEDIA_FOLDER not configured in system settings');
			throw error(500, 'Media storage not configured');
		}

		// Normalize media folder path (remove ./ prefix)
		const normalizedMediaFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '');

		// Construct full file path
		const fullPath = path.join(process.cwd(), normalizedMediaFolder, filePath);

		// Security: Prevent directory traversal attacks
		const resolvedPath = path.resolve(fullPath);
		const allowedBasePath = path.resolve(process.cwd(), normalizedMediaFolder);

		if (!resolvedPath.startsWith(allowedBasePath)) {
			logger.warn('Directory traversal attempt detected', {
				requestedPath: filePath,
				resolvedPath
			});
			throw error(403, 'Access denied');
		}

		// Check if file exists
		if (!fs.existsSync(resolvedPath)) {
			logger.debug('File not found', { path: resolvedPath });
			throw error(404, 'File not found');
		}

		// Check if it's a file (not a directory)
		const stats = fs.statSync(resolvedPath);
		if (!stats.isFile()) {
			logger.warn('Attempted to access non-file resource', { path: resolvedPath });
			throw error(400, 'Invalid file request');
		}

		// Read file
		const fileBuffer = fs.readFileSync(resolvedPath);

		// Determine MIME type
		const mimeType = lookup(resolvedPath) || 'application/octet-stream';

		// Return file with appropriate headers
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': stats.size.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Last-Modified': stats.mtime.toUTCString()
			}
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Log unexpected errors
		logger.error('Error serving file', { error: err, path: params.path });
		throw error(500, 'Failed to serve file');
	}
};
