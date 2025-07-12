/**
 * @file src/routes/api/media/+server.ts
 * @description API endpoint for media file listings for dashboard widgets
 */

import { roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// Check if user has permission for dashboard access
		const hasPermission = hasPermissionByAction(
			locals.user,
			'access',
			'system',
			'dashboard',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to access media data', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to access media data.');
		}

		const limit = parseInt(url.searchParams.get('limit') || '5');

		try {
			// Get media files from the mediaFiles directory
			const mediaDir = path.join(process.cwd(), 'mediaFiles');
			const files = await fs.readdir(mediaDir);

			// Filter for image/video files and get file stats
			const mediaFiles = [];
			for (const file of files.slice(0, limit)) {
				try {
					const filePath = path.join(mediaDir, file);
					const stats = await fs.stat(filePath);
					const ext = path.extname(file).toLowerCase();

					// Only include common media file types
					if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi'].includes(ext)) {
						mediaFiles.push({
							name: file,
							size: stats.size,
							modified: stats.mtime.toISOString(),
							type: ext.startsWith('.') ? ext.slice(1) : ext,
							url: `/mediaFiles/${file}`
						});
					}
				} catch (fileError) {
					logger.warn('Error reading file stats:', { file, error: fileError });
				}
			}

			// Sort by modification date (newest first)
			mediaFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

			logger.info('Media files fetched successfully', {
				count: mediaFiles.length,
				requestedBy: locals.user?._id
			});
			return json(mediaFiles.slice(0, limit));
		} catch (dirError) {
			logger.warn('Could not read media directory:', dirError);
			// Return empty array if directory cannot be read
			return json([]);
		}
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching media files:', { error: message, status });
		throw error(status, message);
	}
};
