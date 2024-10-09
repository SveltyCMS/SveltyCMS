/**
 * @file src/routes/api/index/search/+server.ts
 * @description API endpoint for performing searches using an external indexer process.
 *
 * This module handles POST requests for search operations:
 * - Authenticates the user using either a user ID or session ID
 * - Manages the lifecycle of an external indexer process
 * - Performs the search operation by communicating with the indexer process
 *
 * Features:
 * - User authentication and authorization
 * - On-demand spawning of the indexer process
 * - Interprocess communication for search operations
 * - Error handling and logging
 * - Performance timing for search operations
 *
 * Usage:
 * POST /api/index/search
 * Body: FormData with 'user_id' or session cookie, and 'searchText'
 * Returns: Search results as provided by the indexer process
 *
 * Note: This endpoint relies on an external 'main.exe' process for indexing and searching.
 * Ensure that this executable is available and properly configured.
 */

import { indexer } from '@src/stores/store';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { RequestHandler } from '@sveltejs/kit';

// System Logs
import { logger } from '@src/utils/logger';

// Define the POST request handler
export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		// Check if the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			return new Response('Internal Server Error', { status: 500 });
		}

		// Check if the indexer process is running, if not, spawn it
		let process: ChildProcessWithoutNullStreams | undefined = indexer;
		if (!process || process.exitCode !== null) {
			process = spawn('main.exe');
			logger.info('Indexer process spawned');
		} else {
			logger.debug('Indexer process is already running');
		}

		// Retrieve the session ID from cookies
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		logger.debug(`Session ID retrieved: ${session_id}`);

		// Retrieve data from the request form
		const data = await request.formData();

		// Extract user ID and search text from the form data
		const user_id = data.get('user_id') as string | null;
		const searchText = data.get('searchText') as string | null;

		if (!searchText) {
			logger.warn('Search attempt with empty search text');
			return new Response('Search text is required', { status: 400 });
		}

		// Authenticate user based on user ID or session ID
		const user = user_id ? await auth.checkUser({ user_id }) : session_id ? await auth.validateSession({ session_id }) : null;

		// If user is not authenticated, return a 403 Forbidden response
		if (!user) {
			logger.warn('Unauthorized search attempt');
			return new Response('Unauthorized', { status: 403 });
		}

		// Send a POST request to the backend with the search text
		if (!process.stdin) {
			logger.error('Indexer process input stream is not available');
			return new Response('Indexer process input stream is not available', { status: 500 });
		}

		logger.info('Starting search', { user: user._id, searchText });
		const startTime = process.hrtime();

		process.stdin.write(searchText + '\n');
		const res = await new Promise<string>((resolve) => {
			const listener = process.stdout.once('data', (data) => {
				resolve(data.toString());
				listener.removeAllListeners();
			});
		});

		const [seconds, nanoseconds] = process.hrtime(startTime);
		const duration = seconds + nanoseconds / 1e9;
		logger.info('Search completed', { searchText, duration: `${duration.toFixed(3)}s` });

		// Return the response from the backend
		return new Response(res, {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		logger.error('Error during search:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
