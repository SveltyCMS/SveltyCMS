/**
 * @file src/routes/api/collections/[collectionId]/batch/+server.ts
 * @description API endpoint for batch operations on collection entries
 *
 * @example: POST /api/collections/posts/batch
 *
 * Features:
 * * Batch delete, status updates, and other bulk operations
 * * Performance optimized for large datasets
 * * Maintains audit trail for batch operations
 * * Permission checking scoped to current tenant
 * * Enhanced error reporting for partial failures
 */

import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json, type RequestHandler } from '@sveltejs/kit';

// Auth
import { modifyRequest } from '@api/collections/modifyRequest';
import { contentManager } from '@src/content/ContentManager';
import type { StatusType } from '@src/content/types';
import type { DatabaseId, BaseEntity, CollectionModel } from '@src/databases/dbInterface';

// Validation
import { array, object, optional, parse, picklist, string } from 'valibot';

// System Logger
import { logger } from '@utils/logger.server';

// Validation schema for batch operations
const batchOperationSchema = object({
	action: picklist(['delete', 'status', 'clone'], 'Invalid action specified.'),
	entryIds: array(string(), 'Entry IDs must be an array of strings'),
	// Optional fields for specific actions
	status: optional(string()), // Required for status action
	cloneCount: optional(string()) // Required for clone action
});

// Helper function to normalize collection names
const normalizeCollectionName = (collectionId: string): string => {
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};

