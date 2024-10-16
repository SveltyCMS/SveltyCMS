/**
 * @file src/routes/api/importCollection/[...url]/+server.ts
 * @description API endpoint for serving collection files.
 *
 * This module handles GET requests to serve collection files:
 * - Reads the requested file from the collections folder
 * - Determines the appropriate MIME type for the file
 * - Serves the file with the correct Content-Type header
 *
 * Features:
 * - Dynamic file serving based on URL parameters
 * - MIME type detection using mime-types library
 * - Error handling for file not found scenarios
 * - Logging of file access and errors
 *
 * Usage:
 * GET /api/importCollection/[...url]
 * Where [...url] is the path to the file within the collections folder
 *
 * Note: This endpoint should be used cautiously as it serves files directly.
 * Ensure proper access controls are in place to prevent unauthorized access.
 */

import { promises as fsPromises } from 'fs';
import mime from 'mime-types';
import type { RequestHandler } from './$types';
import { join } from 'path';

// System Logger
import { logger } from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async ({ params }) => {
	// Construct the file path from the base directory and the URL parameter
	const filePath = join(import.meta.env.collectionsFolderJS, params.url);
	logger.debug(`Attempting to read file: ${filePath}`);

	try {
		// Read the file asynchronously from the collections folder using the provided URL parameter
		const data = await fsPromises.readFile(filePath);
		logger.info('File read successfully', { filePath });

		// Determine the Content-Type based on the file extension
		const contentType = mime.lookup(params.url) || 'application/octet-stream';

		// Return the file data in the response with the appropriate MIME type
		return new Response(data, {
			headers: {
				'Content-Type': contentType
			}
		});
	} catch (error) {
		// Handle the case where the file is not found
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			logger.warn('File not found:', { filePath });
			return new Response('File not found', { status: 404 });
		} else {
			// Log and respond with a generic error message for other issues
			logger.error('Error reading file:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	}
};
