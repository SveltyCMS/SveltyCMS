/**
 * @file src/routes/api/getCollections/+server.ts
 * @description
 * API endpoint for retrieving collection files or a specific collection file.
 *
 * This module handles GET requests to either fetch all collection files or a specific collection
 * file based on the presence of a query parameter. The endpoint supports both functionalities:
 * - If `fileName` query parameter is present, it returns the specified collection file.
 * - If `fileName` query parameter is absent, it returns a list of all collection files.
 *
 * Features:
 * - Handles both single file retrieval and multiple file listings
 * - Error handling and logging
 * - JSON response formatting
 *
 * Usage:
 * GET /api/getCollections?fileName=<filename> - Returns a specific collection file
 * GET /api/getCollections - Returns a JSON array of collection files
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles'; // Utility function to get all collection files

// System Logger
import { logger } from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async ({ url }) => {
	const fileNameQuery = url.searchParams.get('fileName');

	// If the `fileName` query parameter is provided, return the specific file
	if (fileNameQuery) {
		const fileName = fileNameQuery.split('?')[0];

		try {
			// Dynamically import the specified collection file
			const result = await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${fileName}`);
			logger.info(`Retrieved collection file: ${fileName}`);
			return json(result, {
				headers: {
					'Content-Type': 'application/json'
				}
			});
		} catch (err) {
			logger.error(`Failed to import the file: ${fileName}`, err);
			return error(500, `Failed to import the file: ${(err as Error).message}`);
		}
	}

	// If no `fileName` query parameter is provided, return the list of all collection files
	try {
		// Retrieve the collection files using the getCollectionFiles function
		const files = await getCollectionFiles();
		logger.info('Collection files retrieved successfully');

		// Return the collection files as a JSON response
		return json(files, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		logger.error('Error retrieving collection files', err);
		return error(500, 'Failed to retrieve collection files');
	}
};
