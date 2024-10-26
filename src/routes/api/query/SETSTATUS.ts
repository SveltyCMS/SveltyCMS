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

 */

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

// Database
import { dbAdapter, getCollectionModels } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`SETSTATUS request received for schema: ${schema.name}`, { user: user._id });

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		// Validate schema name
		if (!schema.name) {
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
			logger.warn('Missing required fields: ids or status', { user: user._id });
			return new Response('Missing required fields', { status: 400 });
		}

		const ids = JSON.parse(idsJson as string);

		if (!Array.isArray(ids) || ids.length === 0) {
			logger.warn('Invalid or empty ids array', { user: user._id });
			return new Response('Invalid ids format', { status: 400 });
		}

		logger.debug(`Updating status to '${status}' for ${ids.length} documents`, { user: user._id });

		// Update the status of the documents with the specified IDs
		const result = await collection.updateMany({ _id: { $in: ids } }, { $set: { status } });
		logger.info(`Status updated for ${result.modifiedCount} documents in ${schema.name}`, { user: user._id });

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during SETSTATUS request: ${errorMessage}`, { user: user._id });
		return new Response(errorMessage, { status: 500 });
	}
};
