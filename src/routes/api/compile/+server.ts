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

export const GET: RequestHandler = async ({ url }) => {
	// Extract 'force' query parameter to determine if update should be forced
	const forceUpdate = url.searchParams.get('force') === 'true';

	try {
		// Log the start of the compilation process
		logger.info('Starting compilation process');

		// Execute the compilation function
		await compile();
		// Log successful compilation
		logger.debug('Compilation completed successfully');

		// Update collections, using the forceUpdate parameter
		await updateCollections(forceUpdate);
		// Log successful collection update
		logger.info('Collections updated successfully');

		// Return a JSON response indicating success
		return json({ success: true, message: 'Compilation and collection update completed' });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error during compilation process', { error: errorMessage });
		throw error(500, 'Compilation process failed: ' + errorMessage);
	}
};
