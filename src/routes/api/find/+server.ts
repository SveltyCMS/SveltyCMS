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
 * - Multiple document retrieval by query with pagination
 * - Error logging and handling
 *
 * Usage:
 * GET /api/find?collection=<collectionName>&id=<documentId>
 * GET /api/find?collection=<collectionName>&query=<jsonQuery>&page=<page>&limit=<limit>
 */

import type { RequestHandler } from './$types';
import { collectionsModels } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

export const GET: RequestHandler = async ({ url }) => {
	// Retrieve collection name and query parameters from the URL
	const collectionName = url.searchParams.get('collection');
	const id = url.searchParams.get('id');
	const queryParam = url.searchParams.get('query');

	logger.debug(`Collection requested: ${collectionName}`);
	if (id) logger.debug(`ID requested: ${id}`);
	if (queryParam) logger.debug(`Query requested: ${queryParam}`);

	// Check if the collection name is provided
	if (!collectionName) {
		logger.warn('Collection name not provided');
		return new Response('Collection name is required', { status: 400 });
	}

	// Validate that the collection exists in the collectionsModels
	const collection = collectionsModels[collectionName];
	if (!collection) {
		logger.error(`Collection not found: ${collectionName}`);
		return new Response('Collection not found', { status: 404 });
	}

	try {
		let result;

		// If an ID is provided, find the document by ID
		if (id) {
			result = await findById(collection, id);
		} else if (queryParam) {
			// If a query is provided, find documents that match the query
			result = await findByQuery(collection, queryParam);
		} else {
			logger.warn('Neither ID nor query provided');
			return new Response('Either id or query parameter is required', { status: 400 });
		}

		// Return the found documents as a JSON response
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: unknown) {
		// Log and handle errors during the document retrieval process
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Error fetching documents', { error: errorMessage });
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Function to retrieve a document by its ID
async function findById(collection: any, id: string) {
	try {
		const document = await collection.findById(id);
		if (!document) {
			logger.warn(`Document not found with ID: ${id}`);
			throw new Error('Document not found');
		}
		logger.info(`Document found by ID: ${id}`);
		return document;
	} catch (error) {
		logger.error(`Failed to retrieve document by ID: ${id}`, { error });
		throw error;
	}
}

// Function to retrieve documents based on a query with pagination support
async function findByQuery(collection: any, queryParam: string) {
	let query;
	try {
		// Parse the query parameter into a JSON object
		query = JSON.parse(queryParam);
	} catch (error) {
		logger.error('Invalid JSON query provided', {
			queryParam,
			error: error instanceof Error ? error.message : error
		});
		throw new Error(`Invalid JSON query: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}

	try {
		const page = parseInt(query.page, 10) || 1;
		const limit = parseInt(query.limit, 10) || 10;
		const skip = (page - 1) * limit;

		const documents = await collection.find(query).skip(skip).limit(limit);
		if (documents.length === 0) {
			logger.warn(`No documents found matching query: ${JSON.stringify(query)}`);
			throw new Error('No documents found');
		}

		const totalDocuments = await collection.countDocuments(query);
		logger.info(`Documents found by query: ${JSON.stringify(query)}`);
		return {
			documents,
			total: totalDocuments,
			page,
			pages: Math.ceil(totalDocuments / limit)
		};
	} catch (error) {
		logger.error('Failed to retrieve documents by query', { error, query });
		throw error;
	}
}
