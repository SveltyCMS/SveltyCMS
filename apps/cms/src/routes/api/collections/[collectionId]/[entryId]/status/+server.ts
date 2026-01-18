/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/status/+server.ts
 * @description API endpoint for updating entry status
 *
 * @example: PATCH /api/collections/posts/123/status
 *
 * Features:
 * * Dedicated endpoint for status changes
 * * Supports batch status updates via query parameters
 * * Maintains audit trail of status changes
 * * Permission checking for status modifications, scoped to the current tenant
 */

import { getPrivateSettingSync, getPublicSettingSync } from '@shared/services/settingsService';
import { error, json, type RequestHandler } from '@sveltejs/kit';

// Auth
import { contentManager } from '@content/ContentManager';
import { StatusTypes, type StatusType } from '@cms-types';

// Helper function to normalize collection names for database operations
const normalizeCollectionName = (collectionId: string): string => {
	// Remove hyphens from UUID for MongoDB collection naming
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};

// System Logger
import { logger } from '@shared/utils/logger.server';
import type { BaseEntity, DatabaseId } from '@shared/database/dbInterface';

// PATCH: Updates entry status
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const start = performance.now();
	const { user, tenantId } = locals; // Destructure user and tenantId

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Ensure ContentManager is initialized before accessing collections
	await contentManager.initialize(tenantId);

	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}

	try {
		let body;
		try {
			body = await request.json();
		} catch (parseError) {
			const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
			logger.error(`Failed to parse request body: ${errorMsg}`);
			throw error(400, 'Invalid JSON in request body');
		}

		const { status, entries, locale } = body;

		if (!status) {
			throw error(400, 'Status is required');
		}

		// All valid status types from StatusTypes constant
		const validStatuses = Object.values(StatusTypes) as StatusType[];
		if (!validStatuses.includes(status)) {
			throw error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
		}

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}

		let results = [];
		const normalizedCollectionId = normalizeCollectionName(schema._id);

		// Determine if per-locale publishing is enabled
		const systemEnabled = getPublicSettingSync('ENABLE_PER_LOCALE_PUBLISHING') ?? false;
		const collectionEnabled = schema.perLocalePublishing ?? false;
		const perLocaleEnabled = systemEnabled && collectionEnabled;

		// Build update data based on per-locale setting
		let updateData: Record<string, unknown>;
		if (perLocaleEnabled && locale) {
			// Update locale-specific status
			updateData = {
				[`statusByLocale.${locale}`]: status,
				updatedBy: user._id
			};
			// Clear locale-specific schedule when setting status
			if (status !== StatusTypes.schedule) {
				updateData[`_scheduledByLocale.${locale}`] = null;
			}
		} else {
			// Update global status
			updateData = {
				status,
				updatedBy: user._id
			};
			// Clear global schedule when setting status
			if (status !== StatusTypes.schedule) {
				updateData._scheduled = null;
			}
		}

		if (entries && Array.isArray(entries) && entries.length > 0) {
			// Batch status update
			const query: Record<string, unknown> = { _id: { $in: entries } };
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = tenantId;
			}

			// --- MULTI-TENANCY SECURITY CHECK ---
			// Verify all entries belong to the current tenant before updating.
			const verificationResult = await dbAdapter.crud.findMany(normalizedCollectionId, query as any);
			if (!verificationResult.success || verificationResult.data.length !== entries.length) {
				logger.warn(`Attempt to update status for entries outside of tenant`, {
					userId: user._id,
					tenantId,
					requestedEntryIds: entries
				});
				throw error(403, 'Forbidden: One or more entries do not belong to your tenant or do not exist.');
			}

			const result = await dbAdapter.crud.updateMany(normalizedCollectionId, query as any, updateData as Partial<BaseEntity>);
			if (result.success) {
				results = entries.map((entryId) => ({ entryId, success: true }));
			} else {
				throw error(500, result.error.message);
			}
		} else {
			// Single entry status update - verify entry exists and belongs to tenant first
			const query: Record<string, unknown> = { _id: params.entryId };
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = tenantId;
			}

			// Verify the entry exists and belongs to the current tenant
			const verificationResult = await dbAdapter.crud.findOne(normalizedCollectionId, query as any);
			if (!verificationResult.success || !verificationResult.data) {
				throw error(404, 'Entry not found or access denied');
			}

			const result = await dbAdapter.crud.update(normalizedCollectionId, params.entryId as DatabaseId, updateData as Partial<BaseEntity>);

			if (!result.success) {
				throw error(500, result.error.message);
			}

			if (!result.data) {
				throw error(404, 'Entry not found');
			}

			results = [{ entryId: params.entryId, success: true, data: result.data }];
		}

		const duration = performance.now() - start;
		const successCount = results.filter((r) => r.success).length;

		// Invalidate server-side page cache for this collection after status change
		const cacheService = (await import('@shared/database/CacheService')).cacheService; // Monorepo path
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after status change', { pattern: cachePattern, error: err });
		});

		logger.info(`Status updated for ${successCount}/${results.length} entries in ${duration.toFixed(2)}ms`, { tenantId });

		return json({
			success: true,
			data: {
				status,
				results,
				summary: {
					total: results.length,
					successful: successCount,
					failed: results.length - successCount
				}
			},
			performance: { duration }
		});
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			const errorBody =
				'body' in e && typeof e.body === 'object' && e.body !== null && 'message' in e.body ? (e.body as { message?: string }).message : undefined;
			const errorMsg = e instanceof Error ? e.message : 'Unknown error';
			logger.error(`Status update error (${(e as any).status})`, {
				error: (e as any).message,
				stack: (e as any).stack,
				body: errorBody || errorMsg
			});
			throw e; // Re-throw SvelteKit errors
		}

		const duration = performance.now() - start;
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : undefined;
		logger.error(`Failed to update status: ${errorMsg} in ${duration.toFixed(2)}ms`, {
			error: e,
			stack,
			collectionId: params.collectionId,
			entryId: params.entryId
		});
		throw error(500, 'Internal Server Error');
	}
};
