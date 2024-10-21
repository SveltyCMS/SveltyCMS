/**
 * @file src/routes/api/query/POST.ts
 * @description Handler for POST operations on collections.
 *
 * This module provides functionality to:
 * - Create new documents in a specified collection
 * - Handle file uploads
 * - Manage links between collections
 * - Process custom widget modifications
 *
 * Features:
 * - Dynamic parsing of form data, including file handling
 * - Automatic status setting for new documents
 * - Unique ID generation for new documents
 * - Link creation between collections
 * - Integration with modifyRequest for custom widget processing
 * - Comprehensive error handling and logging
 *
 * Usage:
 * Called by the main query handler for POST operations
 * Expects FormData with field values for the new document
 *
 * Note: This handler assumes that user authentication and authorization
 * have already been performed by the calling function.
 */

// Types
import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { dbAdapter, getCollectionModels } from '@src/databases/db';
import { modifyRequest } from './modifyRequest';
import { isCollectionName } from '@src/collections/index'; // Import the type guard function

// System logger
import { logger } from '@utils/logger';

// Function to handle POST requests for a specified collection
export const _POST = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`POST request received for schema: ${schema.name}, user_id: ${user._id}`);

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
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		const collection = collections[schema.name]; // Get the specific collection based on the schema name
		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		const body: { [key: string]: any } = {};
		const fileIDS: string[] = [];

		// Parse the form data and build the body object
		for (const [key, value] of data.entries()) {
			try {
				body[key] = JSON.parse(value as string, (_, val) => {
					if (val?.instanceof === 'File') {
						fileIDS.push(val.id);
						return data.get(val.id) as File;
					}
					return val;
				});
			} catch {
				body[key] = value;
			}
		}
		logger.debug(`Form data parsed for ${Object.keys(body).length} fields`);

		// Remove file entries from body
		fileIDS.forEach((id) => delete body[id]);

		// Set the status to 'PUBLISHED' and assign a new ObjectId
		body['status'] = 'PUBLISHED';
		body._id = dbAdapter.generateId();
		logger.debug(`Document prepared for insertion with ID: ${body._id}`);

		// Modify request with the updated body
		await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'POST' });
		logger.debug(`Request modified for document ID: ${body._id}`);

		// Handle links if any
		if (body._links) {
			for (const _collection in body._links) {
				const linkedCollection = collections[_collection];
				if (!linkedCollection) continue;

				const newLinkId = dbAdapter.generateId();
				await dbAdapter.insertMany(_collection, [
					{
						_id: newLinkId,
						_link_id: body._id,
						_linked_collection: schema.name
					}
				]);
				body._links[_collection] = newLinkId;
			}
		}
		logger.debug(`Updated body: ${JSON.stringify(body)} `);

		// Insert the new document into the collection
		const result = await collection.insertMany([body], { lean: true }); // No scehema validation with lean: true

		logger.info(`Document inserted with ID: ${result[0]._id}`);
		// Return the result as a JSON response
		return new Response(JSON.stringify(result), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during POST request: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
};