// POST: Performs batch operations on collection entries
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const start = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}/batch`;
	const { user, tenantId } = locals;

	logger.info(`${endpoint} - Batch operation started`, {
		userId: user?._id,
		tenantId,
		collectionId: params.collectionId
	});

	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Could not identify the tenant for this request.');
		}

		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			throw error(404, 'Collection not found');
		}

		// Parse and validate request body
		let body;
		try {
			body = await request.json();
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const { action, entryIds, status, cloneCount } = parse(batchOperationSchema, body);

		// Validate action-specific requirements
		if (action === 'status' && !status) {
			throw error(400, 'Status is required for status action');
		}

		if (action === 'status' && !['publish', 'unpublish', 'draft', 'archived'].includes(status as StatusType)) {
			throw error(400, `Invalid status. Must be one of: publish, unpublish, draft, archived`);
		}

		if (action === 'clone' && !cloneCount) {
			throw error(400, 'Clone count is required for clone action');
		}

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}

		const normalizedCollectionId = normalizeCollectionName(schema._id); // Build tenant-aware query
		const databaseEntryIds = entryIds.map((id) => id as unknown as DatabaseId);
		const query: { _id: { $in: DatabaseId[] }; tenantId?: string } = { _id: { $in: databaseEntryIds } };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}

		// Verify all entries exist and belong to current tenant
		const verificationResult = await dbAdapter.crud.findMany<BaseEntity>(
			normalizedCollectionId,
			query as unknown as import('@src/databases/dbInterface').QueryFilter<BaseEntity>
		);
		if (!verificationResult.success || !Array.isArray(verificationResult.data) || verificationResult.data.length !== entryIds.length) {
			logger.warn(`${endpoint} - Attempted batch operation on entries outside of tenant`, {
				userId: user._id,
				tenantId,
				requestedEntryIds: entryIds,
				foundEntries: (verificationResult as { success: true; data: BaseEntity[] }).data.length
			});
			throw error(403, 'One or more entries do not belong to your tenant or do not exist');
		}

		const results: Array<{ entryId: string; success: boolean; error?: string; newId?: string }> = [];
		let successCount = 0;

		// Perform the batch operation
		switch (action) {
			case 'delete': {
				// Apply modifyRequest for each entry before deletion
				try {
					await modifyRequest({
						data: verificationResult.data as unknown as Array<Record<string, unknown>>,
						fields: schema.fields as unknown as import('@src/content/types').FieldInstance[],
						collection: schema as unknown as CollectionModel,
						user,
						type: 'DELETE'
					});
				} catch (modifyError) {
					const errorMsg = modifyError instanceof Error ? modifyError.message : 'Unknown error';
					logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
						error: errorMsg
					});
				}

				// Perform batch delete
				const deleteResult = await dbAdapter.crud.deleteMany(normalizedCollectionId, query as Partial<Record<string, unknown>>);
				if (deleteResult.success) {
					successCount = entryIds.length;
					results.push(...entryIds.map((id) => ({ entryId: id, success: true })));
				} else {
					results.push(
						...entryIds.map((id) => ({
							entryId: id,
							success: false,
							error: deleteResult.error.message
						}))
					);
				}

				logger.info(`${endpoint} - Batch delete completed`, {
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}

			case 'status': {
				const updateData = { status, updatedBy: user._id } as Partial<Omit<BaseEntity, 'createdAt' | 'updatedAt'>>;

				const updateResult = await dbAdapter.crud.updateMany(
					normalizedCollectionId,
					query as Partial<Record<string, unknown>>,
					updateData as Partial<Omit<BaseEntity, 'createdAt' | 'updatedAt'>>
				);
				if (updateResult.success) {
					successCount = entryIds.length;
					results.push(...entryIds.map((id) => ({ entryId: id, success: true })));
				} else {
					results.push(
						...entryIds.map((id) => ({
							entryId: id,
							success: false,
							error: updateResult.error.message
						}))
					);
				}

				logger.info(`${endpoint} - Batch status update completed`, {
					newStatus: status,
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}

			case 'clone': {
				// Clone entries - create duplicates with modified titles
				const entriesToClone: Array<Omit<BaseEntity, '_id' | 'createdAt' | 'updatedAt'>> = [];
				const originalIds: string[] = [];

				for (const entry of verificationResult.data as BaseEntity[]) {
					const entryData = entry as unknown as Record<string, unknown>;
					const clonedEntry = {
						...entryData,
						_id: undefined, // Remove ID so a new one is generated
						title: `${entryData.title || 'Untitled'} (Copy)`,
						createdBy: user._id,
						updatedBy: user._id,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					} as unknown as Omit<BaseEntity, '_id' | 'createdAt' | 'updatedAt'>;

					entriesToClone.push(clonedEntry);
					originalIds.push(entry._id);
				}

				if (entriesToClone.length > 0) {
					// Use optimized insertMany
					const insertResult = await dbAdapter.crud.insertMany(normalizedCollectionId, entriesToClone);

					if (insertResult.success) {
						successCount = insertResult.data.length;
						// Map new IDs back to results
						insertResult.data.forEach((newEntry, index) => {
							results.push({
								entryId: originalIds[index],
								success: true,
								newId: newEntry._id
							});
						});
					} else {
						// Fallback to individual errors if batch fails completely (though insertMany usually throws or returns all/nothing depending on impl)
						// Assuming all failed if success is false
						results.push(
							...originalIds.map((id) => ({
								entryId: id,
								success: false,
								error: insertResult.error.message
							}))
						);
					}
				}

				logger.info(`${endpoint} - Batch clone completed`, {
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}
		}

		const duration = performance.now() - start;

		// Invalidate server-side page cache for this collection after batch operation
		const cacheService = (await import('@src/databases/CacheService')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after batch operation', { pattern: cachePattern, error: err });
		});

		return json({
			success: true,
			data: {
				action,
				results,
				summary: {
					total: entryIds.length,
					successful: successCount,
					failed: entryIds.length - successCount
				}
			},
			performance: { duration }
		});
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}

		const duration = performance.now() - start;
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : undefined;
		logger.error(`${endpoint} - Unexpected error`, {
			error: errorMsg,
			stack,
			duration: `${duration.toFixed(2)}ms`
		});
		throw error(500, 'Internal Server Error');
	}
};
