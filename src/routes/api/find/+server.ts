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
 * - Enhanced error logging and handling
 * - Initialization check to ensure database is ready
 *
 * Usage:
 * GET /api/find?collection=<contentTypes>&id=<documentId>
 * GET /api/find?collection=<contentTypes>&query=<jsonQuery>&page=<page>&limit=<limit>
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { collectionsModels, dbInitPromise } from '@src/databases/db';
import { validateUserPermission } from '@src/auth/permissionManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Types
interface DatabaseCollection {
	findById(id: string): Promise<unknown>;
	find(query: unknown): {
		skip(n: number): {
			limit(n: number): Promise<unknown[]>;
		};
	};
	countDocuments(query: unknown): Promise<number>;
}

interface ErrorWithStatus extends Error {
	status?: number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const contentTypes = url.searchParams.get('collection');
	const id = url.searchParams.get('id');
	const queryParam = url.searchParams.get('query');

	logger.debug(`API Find request - Collection: ${contentTypes}, ID: ${id}, Query: ${queryParam}`);

	try {
		// Wait for initialization to complete
		await dbInitPromise;

		// Check if the collection name is provided
		if (!contentTypes) {
			logger.warn('Collection name not provided');
			throw error(400, 'Collection name is required');
		}

		// Validate that the collection exists in the collectionsModels
		const collection = collectionsModels[contentTypes];
		if (!collection) {
			logger.error(`Collection not found: ${contentTypes}`);
			throw error(404, `Collection not found: ${contentTypes}`);
		}

		// Check if the user has permission to read from this collection
		const requiredPermission = `${contentTypes}:read`;
		if (!validateUserPermission(locals.permissions, requiredPermission)) {
			logger.warn(`User lacks required permission: ${requiredPermission}`);
			throw error(403, `Forbidden: Insufficient permissions for ${requiredPermission}`);
		}

		let result;

		// If an ID is provided, find the document by ID
		if (id) {
			result = await findById(collection, id, contentTypes);
		} else if (queryParam) {
			// If a query is provided, find documents that match the query
			result = await findByQuery(collection, queryParam, contentTypes);
		} else {
			logger.warn('Neither ID nor query provided');
			throw error(400, 'Either id or query parameter is required');
		}

		// Return the found documents as a JSON response
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return handleError(err, 'GET operation', { contentTypes, id, queryParam });
	}
};

// Function to retrieve a document by its ID
async function findById(collection: DatabaseCollection, id: string, contentTypes: string) {
	try {
		logger.debug(`Attempting to find document by ID: ${id} in collection: ${contentTypes}`);
		const document = await collection.findById(id);
		if (!document) {
			logger.warn(`Document not found with ID: ${id} in collection: ${contentTypes}`);
			throw error(404, `Document not found with ID: ${id} in collection: ${contentTypes}`);
		}
		logger.info(`Document found by ID: ${id} in collection: ${contentTypes}`);
		return document;
	} catch (err) {
		logger.error(`Failed to retrieve document by ID: ${id} in collection: ${contentTypes}`, { error: err });
		throw error(500, `Failed to retrieve document: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
}

// Function to retrieve documents based on a query with pagination support
async function findByQuery(collection: DatabaseCollection, queryParam: string, contentTypes: string) {
	let query;
	try {
		query = JSON.parse(queryParam);
		logger.debug(`Parsed query for collection ${contentTypes}:`, query);
	} catch (err) {
		logger.error(`Invalid JSON query provided for collection ${contentTypes}`, { queryParam, error: err });
		throw error(400, `Invalid JSON query: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}

	try {
		const page = parseInt(query.page, 10) || 1;
		const limit = parseInt(query.limit, 10) || 10;
		const skip = (page - 1) * limit;

		logger.debug(`Executing query on collection ${contentTypes} with pagination: page ${page}, limit ${limit}`);
		const documents = await collection.find(query).skip(skip).limit(limit);
		if (documents.length === 0) {
			logger.warn(`No documents found matching query in collection ${contentTypes}: ${JSON.stringify(query)}`);
			return { documents: [], total: 0, page, pages: 0 };
		}

		const totalDocuments = await collection.countDocuments(query);
		logger.info(`Documents found by query in collection ${contentTypes}: ${documents.length}, Total: ${totalDocuments}`);
		return {
			documents,
			total: totalDocuments,
			page,
			pages: Math.ceil(totalDocuments / limit)
		};
	} catch (err) {
		logger.error(`Failed to retrieve documents by query in collection ${contentTypes}`, { error: err, query });
		throw error(500, `Failed to retrieve documents: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
}

// Enhanced error handling function
function handleError(err: ErrorWithStatus, operation: string, context: Record<string, unknown>): Response {
	const errorDetails = {
		message: err instanceof Error ? err.message : String(err),
		stack: err instanceof Error ? err.stack : undefined,
		status: err.status || 500,
		body: err.body,
		operation,
		context
	};

	logger.error('Error in API Find operation:', errorDetails);

	let responseBody: string;

	if (err.status && err.body) {
		// This is likely an error thrown by the `error` function
		responseBody = JSON.stringify({
			error: err.body.message,
			status: err.status,
			details: errorDetails
		});
	} else {
		// This is an unexpected error
		responseBody = JSON.stringify({
			error: 'Internal Server Error',
			status: 500,
			details: errorDetails
		});
	}

	return new Response(responseBody, {
		status: err.status || 500,
		headers: { 'Content-Type': 'application/json' }
	});
}
