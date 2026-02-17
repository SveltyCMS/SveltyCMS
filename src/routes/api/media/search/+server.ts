/**
 * @file src/routes/api/media/search/+server.ts
 * @description API endpoint for advanced media search with multiple criteria
 *
 * @example POST /api/media/search
 *
 * Features:
 * - Multi-criteria search (dimensions, EXIF, dates, etc.)
 * - Search suggestions
 * - Filters by file properties
 */

import { dbAdapter } from '@src/databases/db';
import type { MediaItem } from '@src/databases/dbInterface';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { advancedSearch, getSearchSuggestions, type SearchCriteria } from '@utils/media/advancedSearch';
import type { MediaBase } from '@utils/media/mediaModels';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	try {
		// Authentication check
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}

		const body = await request.json();
		const { criteria } = body as { criteria: SearchCriteria };

		if (!criteria || typeof criteria !== 'object') {
			throw error(400, 'Invalid request: search criteria is required');
		}

		logger.info('Advanced search requested', {
			userId: user._id,
			criteria: Object.keys(criteria),
			tenantId
		});

		// Fetch all media files - with ownership filtering
		const isAdmin = user.role === 'admin' || (user as any).isAdmin === true;
		const query: Record<string, any> = {};
		if (!isAdmin) {
			query.user = user._id;
		}

		const result = await dbAdapter.crud.findMany<MediaItem>('MediaItem', query);

		if (!result.success) {
			throw error(500, 'Failed to fetch media files');
		}

		const files = result.data as unknown as MediaBase[];

		// Perform advanced search
		const searchResult = advancedSearch(files, criteria);

		logger.info('Advanced search completed', {
			totalFiles: files.length,
			matchedFiles: searchResult.files.length,
			matchedCriteria: searchResult.matched
		});

		return json({
			success: true,
			...searchResult
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 500;

		logger.error('Advanced search failed', {
			error: message,
			userId: user?._id,
			tenantId
		});

		throw error(status, message);
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals;

	try {
		// Authentication check
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}

		logger.info('Search suggestions requested', { userId: user._id, tenantId });

		// Fetch all media files - with ownership filtering
		const isAdmin = user.role === 'admin' || (user as any).isAdmin === true;
		const query: Record<string, any> = {};
		if (!isAdmin) {
			query.user = user._id;
		}

		const result = await dbAdapter.crud.findMany<MediaItem>('MediaItem', query);

		if (!result.success) {
			throw error(500, 'Failed to fetch media files');
		}

		const files = result.data as unknown as MediaBase[];

		// Get search suggestions
		const suggestions = getSearchSuggestions(files);

		logger.info('Search suggestions generated', {
			tags: suggestions.tags.length,
			cameras: suggestions.cameras.length,
			dimensions: suggestions.commonDimensions.length
		});

		return json({
			success: true,
			suggestions
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 500;

		logger.error('Failed to get search suggestions', {
			error: message,
			userId: user?._id,
			tenantId
		});

		throw error(status, message);
	}
};
