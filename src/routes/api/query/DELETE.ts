/**
 * @file src/routes/api/query/DELETE.ts
 * @description Handler for DELETE operations on collections.
 *
 * This module provides functionality to:
 * - Delete multiple documents from a specified collection
 * - Handle associated link deletions
 * - Perform pre-deletion modifications via modifyRequest
 *
 * Features:
 * - Multiple document deletion support
 * - Associated link cleanup
 * - Pre-deletion request modification
 * - Error handling and logging
 */

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

// Database
import { dbAdapter, getCollectionModels } from '@src/databases/db';

// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger';

// Function to handle DELETE requests for a specified collection
export const _DELETE = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`DELETE request received for schema: ${schema.name}, user_id: ${user._id}`);

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

		// Fetch collection models via the dbAdapter
		const collectionsModels = await getCollectionModels();
		logger.debug(`Collection models retrieved: ${Object.keys(collectionsModels).join(', ')}`);

		const collection = collectionsModels[schema.name];
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		// Parse and validate the IDs from the form data
		const ids = data.get('ids');
		if (!ids) {
			logger.error('No IDs provided for deletion');
			return new Response('No IDs provided for deletion', { status: 400 });
		}

		// Convert IDs using the dbAdapter, ensuring it's non-null
		const idsArray = JSON.parse(ids as string).map((id: string) => dbAdapter?.convertId(id));

		if (!idsArray.length) {
			logger.error('No valid IDs provided for deletion');
			return new Response('No valid IDs provided for deletion', { status: 400 });
		}

		// Modify request for each ID and handle associated link deletions
		await Promise.all(
			idsArray.map(async (id: any) => {
				await modifyRequest({
					collection,
					data: [{ _id: id }],
					user,
					fields: schema.fields,
					type: 'DELETE'
				});
				logger.debug(`Request modified for ID: ${id}`);

				const linkedDeletions = (schema.links || []).map((link) =>
					dbAdapter!.deleteMany(link.toString(), {
						_link_id: id,
						_linked_collection: schema.name
					})
				);
				await Promise.all(linkedDeletions);
				logger.debug(`Links deleted for ID: ${id} in related collections`);
			})
		);

		// Perform the deletion in the main collection
		const deletedCount = await collection.deleteMany({ _id: { $in: idsArray } });
		logger.info(`Documents deleted: ${deletedCount} for schema: ${schema.name}`);

		// Return the result as a JSON response
		return new Response(JSON.stringify({ deletedCount }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during DELETE request for schema: ${schema.name}, user_id: ${user._id}: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
};
