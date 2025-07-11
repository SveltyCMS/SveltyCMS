/**
 * @file src/routes/api/dashboard/last5media/+server.ts
 * @description API endpoint for last 5 media files for dashboard widgets
 */

import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Auth
import { roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ locals }) => {
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
			logger.warn('Unauthorized attempt to access last 5 media data', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to access media data.');
		}

		const limit = 5; // Fixed to 5 for this specific endpoint

		try {
			// Get media files from the mediaFiles directory
			const mediaDir = path.join(process.cwd(), 'mediaFiles');
			const files = await fs.readdir(mediaDir);

			// Filter for image/video files and get file stats
			const mediaFiles = [];
			for (const file of files) {
				try {
					const filePath = path.join(mediaDir, file);
					const stats = await fs.stat(filePath);
					const ext = path.extname(file).toLowerCase();

					// Only include common media file types
					if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi'].includes(ext)) {
						mediaFiles.push({
							name: file,
							size: stats.size,
							modified: stats.mtime,
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

			// Return only the last 5 media files
			const last5Media = mediaFiles.slice(0, limit);

			logger.info('Last 5 media files fetched successfully', {
				count: last5Media.length,
				requestedBy: locals.user?._id
			});

			return json(last5Media);
		} catch (dirError) {
			// If mediaFiles directory doesn't exist or can't be read, return empty array
			logger.warn('Could not read media directory:', dirError);
			return json([]);
		}
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching last 5 media files:', { error: message, status });
		throw error(status, message);
	}
};
