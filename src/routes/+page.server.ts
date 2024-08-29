/**
 * @file src/routes/+page.server.ts
 * @description
 * This server-side module handles the initial page load logic for the root route of the SvelteKit application.
 * It performs the following tasks:
 *
 * - Ensures that the authentication system and any necessary initializations are complete before processing requests.
 * - Validates the user's session using a session cookie. If the session is invalid or missing, redirects the user to the login page.
 * - Retrieves the default theme from the database and sets it in the application, falling back to a default theme if retrieval fails.
 * - Updates the system language based on the retrieved theme if applicable.
 * - Fetches the available collections and redirects the user to the first available collection. If no collections are found, logs an error and throws an exception.
 *
 * This module integrates with authentication, theme management, and collection retrieval systems to ensure that users are directed to appropriate content based on their session and available resources.
 */

import { publicEnv } from '@root/config/public';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth, initializationPromise, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { systemLanguage } from '@stores/store';

// Collections
import { getCollections } from '@src/collections';

// System Logs
import logger from '@src/utils/logger';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

export const load: PageServerLoad = async ({ cookies }) => {
	try {
		// Ensure initialization is complete
		await initializationPromise;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw redirect(302, '/login');
		}

		const session_id = cookies.get(SESSION_COOKIE_NAME);

		if (!session_id) {
			logger.debug('No session ID found, redirecting to login');
			throw redirect(302, '/login');
		}

		// Validate the session and retrieve the associated user
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn(`Invalid session or user not found for session ID: ${session_id}`);
			throw redirect(302, '/login');
		}
		logger.debug(`Session validation result: ${user ? 'Valid' : 'Invalid'}`);

		// Fetch the default theme from the database
		let theme;
		try {
			theme = await dbAdapter.getDefaultTheme();
			theme = JSON.parse(JSON.stringify(theme)); // Ensure the theme object is serializable
			logger.info(`Theme loaded successfully: ${JSON.stringify(theme)}`);
		} catch (error) {
			logger.error(`Error fetching default theme: ${(error as Error).message}`);
			theme = DEFAULT_THEME;
		}

		if (theme.language) {
			systemLanguage.set(theme.language);
			logger.debug(`System language set to: ${theme.language}`);
		}

		const collections = await getCollections();

		if (collections && Object.keys(collections).length > 0) {
			const first_collection_key = Object.keys(collections)[0];
			const first_collection = collections[first_collection_key];
			if (first_collection && first_collection.name) {
				logger.debug(`First collection: ${first_collection.name}`);
				throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${first_collection.name}`);
			} else {
				logger.error('First collection is invalid or missing a name');
				throw new Error('Invalid first collection');
			}
		} else {
			logger.error('No collections found');
			throw new Error('No collections found');
		}
	} catch (error) {
		logger.error(`Unexpected error in load function: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
};
