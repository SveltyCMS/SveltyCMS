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

import { contentManager } from '@src/content/content-manager';
import type { BaseEntity, DatabaseId, ISODateString } from '@src/content/types';
import { dbAdapter } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
import { nowISODateString } from '@utils/date-utils';

// System Logger
import { logger } from '@utils/logger.server';
import { v4 as uuidv4 } from 'uuid';
// Validation
import * as v from 'valibot';

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20)), 5)
});

// All dates should be ISO date strings (see dateUtils)
const ContentItemSchema = v.object({
	id: v.string(),
	title: v.string(),
	collection: v.string(),
	createdAt: v.string(), // ISODateString
	createdBy: v.string(),
	status: v.string()
});

// --- API Handler ---
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ locals, url }) => {
	const { user, tenantId } = locals;
	// Authentication is handled by hooks.server.ts
	if (!user) {
		logger.warn('Unauthorized attempt to access recent content data');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
	}

	// 1. Validate Input
	const query = v.parse(QuerySchema, {
		limit: Number(url.searchParams.get('limit')) || undefined
	});

	// 2. Get all collection schemas the user can read (scoped to the tenant)
	let allCollections: any;
	try {
		allCollections = await contentManager.getCollections();
	} catch (err) {
		logger.error('Failed to get collections:', err);
		throw new AppError('Could not access collections', 500, 'COLLECTION_FETCH_ERROR');
	}

	if (!allCollections || Object.keys(allCollections).length === 0) {
		logger.info('No collections found, returning empty result');
		return json([]);
	}

	// Narrow adapter once (avoid non-null assertions later)
	const adapter = dbAdapter;
	if (!adapter) {
		logger.error('Database adapter not available');
		throw new AppError('Database connection unavailable', 500, 'DB_ERROR');
	}

	// 3. Process all collections (hooks already validated access)
	const collectionsEntries = Object.entries(allCollections);

	// 4. Query EACH collection for its top 'limit' recent items efficiently (scoped to the tenant)
	// NOTE: Generic CRUD methods require T extends BaseEntity.
	// We include createdAt/updatedAt fields in the query even if we only
	// use createdAt for ordering to satisfy the constraint.
	interface DashboardRawEntry extends BaseEntity {
		author?: string;
		created?: ISODateString | string;
		createdBy?: string;
		creator?: string;
		date?: ISODateString | string;
		label?: string;
		name?: string;
		state?: string;
		status?: string;
		tenantId?: string;
		title?: string;
		[key: string]: unknown;
	}

	interface UserDoc extends BaseEntity {
		email?: string;
		firstName?: string;
		lastName?: string;
		username?: string;
		[key: string]: unknown;
	}

	interface CombinedEntry extends DashboardRawEntry {
		collectionId: string;
		collectionName: string;
	}

	const resolveTimestamp = (e: DashboardRawEntry): string | undefined =>
		e.createdAt || (e.created as string | undefined) || (e.date as string | undefined);

	const queryPromises = collectionsEntries.map(async ([collectionId, collection]: [string, any]) => {
		try {
			const collectionName = `collection_${collection._id}`;
			const filter = getPrivateSettingSync('MULTI_TENANT') ? { tenantId } : {};

			// Use database-agnostic CRUD methods with explicit generic
			const result = await adapter.crud.findMany<DashboardRawEntry>(collectionName, filter as Partial<DashboardRawEntry>, {
				limit: query.limit,
				fields: ['_id', 'title', 'name', 'label', 'createdAt', 'updatedAt', 'created', 'date', 'createdBy', 'author', 'creator', 'status', 'state']
			});

			if (result.success && Array.isArray(result.data)) {
				return (result.data as DashboardRawEntry[]).map((entry) => ({
					...entry,
					collectionName:
						(collection as unknown as { name?: string; label?: string }).name ||
						(collection as unknown as { label?: string }).label ||
						'Unknown Collection',
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
	const allEntries: CombinedEntry[] = results.flat() as CombinedEntry[];

	// Sort by creation date to find the absolute most recent across all collections
	allEntries.sort((a, b) => {
		const tsA = resolveTimestamp(a);
		const tsB = resolveTimestamp(b);
		return new Date(tsB || 0).getTime() - new Date(tsA || 0).getTime();
	});

	// 6. Take only the requested limit and transform to final format
	const limitedEntries: CombinedEntry[] = allEntries.slice(0, query.limit);

	// 7. Get unique user IDs for username lookup
	const userIds = [...new Set(limitedEntries.map((entry) => entry.createdBy || entry.author || entry.creator).filter(Boolean))] as DatabaseId[];

	// 8. Lookup usernames
	const userLookup = new Map();
	if (userIds.length > 0) {
		try {
			const userResult = await adapter.crud.findByIds<UserDoc>('auth_users', userIds, {
				fields: ['_id', 'username', 'email', 'firstName', 'lastName']
			});
			if (userResult.success && userResult.data) {
				for (const u of userResult.data) {
					let displayName = u.username;
					if (!displayName && (u.firstName || u.lastName)) {
						displayName = [u.firstName, u.lastName].filter(Boolean).join(' ');
					}
					if (!displayName) {
						displayName = u.email?.split('@')[0] || 'Unknown';
					}
					userLookup.set(String(u._id), displayName);
				}
			}
		} catch (err) {
			logger.warn('Failed to lookup usernames for content:', err);
		}
	}

	// 9. Transform to final format with usernames
	const recentContent = limitedEntries.map((entry) => {
		const userId = entry.createdBy || entry.author || entry.creator || 'Unknown';
		const username = userLookup.get(String(userId)) || 'Unknown';
		const ts = resolveTimestamp(entry);
		const iso = ts ? new Date(ts).toISOString() : nowISODateString();
		return {
			id: String(entry._id ?? (entry as Record<string, unknown>).id ?? uuidv4()),
			title: entry.title || entry.name || entry.label || 'Untitled',
			collection: entry.collectionName,
			createdAt: iso,
			createdBy: username,
			status: entry.status || entry.state || 'publish'
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
});
