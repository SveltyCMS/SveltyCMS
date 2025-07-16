/**
 * @file src/routes/api/dashboard/last5media/+server.ts
 * @description API endpoint for last 5 media files for dashboard widgets.
 */

import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Auth
import { checkApiPermission } from '@src/routes/api/permissions';

// Validation
import * as v from 'valibot';
// System Logger
import { logger } from '@utils/logger.svelte';

// --- Types, Constants & Schemas ---

const MEDIA_DIR = path.join(process.cwd(), 'mediaFiles');
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', 'svg'];

const MediaItemSchema = v.object({
	name: v.string(),
	size: v.number(),
	modified: v.date(),
	type: v.string(),
	url: v.string()
});

type MediaItem = v.Output<typeof MediaItemSchema>;

// --- API Handler ---

export const GET: RequestHandler = async ({ locals }) => {
	// Check dashboard permissions
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'dashboard',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to access media data', {
			userId: locals.user?._id,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	}

	try {
		const limit = 5;
		const dirEntries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });

		// 1. Concurrently get stats for all supported files
		const fileStatPromises = dirEntries
			.filter((entry) => {
				const ext = path.extname(entry.name).toLowerCase();
				return entry.isFile() && SUPPORTED_EXTENSIONS.includes(ext);
			})
			.map(async (entry) => {
				try {
					const stats = await fs.stat(path.join(MEDIA_DIR, entry.name));
					const ext = path.extname(entry.name).slice(1).toLowerCase();
					return {
						name: entry.name,
						size: stats.size,
						modified: stats.mtime,
						type: ext,
						url: `/mediaFiles/${entry.name}`
					};
				} catch (fileError) {
					logger.warn('Error reading file stats:', { file: entry.name, error: fileError });
					return null; // Return null for files that fail to be read
				}
			});

		const allMedia = (await Promise.all(fileStatPromises)).filter(Boolean) as MediaItem[];

		// 2. Sort by modification date
		allMedia.sort((a, b) => b.modified.getTime() - a.modified.getTime());

		// 3. Slice and validate final data
		const recentMedia = allMedia.slice(0, limit);
		const validatedData = v.parse(v.array(MediaItemSchema), recentMedia);

		logger.info('Recent media fetched successfully', { count: validatedData.length, requestedBy: locals.user?._id });
		return json(validatedData);
	} catch (err) {
		if (err.code === 'ENOENT') {
			logger.warn(`Media directory not found at: ${MEDIA_DIR}`);
			return json([]); // Directory doesn't exist, return empty array
		}
		if (err instanceof v.ValiError) {
			logger.error('Media data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare media data.');
		}
		logger.error('Error fetching recent media:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
