/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/status/+server.ts
 * @description API endpoint for updating entry status
 *
 * @example: PATCH /api/collections/posts/123/status
 *
 * Features:
 * Dedicated endpoint for status changes
 * Supports batch status updates via query parameters
 * Maintains audit trail of status changes
 * Permission checking for status modifications, scoped to the current tenant
 */

// Auth
import { contentManager } from '@src/content/ContentManager';
// Types
import { type StatusType, StatusTypes } from '@src/content/types';
import type { BaseEntity, DatabaseId } from '@src/databases/dbInterface';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
// Logging
import { logger } from '@utils/logger.server';

const normalizeCollectionName = (id: string) => `collection_${id.replace(/-/g, '')}`;

// PATCH: Updates entry status
export const PATCH = apiHandler(async ({ locals, params, request }) => {
	const start = performance.now();
	const { user, tenantId, dbAdapter } = locals;
	const { collectionId, entryId } = params;

	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}
	if (!dbAdapter) {
		throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
	}

	await contentManager.initialize(tenantId);
	const schema = await contentManager.getCollectionById(collectionId, tenantId);
	if (!schema?._id) {
		throw new AppError('Collection not found', 404, 'NOT_FOUND');
	}

	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON', 400, 'INVALID_JSON');
	});
	const { status, entries } = body;

	if (!status) {
		throw new AppError('Status is required', 400, 'MISSING_STATUS');
	}
	// All valid status types from StatusTypes constant
	const validStatuses = Object.values(StatusTypes) as StatusType[];
	if (!validStatuses.includes(status)) {
		throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400, 'INVALID_STATUS');
	}

	let results: Array<{ entryId: string; success: boolean; data?: unknown }> = [];
	const normalizedName = normalizeCollectionName(schema._id);
	const updateData = { status, updatedBy: user._id };

	if (entries && Array.isArray(entries) && entries.length > 0) {
		// Batch Status Update
		const query: Record<string, unknown> = { _id: { $in: entries } };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}

		// --- MULTI-TENANCY SECURITY CHECK ---
		// Verify all entries belong to the current tenant before updating.
		const verify = await dbAdapter.crud.findMany(normalizedName, query);
		if (!verify.success || verify.data.length !== entries.length) {
			throw new AppError('One or more entries do not belong to your tenant or do not exist.', 403, 'FORBIDDEN');
		}

		const result = await dbAdapter.crud.updateMany(normalizedName, query, updateData as Partial<BaseEntity>);
		if (!result.success) {
			throw new AppError(result.error.message, 500, 'DB_UPDATE_ERROR');
		}
		results = entries.map((id) => ({ entryId: id, success: true }));
	} else {
		// Single Update
		const query: Record<string, unknown> = { _id: entryId };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}

		const verify = await dbAdapter.crud.findOne(normalizedName, query);
		if (!(verify.success && verify.data)) {
			throw new AppError('Entry not found or access denied', 404, 'NOT_FOUND');
		}

		const result = await dbAdapter.crud.update(normalizedName, entryId as DatabaseId, updateData as Partial<BaseEntity>);
		if (!result.success) {
			throw new AppError(result.error.message, 500, 'DB_UPDATE_ERROR');
		}
		results = [{ entryId, success: true, data: result.data }];
	}

	const cacheService = (await import('@src/databases/CacheService')).cacheService;
	await cacheService.clearByPattern(`collection:${schema._id}:*`).catch((e) => logger.warn('Cache clear failed', e));

	const duration = performance.now() - start;
	return json({
		success: true,
		data: {
			status,
			results,
			summary: { total: results.length, successful: results.filter((r) => r.success).length, failed: 0 }
		},
		performance: { duration }
	});
});
