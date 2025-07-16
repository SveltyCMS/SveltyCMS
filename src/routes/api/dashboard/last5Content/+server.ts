/**
 * @file src/routes/api/dashboard/last5Content/+server.ts
 * @description API endpoint for recent content data for dashboard widgets.
 */

import { error, json } from '@sveltejs/kit';
import crypto from 'crypto';
import type { RequestHandler } from './$types';

import { contentManager } from '@root/src/content/ContentManager';
import { dbAdapter } from '@src/databases/db';

// Auth
import { checkApiPermission } from '@src/routes/api/permissions';
import { hasCollectionPermission } from '@src/routes/api/permissions';

// Validation
import * as v from 'valibot';
// System Logger
import { logger } from '@utils/logger.svelte';

// --- Schemas for Validation ---

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20)), 5)
});

const ContentItemSchema = v.object({
	id: v.string(),
	title: v.string(),
	collection: v.string(),
	createdAt: v.date(),
	createdBy: v.string(),
	status: v.string()
});

// --- API Handler ---

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// Check if user has permission for dashboard access using centralized system
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'dashboard',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn('Unauthorized attempt to access recent content data', {
				userId: locals.user?._id,
				error: permissionResult.error
			});
			throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
		}

		// 1. Validate Input
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		// 2. Get all collection schemas the user can read
		const { collections: allCollections } = await contentManager.getCollectionData();

		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}

		// 3. Filter collections user can read and query each for recent items
		const readableCollectionPromises = Object.entries(allCollections).map(async ([collectionId, collection]) => {
			const canRead = await hasCollectionPermission(locals.user, 'read', collection);
			return canRead ? [collectionId, collection] : null;
		});

		const readableCollections = (await Promise.all(readableCollectionPromises)).filter(Boolean) as Array<[string, Record<string, unknown>]>;

		// 4. Query EACH collection for its top 'limit' recent items efficiently
		const queryPromises = readableCollections.map(async ([collectionId, collection]) => {
			try {
				const collectionName = `collection_${collection._id}`;

				// Use database aggregation to get only the recent items we need
				const result = await dbAdapter.find(
					collectionName,
					{},
					{
						sort: { createdAt: -1 }, // Sort by creation date descending
						limit: query.limit, // Only get what we need per collection
						projection: {
							// Only select fields we need
							_id: 1,
							title: 1,
							name: 1,
							label: 1,
							createdAt: 1,
							created: 1,
							date: 1,
							createdBy: 1,
							author: 1,
							creator: 1,
							status: 1,
							state: 1
						}
					}
				);

				if (result.success && result.data && Array.isArray(result.data)) {
					return result.data.map((entry: Record<string, unknown>) => ({
						...entry,
						collectionName: collection.name || collection.label || 'Unknown Collection',
						collectionId
					}));
				}
				return [];
			} catch (err) {
				logger.warn(`Failed to query collection ${collection.name}:`, err);
				return [];
			}
		});

		const results = await Promise.all(queryPromises);

		// 5. Flatten and sort the combined candidates (small dataset now)
		const allEntries = results.flat();

		// Sort by creation date to find the absolute most recent across all collections
		allEntries.sort((a, b) => {
			const dateA = new Date(a.createdAt || a.created || a.date || 0).getTime();
			const dateB = new Date(b.createdAt || b.created || b.date || 0).getTime();
			return dateB - dateA;
		});

		// 6. Take only the requested limit and transform to final format
		const recentContent = allEntries.slice(0, query.limit).map((entry) => ({
			id: entry._id?.toString() || entry.id || crypto.randomUUID(),
			title: entry.title || entry.name || entry.label || 'Untitled',
			collection: entry.collectionName,
			createdAt: new Date(entry.createdAt || entry.created || entry.date || new Date()),
			createdBy: entry.createdBy || entry.author || entry.creator || 'Unknown',
			status: entry.status || entry.state || 'published'
		}));

		const validatedData = v.parse(v.array(ContentItemSchema), recentContent);

		logger.info('Recent content fetched efficiently', {
			collectionsQueried: readableCollections.length,
			totalCandidates: allEntries.length,
			finalCount: validatedData.length,
			requestedBy: locals.user?._id
		});

		return json(validatedData);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Content data failed validation', { error: err.issues });
			throw error(500, 'Internal Server Error: Could not prepare content data.');
		}
		logger.error('Error fetching recent content:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
