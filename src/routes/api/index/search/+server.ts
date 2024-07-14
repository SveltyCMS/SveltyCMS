import { indexer } from '@src/stores/load.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

// Auth
import { auth } from '@src/routes/api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User } from '@src/auth/types';
import type { RequestHandler } from '@sveltejs/kit';

// System Logs
import logger from '@src/utils/logger';

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
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
		logger.debug(`Session ID retrieved: ${session_id}`);

		// Retrieve data from the request form
		const data = await request.formData();

		// Extract user ID from the form data
		const user_id = data.get('user_id') as string;

		// Authenticate user based on user ID or session ID
		const user = user_id
			? ((await auth.checkUser({ user_id })) as User) // Check user with user ID
			: ((await auth.validateSession({ session_id })) as User); // Validate session with session ID

		// Extract search text from the form data
		const searchText = data.get('searchText') as string;

		// If user is not authenticated, return a 403 Forbidden response
		if (!user) {
			logger.warn('Unauthorized search attempt');
			return new Response('', { status: 403 });
		}

		// Send a POST request to the backend with the search text
		if (!process.stdin) {
			logger.error('Indexer process input stream is not available');
			return new Response('Indexer process input stream is not available', { status: 500 });
		}

		logger.info('Starting search', { user: user.user_id, searchText });
		console.time('search');
		process.stdin.write(searchText + '\n');
		const res = await new Promise<string>((resolve) => {
			const listener = process.stdout.once('data', (data) => {
				resolve(data.toString());
				listener.removeAllListeners();
				console.timeEnd('search');
			});
		});
		logger.info('Search completed', { searchText });

		// Return the response from the backend
		return new Response(res, { status: 200 });
	} catch (error) {
		logger.error('Error during search:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
