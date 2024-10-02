/**
 * @file src/routes/api/compile/+server.ts
 * @description This file defines the GET request handler for the `/compile` endpoint.
 * The handler initiates a compilation process and updates collections. It logs the
 * progress and handles errors, returning appropriate HTTP responses.
 *
 * @dependencies
 * - RequestHandler: Type from `@sveltejs/kit` used for typing the GET request handler.
 * - updateCollections: Function imported from `@collections` to update collections post-compilation.
 * - compile: Function imported from `./compile` to handle the compilation logic.
 * - logger: Logger utility from `@src/utils/logger` to record system logs for debugging and error handling.
 *
 * @function GET
 * @description The GET request handler executes the `compile` function and updates
 * collections. It logs the process start, completion, and any errors, returning
 * either a 200 (success) or 500 (error) HTTP response.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { updateCollections } from '@collections';
import { compile } from './compile';

// System Logs
import { logger } from '@src/utils/logger';

// Handles GET requests to the `/compile` endpoint.
export const GET: RequestHandler = async () => {
	try {
		// Log the start of the compilation process
		logger.debug('Starting compilation...');

		// Execute the compile function to initiate compilation
		await compile();

		// Update the collections after compilation
		await updateCollections(true);

		// Log the successful update of collections
		logger.debug('Collections updated.');

		// Return a successful response with status 200
		return new Response(null, { status: 200 });
	} catch (error) {
		// Log any errors that occur during the GET request
		logger.error('Error during GET /compile:', error);

		// Return an error response with status 500
		return new Response(null, { status: 500 });
	}
};
