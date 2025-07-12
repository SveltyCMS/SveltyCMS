/**
 * @file src/routes/api/dashboard/last5Content/+server.ts
 * @description API endpoint for recent content data for dashboard widgets
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';

import { contentManager } from '@root/src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.svelte';

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
			logger.warn('Unauthorized attempt to access content data', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to access content data.');
		}

		const limit = parseInt(url.searchParams.get('limit') || '5');

		try {
			// Get collection data from content manager
			const { contentStructure } = await contentManager.getCollectionData();

			// Extract recent content from collections
			const recentContent = [];

			if (contentStructure && Array.isArray(contentStructure)) {
				for (const collection of contentStructure) {
					if (collection.entries && Array.isArray(collection.entries)) {
						// Take a proportional amount from each collection, but at least 1
						const itemsPerCollection = Math.max(1, Math.ceil(limit / contentStructure.length));

						for (const entry of collection.entries.slice(0, itemsPerCollection)) {
							recentContent.push({
								id: entry.id || entry._id || `${collection.name}_${Math.random().toString(36).substr(2, 9)}`,
								title: entry.title || entry.name || entry.label || 'Untitled',
								collection: collection.name || collection.label || 'Unknown Collection',
								createdAt: entry.createdAt || entry.created || entry.date || new Date().toISOString(),
								createdBy: entry.createdBy || entry.author || entry.creator || 'Unknown',
								status: entry.status || entry.state || 'published'
							});
						}
					}
				}
			}

			// Sort by creation date (newest first) and limit results
			recentContent.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
			const limitedContent = recentContent.slice(0, limit);

			logger.info('Content data fetched successfully', {
				count: limitedContent.length,
				requestedBy: locals.user?._id
			});
			return json(limitedContent);
		} catch (contentError) {
			logger.warn('Could not fetch content data:', contentError);
			// Return empty array if content manager fails
			return json([]);
		}
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching content data:', { error: message, status });
		throw error(status, message);
	}
};
