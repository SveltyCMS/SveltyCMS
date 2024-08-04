/**
 * @file src/routes/api/find/+server.ts
 * @description API endpoint for finding documents in collections.
 *
 * This module handles finding documents in collections:
 * - Retrieves documents by ID or query
 * - Supports all collections in the collectionsModels
 *
 * Features:
 * - Single document retrieval by ID
 * - Multiple document retrieval by query
 * - Error logging and handling
 *
 * Usage:
 * GET /api/find?collection=<collectionName>&id=<documentId>
 * GET /api/find?collection=<collectionName>&query=<jsonQuery>
 */

import type { RequestHandler } from './$types';
import { collectionsModels } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

// Define GET request handler
export const GET: RequestHandler = async ({ url }) => {
	// Get collection and id from URL search parameters
	const collectionName = url.searchParams.get('collection');
	const id = url.searchParams.get('id');
	const queryParam = url.searchParams.get('query');

	logger.debug(`Collection requested: ${collectionName}`);
	logger.debug(`ID requested: ${id}`);

	if (!collectionName) {
		logger.warn('Collection name not provided');
		return new Response('Collection name is required', { status: 400 });
	}

	const collection = collectionsModels[collectionName];
	if (!collection) {
		logger.error(`Collection not found: ${collectionName}`);
		return new Response('Collection not found', { status: 404 });
	}

	try {
		let result;
		// If id is provided, find document by id and return response
		if (id) {
			result = await findById(collection, id);
		} else if (queryParam) {
			// Otherwise, parse query from URL search parameters, find documents matching query, and return response
			result = await findByQuery(collection, queryParam);
		} else {
			logger.warn('Neither ID nor query provided');
			return new Response('Either id or query parameter is required', { status: 400 });
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Error fetching documents', { error: errorMessage });
		return new Response('Internal Server Error', { status: 500 });
	}
};
// Get all documents collection by query ID

async function findById(collection: any, id: string) {
	const document = await collection.findById(id);
	if (!document) {
		logger.warn(`Document not found with ID: ${id}`);
		throw new Error('Document not found');
	}
	logger.info(`Document found by ID: ${id}`);
	return document;
}

// Get all documents collection by document type
async function findByQuery(collection: any, queryParam: string) {
	let query;
	try {
		query = JSON.parse(queryParam);
	} catch (error) {
		logger.error('Invalid JSON query', { queryParam });
		throw new Error('Invalid JSON query');
	}
	const documents = await collection.find(query);
	logger.info(`Documents found by query: ${JSON.stringify(query)}`);
	return documents;
}
