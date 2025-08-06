/**
 * @file src/routes/api/dashboard/last5Content/+server.ts
 * @description API endpoint for recent content data for dashboard widgets using database-agnostic adapter.
 *
 * @example GET /api/dashboard/last5Content
 *
 * Features:
 * - **Secure Authorization:** Access is controlled centrally by `src/hooks.server.ts`.
 * - **Database-Agnostic:** Uses standardized adapter methods for cross-database compatibility.
 * - **Input Validation:** Safely validates and caps the `limit` query parameter.
 * - **Multi-Tenant Safe:** All data lookups are scoped to the current tenant.
 */

import { error, json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

import { contentManager } from '@src/content/ContentManager';
import { dbAdapter } from '@src/databases/db';
import { StatusTypes } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

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
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			logger.warn('Unauthorized attempt to access recent content data');
			throw error(401, 'Unauthorized');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		// 1. Validate Input
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		// 2. Get all collection schemas the user can read (scoped to the tenant)
		let allCollections;
		try {
			const collectionData = await contentManager.getCollectionData(tenantId);
			allCollections = collectionData.collections;
		} catch (err) {
			logger.error('Failed to get collection data:', err);
			throw error(500, 'Could not access collection data');
		}

		if (!allCollections || Object.keys(allCollections).length === 0) {
			logger.info('No collections found, returning empty result');
			return json([]);
		}

		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}

		// 3. Process all collections (hooks already validated access)
		const collectionsEntries = Object.entries(allCollections);

		// 4. Query EACH collection for its top 'limit' recent items efficiently (scoped to the tenant)
		const queryPromises = collectionsEntries.map(async ([collectionId, collection]) => {
			try {
				const collectionName = `collection_${collection._id}`;
				const filter = privateEnv.MULTI_TENANT ? { tenantId } : {};

				// Use database-agnostic CRUD methods for reliable querying
				const result = await dbAdapter.crud.findMany(collectionName, filter, {
					limit: query.limit,
					fields: ['_id', 'title', 'name', 'label', 'createdAt', 'created', 'date', 'createdBy', 'author', 'creator', 'status', 'state']
				});

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
		const limitedEntries = allEntries.slice(0, query.limit);

		// 7. Get unique user IDs for username lookup
		const userIds = [...new Set(limitedEntries.map((entry) => entry.createdBy || entry.author || entry.creator).filter(Boolean))];

		// 8. Lookup usernames
		const userLookup = new Map();
		if (userIds.length > 0) {
			try {
				const userResult = await dbAdapter.crud.findMany(
					'auth_users',
					{ _id: { $in: userIds } },
					{ fields: ['_id', 'username', 'email', 'firstName', 'lastName'] }
				);

				if (userResult.success && userResult.data) {
					userResult.data.forEach((user) => {
						// Create display name - prefer username, fallback to firstName + lastName, then email
						let displayName = user.username;
						if (!displayName && (user.firstName || user.lastName)) {
							displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
						}
						if (!displayName) {
							displayName = user.email?.split('@')[0] || 'Unknown';
						}
						userLookup.set(user._id.toString(), displayName);
					});
				}
			} catch (err) {
				logger.warn('Failed to lookup usernames for content:', err);
			}
		}

		// 9. Transform to final format with usernames
		const recentContent = limitedEntries.map((entry) => {
			const userId = entry.createdBy || entry.author || entry.creator || 'Unknown';
			const username = userLookup.get(userId?.toString()) || 'Unknown';

			return {
				id: entry._id?.toString() || entry.id || uuidv4(),
				title: entry.title || entry.name || entry.label || 'Untitled',
				collection: entry.collectionName,
				createdAt: new Date(entry.createdAt || entry.created || entry.date || new Date()),
				createdBy: username,
				status: entry.status || entry.state || StatusTypes.publish
			};
		});

		const validatedData = v.parse(v.array(ContentItemSchema), recentContent);

		logger.info('Recent content fetched efficiently', {
			collectionsQueried: collectionsEntries.length,
			totalCandidates: allEntries.length,
			finalCount: validatedData.length,
			requestedBy: user?._id,
			tenantId
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
