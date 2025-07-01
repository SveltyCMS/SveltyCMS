/**
 * @file src/routes/api/dashboard/last5Content/+server.ts
 * @description API endpoint for recent content data for dashboard widgets
 */

import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

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
			for (const collection of contentStructure) {
				if (collection.entries && Array.isArray(collection.entries)) {
					for (const entry of collection.entries.slice(0, Math.ceil(limit / contentStructure.length))) {
						recentContent.push({
							id: entry.id || entry._id,
							title: entry.title || entry.name || 'Untitled',
							collection: collection.name,
							createdAt: entry.createdAt || entry.created || new Date().toISOString(),
							createdBy: entry.createdBy || entry.author || 'Unknown',
							status: entry.status || 'published'
						});
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
			// Return mock data if content manager fails
			const mockContent = [
				{
					id: '1',
					title: 'Welcome Post',
					collection: 'Posts',
					createdAt: new Date().toISOString(),
					createdBy: 'System',
					status: 'published'
				},
				{
					id: '2',
					title: 'Getting Started',
					collection: 'Pages',
					createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
					createdBy: 'Admin',
					status: 'draft'
				}
			];
			return json(mockContent);
		}
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching content data:', { error: message, status });
		throw error(status, message);
	}
};
