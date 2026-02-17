/**
 * @file src/routes/api/collections/[collectionId]/batch/+server.ts
 * @description API endpoint for batch operations on collection entries
 *
 * @example: POST /api/collections/posts/batch
 *
 * Features:
 * Batch delete, status updates, and other bulk operations
 * Performance optimized for large datasets
 * Maintains audit trail for batch operations
 * Permission checking scoped to current tenant
 * Enhanced error reporting for partial failures
 */

import { modifyRequest } from '@api/collections/modifyRequest';
// Auth & Content
import { contentManager } from '@src/content/ContentManager';
import type { FieldInstance } from '@src/content/types';
// Types
import type { BaseEntity, CollectionModel, DatabaseId } from '@src/databases/dbInterface';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
// Logging
import { logger } from '@utils/logger.server';
// Validation
import { array, object, optional, parse, picklist, string } from 'valibot';

// Validation schema for batch operations
const batchOperationSchema = object({
	action: picklist(['delete', 'status', 'clone'], 'Invalid action specified.'),
	entryIds: array(string(), 'Entry IDs must be an array of strings'),
	status: optional(string()),
	cloneCount: optional(string())
});

const normalizeCollectionName = (id: string) => `collection_${id.replace(/-/g, '')}`;

export const POST = apiHandler(async ({ locals, params, request }) => {
	const start = performance.now();
	const { user, tenantId, dbAdapter } = locals;

	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw new AppError('Tenant ID missing', 400, 'TENANT_MISSING');
	}
	if (!dbAdapter) {
		throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
	}

	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema?._id) {
		throw new AppError('Collection not found', 404, 'NOT_FOUND');
	}

	const body = await request.json().catch(() => {
		throw new AppError('Invalid JSON', 400, 'INVALID_JSON');
	});
	const { action, entryIds, status, cloneCount } = parse(batchOperationSchema, body);

	// Logic Checks
	if (action === 'status') {
		if (!status) {
			throw new AppError('Status is required', 400, 'MISSING_DATA');
		}
		const valid = ['publish', 'unpublish', 'draft', 'archived'];
		if (!valid.includes(status)) {
			throw new AppError(`Invalid status. Allowed: ${valid.join(', ')}`, 400, 'INVALID_STATUS');
		}
	}
	if (action === 'clone' && !cloneCount) {
		throw new AppError('Clone count required', 400, 'MISSING_DATA');
	}

	const normalizedName = normalizeCollectionName(schema._id);
	const dbEntryIds = entryIds.map((id) => id as unknown as DatabaseId);
	const query: Record<string, unknown> = { _id: { $in: dbEntryIds } };
	if (getPrivateSettingSync('MULTI_TENANT')) {
		query.tenantId = tenantId;
	}

	// Verification
	const verify = await dbAdapter.crud.findMany<BaseEntity>(normalizedName, query);
	if (!(verify.success && Array.isArray(verify.data)) || verify.data.length !== entryIds.length) {
		throw new AppError('One or more entries do not belong to your tenant or do not exist', 403, 'FORBIDDEN');
	}

	let results: Array<{ entryId: string; success: boolean; error?: string; newId?: string }> = [];
	let successCount = 0;

	// Execute Actions
	if (action === 'delete') {
		try {
			await modifyRequest({
				data: verify.data as unknown as Record<string, unknown>[],
				fields: schema.fields as FieldInstance[],
				collection: schema as unknown as CollectionModel,
				user,
				type: 'DELETE'
			});
		} catch (e) {
			logger.warn('ModifyRequest DELETE failed', e);
		}

		const res = await dbAdapter.crud.deleteMany(normalizedName, query);
		if (res.success) {
			successCount = entryIds.length;
			results = entryIds.map((id) => ({ entryId: id, success: true }));
		} else {
			results = entryIds.map((id) => ({ entryId: id, success: false, error: res.error.message }));
		}
	} else if (action === 'status') {
		const updateData = { status, updatedBy: user._id };
		const res = await dbAdapter.crud.updateMany(normalizedName, query, updateData as Partial<BaseEntity>);
		if (res.success) {
			successCount = entryIds.length;
			results = entryIds.map((id) => ({ entryId: id, success: true }));
		} else {
			results = entryIds.map((id) => ({ entryId: id, success: false, error: res.error.message }));
		}
	} else if (action === 'clone') {
		const entriesToClone: Record<string, unknown>[] = [];
		const originalIds: string[] = [];

		for (const entry of verify.data as BaseEntity[]) {
			const eData = entry as unknown as Record<string, unknown>;
			entriesToClone.push({
				...eData,
				_id: undefined,
				title: `${eData.title || 'Untitled'} (Copy)`,
				createdBy: user._id,
				updatedBy: user._id,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
			originalIds.push(entry._id);
		}

		if (entriesToClone.length > 0) {
			const res = await dbAdapter.crud.insertMany(normalizedName, entriesToClone);
			if (res.success) {
				successCount = res.data.length;
				res.data.forEach((newEntry, i) => {
					results.push({ entryId: originalIds[i], success: true, newId: newEntry._id });
				});
			} else {
				results = originalIds.map((id) => ({ entryId: id, success: false, error: res.error.message }));
			}
		}
	}

	const cacheService = (await import('@src/databases/CacheService')).cacheService;
	await cacheService.clearByPattern(`collection:${schema._id}:*`).catch((e) => logger.warn('Cache clear failed', e));

	const duration = performance.now() - start;
	return json({
		success: true,
		data: { action, results, summary: { total: entryIds.length, successful: successCount, failed: entryIds.length - successCount } },
		performance: { duration }
	});
});
