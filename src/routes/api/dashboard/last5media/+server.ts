/**
 * @file src/routes/api/dashboard/last5media/+server.ts
 * @description API endpoint for last 5 media files for dashboard widgets using database-agnostic adapter.
 */

import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';

// Database
// import { dbAdapter } from '@src/databases/db';

// Auth

// System Logger
import { logger } from '@utils/logger.server';

// Validation
import * as v from 'valibot';

// --- Types & Schemas ---

const MEDIA_ITEM_SCHEMA = v.object({
	name: v.string(),
	size: v.number(),
	modified: v.date(),
	type: v.string(),
	url: v.string()
});

// --- API Handler ---

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ locals }) => {
	const dbAdapter = locals.dbAdapter;
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		logger.warn('Unauthorized attempt to access media data');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
	}

	if (!dbAdapter) {
		logger.error('Database adapter not available');
		throw new AppError('Database connection unavailable', 500, 'DB_ERROR');
	}

	// Check if media adapter is available
	if (!dbAdapter.media?.files?.getByFolder) {
		logger.warn('Media adapter not available, returning empty result');
		return json([]);
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
			requestedBy: user?._id,
			tenantId
		});
		// Return empty array instead of throwing error for dashboard widgets
		return json([]);
	}

	// Check if we have data and items
	if (!(result.data?.items && Array.isArray(result.data.items))) {
		logger.warn('No media items found or invalid response structure');
		return json([]);
	}

	// Transform the data to match the expected format
	let items = result.data.items;

	// --- MULTI-TENANCY: Filter by tenantId if enabled ---
	if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
		items = items.filter((file) => (file as unknown as Record<string, unknown>).tenantId === tenantId);
	}

	const recentMedia = items.map((file) => {
		let url = file.path || '';
		// Strip 'mediaFolder/' or 'files/' prefix
		url = url.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		// Ensure no leading slash before prepending /files/
		url = url.replace(/^\/+/, '');

		return {
			name: file.filename || 'Unknown',
			size: file.size || 0,
			modified: new Date(file.updatedAt),
			type: file.mimeType.split('/')[1] || 'unknown',
			url: `/files/${url}`
		};
	});
	const validatedData = v.parse(v.array(MEDIA_ITEM_SCHEMA), recentMedia);

	logger.info('Recent media fetched successfully via database adapter', {
		count: validatedData.length,
		total: result.data.total,
		requestedBy: user?._id,
		tenantId
	});

	return json(validatedData);
});
