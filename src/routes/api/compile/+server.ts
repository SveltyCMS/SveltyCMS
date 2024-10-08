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
import { error, json } from '@sveltejs/kit';
// System Logger
import { logger } from '@utils/logger';

let isCompiling = false;
let lastCompileTime = 0;
const COMPILE_COOLDOWN = 60000; // 1 minute cooldown

export const GET: RequestHandler = async ({ url }) => {
	// Extract 'force' query parameter to determine if update should be forced
	const forceUpdate = url.searchParams.get('force') === 'true';
	const currentTime = Date.now();

	if (isCompiling) {
		return json({ success: true, message: 'Compilation already in progress' });
	}

	if (!forceUpdate && currentTime - lastCompileTime < COMPILE_COOLDOWN) {
		return json({ success: true, message: 'Compilation skipped due to cooldown' });
	}

	isCompiling = true;
	lastCompileTime = currentTime;

	try {
		logger.info('Starting compilation process', { forceUpdate });

		// Only compile if forced or if it's been a while since the last compilation
		if (forceUpdate || currentTime - lastCompileTime > COMPILE_COOLDOWN) {
			await compile();
			logger.debug('Compilation completed successfully');
		}

		// Always update collections, but only recompile if forced
		await updateCollections(forceUpdate);
		logger.info('Collections updated successfully');

		isCompiling = false;
		return json({ success: true, message: 'Compilation and collection update completed' });
	} catch (err) {
		isCompiling = false;
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error during compilation process', { error: errorMessage });
		throw error(500, 'Compilation process failed: ' + errorMessage);
	}
};
