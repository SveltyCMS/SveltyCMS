/**
 * @file src/routes/api/compile/+server.ts
 * @description API endpoint for compiling and updating collections.
 *
 * This module handles the compilation process:
 * - Executes the compile function
 * - Updates collections
 *
 * Features:
 * - Error logging and handling
 * - Asynchronous compilation and collection update
 *
 * Usage:
 * GET /api/compile
 * No parameters required
 */

import type { RequestHandler } from '@sveltejs/kit';
import { updateCollections } from '@collections';
import { compile } from './compile';
// System Logs
import logger from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	logger.info('Starting compilation process', { url: request.url });

	try {
		// Execute the compile function
		await compile();
		logger.debug('Compilation completed');

		// Execute the updateCollections function with the parameter 'true'
		await updateCollections(true);
		logger.debug('Collections updated');

		const duration = Date.now() - startTime;
		logger.info('Compilation process completed', { duration: `${duration}ms` });

		// Return a successful response with status 200
		return new Response(JSON.stringify({ status: 'success', duration }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error('Error during compilation process', {
			error: error.message,
			stack: error.stack,
			duration: `${duration}ms`
		});

		// Return an error response with status 500
		return new Response(
			JSON.stringify({
				status: 'error',
				message: 'Internal server error',
				duration
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
