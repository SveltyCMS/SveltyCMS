/**
 * @file src/routes/api/getCollection/+server.ts
 * @description
 * API endpoint for retrieving a specific collection file.
 *
 * This module handles GET requests to fetch a collection file based on the file name
 * provided as a query parameter. The file is dynamically imported and returned as a
 * JSON response with the appropriate content type.
 *
 * Features:
 * - Retrieves the file name from query parameters
 * - Dynamically imports the specified file
 * - Returns the file contents as a JSON response with 'application/json' content type
 * - Handles errors for missing query parameters
 *
 * Usage:
 * GET /api/getCollection?fileName=<filename>
 * Returns: JSON representation of the requested file
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';

// Define the GET request handler
export const GET: RequestHandler = async ({ url }) => {
	const fileNameQuery = url.searchParams.get('fileName');
	if (!fileNameQuery) {
		return error(400, 'Query parameter "fileName" not found');
	}

	const fileName = fileNameQuery.split('?')[0];

	try {
		// Dynamically import the specified collection file
		const result = await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${fileName}`);
		return json(result, {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (err) {
		return error(500, `Failed to import the file: ${(err as Error).message}`);
	}
};
