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
 * - logger: Logger utility from `@utils/logger` to record system logs for debugging and error handling.
 *
 * @function GET
 * @description The GET request handler executes the `compile` function and updates
 * collections. It logs the process start, completion, and any errors, returning
 * either a 200 (success) or 500 (error) HTTP response.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { updateCollections } from '@collections';
import { compile } from './compile';
import { error } from '@sveltejs/kit';

// System Logs
import { logger } from '@utils/logger';

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
	} catch (err) {
		const message = `Error in [functionName]: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
