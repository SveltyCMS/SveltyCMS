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
 * - Error handling and logging
 *
 * Usage:
 * Called by the main query handler for SETSTATUS operations
 * Expects FormData with 'ids' (JSON array of document IDs) and 'status' fields
 *
 * Note: This handler assumes that user authentication and authorization
 * have already been performed by the calling function.
 */

import type { Schema } from '@src/collections/types';
import { dbAdapter, getCollectionModels } from '@src/databases/db';
import { isCollectionName } from '@src/collections/index'; // Import the type guard function

// System logger
import logger from '@src/utils/logger';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema }: { data: FormData; schema: Schema }) => {
	try {
		logger.debug(`SETSTATUS request received for schema: ${schema.name}`);

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		// Validate the collection name using the type guard
		if (!schema.name || !isCollectionName(schema.name)) {
			logger.error('Invalid or undefined schema name.');
			return new Response('Invalid or undefined schema name.', { status: 400 });
		}

		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name]; // Get the specific collection based on the schema name

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		// Parse the IDs and status from the form data
		const idsJson = data.get('ids');
		const status = data.get('status');

		if (!idsJson || !status) {
			logger.warn('Missing required fields: ids or status');
			return new Response('Missing required fields', { status: 400 });
		}

		const ids = JSON.parse(idsJson as string);

		if (!Array.isArray(ids) || ids.length === 0) {
			logger.warn('Invalid or empty ids array');
			return new Response('Invalid ids format', { status: 400 });
		}

		logger.debug(`Updating status to '${status}' for ${ids.length} documents`);

		// Update the status of the documents with the specified IDs
		const result = await collection.updateMany({ _id: { $in: ids } }, { $set: { status } });
		logger.info(`Status updated for ${result.modifiedCount} documents in ${schema.name}`);

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during SETSTATUS request: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
};
