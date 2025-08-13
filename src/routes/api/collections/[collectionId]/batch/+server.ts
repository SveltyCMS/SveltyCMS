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

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { StatusTypes } from '@src/content/types';
import { modifyRequest } from '@api/collections/modifyRequest';

// Validation
import { array, object, parse, picklist, string, minLength, optional } from 'valibot';

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation schema for batch operations
const batchOperationSchema = object({
	action: picklist(['delete', 'status', 'clone'], 'Invalid action specified.'),
	entryIds: array(string([minLength(1, 'Entry ID cannot be empty.')])),
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

		if (privateEnv.MULTI_TENANT && !tenantId) {
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

		if (action === 'status' && !Object.values(StatusTypes).includes(status as StatusTypes)) {
			throw error(400, `Invalid status. Must be one of: ${Object.values(StatusTypes).join(', ')}`);
		}

		if (action === 'clone' && !cloneCount) {
			throw error(400, 'Clone count is required for clone action');
		}

		const dbAdapter = locals.dbAdapter;
		const normalizedCollectionId = normalizeCollectionName(schema._id);

		// Build tenant-aware query
		const query: { _id: { $in: string[] }; tenantId?: string } = { _id: { $in: entryIds } };
		if (privateEnv.MULTI_TENANT) {
			query.tenantId = tenantId;
		}

		// Verify all entries exist and belong to current tenant
		const verificationResult = await dbAdapter.crud.findMany(normalizedCollectionId, query);
		if (!verificationResult.success || verificationResult.data.length !== entryIds.length) {
			logger.warn(`${endpoint} - Attempted batch operation on entries outside of tenant`, {
				userId: user._id,
				tenantId,
				requestedEntryIds: entryIds,
				foundEntries: verificationResult.data?.length || 0
			});
			throw error(403, 'One or more entries do not belong to your tenant or do not exist');
		}

		const results: Array<{ entryId: string; success: boolean; error?: string }> = [];
		let successCount = 0;

		// Perform the batch operation
		switch (action) {
			case 'delete': {
				// Apply modifyRequest for each entry before deletion
				try {
					await modifyRequest({
						data: verificationResult.data,
						fields: schema.fields,
						collection: schema,
						user,
						type: 'DELETE'
					});
				} catch (modifyError) {
					logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
						error: modifyError.message
					});
				}

				// Perform batch delete
				const deleteResult = await dbAdapter.crud.deleteMany(normalizedCollectionId, query);

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
				const updateData = { status, updatedBy: user._id };

				const updateResult = await dbAdapter.crud.updateMany(normalizedCollectionId, query, updateData);

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
				const cloneResults = [];

				for (const entry of verificationResult.data) {
					try {
						const clonedEntry = {
							...entry,
							_id: undefined, // Remove ID so a new one is generated
							title: `${entry.title} (Copy)`,
							createdBy: user._id,
							updatedBy: user._id,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString()
						};

						const cloneResult = await dbAdapter.crud.insert(normalizedCollectionId, clonedEntry);

						if (cloneResult.success) {
							cloneResults.push({ entryId: entry._id, success: true, newId: cloneResult.data._id });
							successCount++;
						} else {
							cloneResults.push({
								entryId: entry._id,
								success: false,
								error: cloneResult.error.message
							});
						}
					} catch (cloneError) {
						cloneResults.push({
							entryId: entry._id,
							success: false,
							error: cloneError.message
						});
					}
				}

				results.push(...cloneResults);

				logger.info(`${endpoint} - Batch clone completed`, {
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}
		}

		const duration = performance.now() - start;

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
		if (e.status) {
			throw e;
		}

		const duration = performance.now() - start;
		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`
		});
		throw error(500, 'Internal Server Error');
	}
};
