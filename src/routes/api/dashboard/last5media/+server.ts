/**
 * @file src/routes/api/dashboard/last5media/+server.ts
 * @description API endpoint for last 5 media files for dashboard widgets using database-agnostic adapter.
 */

import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Database
import { dbAdapter } from '@src/databases/db';

// Auth
import { checkApiPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

// --- Types & Schemas ---

const MediaItemSchema = v.object({
	name: v.string(),
	size: v.number(),
	modified: v.date(),
	type: v.string(),
	url: v.string()
});

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
		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}

		// Use database-agnostic adapter to get recent media files
		const result = await dbAdapter.media.files.getByFolder(undefined, {
			page: 1,
			pageSize: 5,
			sortField: 'updatedAt',
			sortDirection: 'desc'
		});

		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: locals.user?._id
			});
			// Return empty array instead of throwing error for dashboard widgets
			return json([]);
		}

		// Transform the data to match the expected format
		const recentMedia = result.data.items.map((file) => ({
			name: file.filename,
			size: file.size,
			modified: new Date(file.updatedAt),
			type: file.mimeType.split('/')[1] || 'unknown',
			url: file.path
		}));

		const validatedData = v.parse(v.array(MediaItemSchema), recentMedia);

		logger.info('Recent media fetched successfully via database adapter', {
			count: validatedData.length,
			total: result.data.total,
			requestedBy: locals.user?._id
		});

		return json(validatedData);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Media data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare media data.');
		}
		logger.error('Error fetching recent media:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
