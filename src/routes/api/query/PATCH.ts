/**
 * @file src/routes/api/query/PATCH.ts
 * @description Handler for PATCH operations on collections.
 *
 * This module provides functionality to:
 * - Update documents in a specified collection
 * - Creates a historical revision of the document using the dbAdapter if enabled in the schema.
 * - Enforces a revision limit by pruning old revisions if a `revisionLimit` is set in the schema.
 * - Perform pre-update modifications via modifyRequest
 * - Track performance metrics
 *
 * Features:
 * - Document update support
 * - Automated revision pruning
 * - Pre-update request modification
 * - Performance monitoring
 * - Comprehensive error handling and logging
 */

import type { User } from '@src/auth/types';
import type { Schema } from '@src/content/types';

import { dbAdapter } from '@src/databases/db';

// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define a type for the document body being processed
type DocumentBody = Record<string, unknown>;

// Function to handle PATCH requests for a specified collection
export async function _PATCH({ data, schema, user }: { data: FormData; schema: Schema; user: User }) {
	const start = performance.now();
	try {
		logger.debug(`PATCH request received for schema: ${schema._id}, user_id: ${user._id}`);
		if (!dbAdapter) throw new Error('Database adapter not initialized');

		// Validate schema._id
		if (!schema._id) {
			logger.error('Invalid or undefined schema._id.');
			return new Response('Invalid schema._id', { status: 400 });
		}

		// Get collection models
		const collection = await dbAdapter.collection.getModel(schema._id);
		if (!collection) {
			logger.error(`Collection not found for schema._id: ${schema._id}`);
			return new Response('Collection not found', { status: 404 });
		}
		const body: DocumentBody = {};
		const fileIDS: string[] = [];

		for (const [key, value] of data.entries()) {
			try {
				body[key] = JSON.parse(value as string, (_, val: unknown) => {
					if (
						typeof val === 'object' &&
						val !== null &&
						'instanceof' in val &&
						val.instanceof === 'File' &&
						'id' in val &&
						typeof val.id === 'string'
					) {
						fileIDS.push(val.id);
						return data.get(val.id) as File;
					}
					return val;
				});
			} catch {
				body[key] = value;
			}
		}

		// Perform pre-update modifications with performance tracking
		const modifyStart = performance.now();
		const result = await modifyRequest({
			data: [body],
			collection,
			fields: schema.fields,
			user,
			type: 'PATCH'
		});
		const modifyDuration = performance.now() - modifyStart;
		logger.debug(`Request modifications completed in ${modifyDuration.toFixed(2)}ms`);

		// Revision Handling
		if (schema.revision) {
			try {
				const documentId = body._id as string;
				// Fetch the current document state to save it as a revision
				const currentDocResult = await dbAdapter.crud.findOne(`collection_${schema._id}`, { _id: documentId });

				if (currentDocResult.success && currentDocResult.data) {
					// --- START: REVISION LIMIT LOGIC ---
					if (typeof schema.revisionLimit === 'number' && schema.revisionLimit > 0) {
						// 1. Get all existing revisions for this document
						const existingRevisionsResult = await dbAdapter.draftsAndRevisions.getRevisions(schema._id, documentId);
						const existingRevisions = Array.isArray(existingRevisionsResult)
							? existingRevisionsResult
							: (existingRevisionsResult as { data: Record<string, unknown>[] }).data || [];

						// 2. Check if we are at or over the limit
						if (existingRevisions.length >= schema.revisionLimit) {
							// 3. Sort revisions to find the oldest ones
							existingRevisions.sort((a, b) => new Date(a.revision_at || a.createdAt).getTime() - new Date(b.revision_at || b.createdAt).getTime());

							// 4. Determine how many revisions to delete
							const revisionsToDeleteCount = existingRevisions.length - schema.revisionLimit + 1;
							const revisionsToDelete = existingRevisions.slice(0, revisionsToDeleteCount);

							// 5. Delete the oldest revisions
							for (const revision of revisionsToDelete) {
								await dbAdapter.draftsAndRevisions.deleteRevision(revision._id);
								logger.info(`Pruned old revision ${revision._id} from ${schema.name} to enforce limit of ${schema.revisionLimit}.`);
							}
						}
					}
					// --- END: REVISION LIMIT LOGIC ---

					// Use the dedicated method from your dbAdapter to create the new revision
					await dbAdapter.draftsAndRevisions.createRevision(
						schema._id, // collectionId
						documentId, // documentId
						user._id, // userId
						currentDocResult.data // data
					);
					logger.info(`Successfully created revision for entry ${documentId} via dbAdapter.`);
				} else {
					logger.warn(`Could not find document with _id: ${documentId} to create a revision.`);
				}
			} catch (revisionError) {
				const errorMessage = revisionError instanceof Error ? revisionError.message : 'Unknown revision error';
				logger.error(`Failed to create revision for entry ${body._id}: ${errorMessage}`);
			}
		}

		// Update the document
		const updateStart = performance.now();
		const updateResult = await dbAdapter.crud.update(`collection_${schema._id}`, { _id: body._id as string }, result[0]);
		const updateDuration = performance.now() - updateStart;
		logger.debug(`Document update completed in ${updateDuration.toFixed(2)}ms`);

		const totalDuration = performance.now() - start;
		logger.info(`PATCH operation completed in ${totalDuration.toFixed(2)}ms for schema: ${schema._id}`, { user: user._id });

		// Return the result with performance metrics
		return new Response(
			JSON.stringify({
				success: true,
				result: updateResult,
				performance: {
					total: totalDuration,
					modify: modifyDuration,
					update: updateDuration
				}
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`PATCH operation failed after ${duration.toFixed(2)}ms for schema: ${schema._id}: ${errorMessage}`, { stack: errorStack });
		return new Response(
			JSON.stringify({
				success: false,
				error: errorMessage,
				performance: {
					total: duration
				}
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	}
}
