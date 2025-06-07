/**
 * @file src/routes/api/query/SETSTATUS.ts
 * @description Handler for SETSTATUS operations on collections.
 *
 * This module provides functionality to:
 * - Update the status of multiple documents in a specified collection
 *
 * Features:
 * - Batch status update for multiple documents
 * - Support for all collections defined in the schema
 * - Performance monitoring
 * - Comprehensive error handling and logging
 */

import type { Schema } from '@src/content/types';
import type { User } from '@src/auth/types';

// Database
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	const start = performance.now();
	try {
		logger.debug(`SETSTATUS request received for schema: ${schema.id}`, { user: user._id });

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', {
				status: 500
			});
		}

		// Validate schema ID
		if (!schema.id) {
			logger.error('Invalid or undefined schema ID.');
			return new Response('Invalid or undefined schema ID.', { status: 400 });
		}

		// Get collection models with performance tracking
		const modelStart = performance.now();
		if (!dbAdapter?.collection) {
			logger.error('Collection adapter is not available');
			return new Response('Internal server error: Collection adapter not available', {
				status: 500
			});
		}
		const collection = await dbAdapter.collection.getModel(schema.id);
		const modelDuration = performance.now() - modelStart;
		logger.debug(`Collection models retrieved in ${modelDuration.toFixed(2)}ms`);

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema ID: ${schema.id}`);
			return new Response('Collection not found', { status: 404 });
		}

		// Parse the IDs and status from the form data
		const parseStart = performance.now();
		const idsJson = data.get('ids');
		const status = data.get('status');
		const scheduledTime = data.get('_scheduled');
		const scheduledAction = data.get('_scheduledAction');

		if (!idsJson || !status) {
			logger.warn('Missing required fields: ids or status', { user: user._id });
			return new Response('Missing required fields', { status: 400 });
		}

		const ids = JSON.parse(idsJson as string);

		if (!Array.isArray(ids) || ids.length === 0) {
			logger.warn('Invalid or empty ids array', { user: user._id });
			return new Response('Invalid ids format', { status: 400 });
		}

		const parseDuration = performance.now() - parseStart;
		logger.debug(`Data parsed in ${parseDuration.toFixed(2)}ms. Updating status to '${status}' for ${ids.length} documents`, {
			user: user._id
		});

		// Prepare update data
		const updateData: Record<string, FormDataEntryValue | undefined> = { status };

		// Add scheduling data if status is 'scheduled'
		if (status === 'scheduled') {
			if (!scheduledTime) {
				logger.warn('Missing scheduled time for scheduled status', { user: user._id });
				return new Response('Missing scheduled time', { status: 400 });
			}
			updateData._scheduled = scheduledTime;
			if (scheduledAction) {
				updateData._scheduledAction = scheduledAction;
			}
		}

		// Update the status of the documents with performance tracking
		const updateStart = performance.now();
		const result = await collection.updateMany(
			{ _id: { $in: ids } },
			{
				$set: updateData,
				...(status !== 'scheduled' && {
					$unset: {
						_scheduled: '',
						_scheduledAction: ''
					}
				})
			}
		);
		const updateDuration = performance.now() - updateStart;

		const totalDuration = performance.now() - start;
		logger.info(`Status updated for ${result.modifiedCount} documents in ${updateDuration.toFixed(2)}ms, total time: ${totalDuration.toFixed(2)}ms`, {
			user: user._id
		});

		// Return the result with performance metrics
		return new Response(
			JSON.stringify({
				success: true,
				result,
				performance: {
					total: totalDuration,
					models: modelDuration,
					parse: parseDuration,
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
		logger.error(`SETSTATUS operation failed after ${duration.toFixed(2)}ms for schema ID: ${schema.id}: ${errorMessage}`, {
			user: user._id,
			stack: errorStack
		});
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
};
