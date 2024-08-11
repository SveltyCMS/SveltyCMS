/**
 * @file src/routes/api/getCollections/+server.ts
 * @description API endpoint for retrieving collection files.
 *
 * This module handles GET requests to fetch collection files:
 * - Uses the getCollectionFiles function to retrieve collection data
 * - Returns the collection files as a JSON response
 *
 * Features:
 * - Error handling and logging
 * - JSON response formatting
 *
 * Usage:
 * GET /api/getCollections
 * Returns: JSON array of collection files
 */

import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';

// System Logger
import logger from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async () => {
	try {
		// Retrieve the collection files using the getCollectionFiles function
		const files = getCollectionFiles();
		logger.info('Collection files retrieved successfully');

		// Return the collection files as a JSON response
		return new Response(JSON.stringify(files), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const err = error as Error;
		logger.error(`Error retrieving collection files: ${err.message}`);
		throw new Error(`Error retrieving collection files: ${err.message}`);
	}
};
