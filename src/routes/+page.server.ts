/**
 * @file src/routes/+page.server.ts
 * @description
 * This server-side module handles the initial page load logic for the root route of the SvelteKit application.
 * It performs the following tasks:
 *
 * - Ensures that the authentication system and any necessary initializations are complete before processing requests.
 * - Retrieves user session and permissions from locals (set by hooks.server.ts).
 * - Fetches the available collections and redirects the user to the first available collection.
 * - Uses the theme set by hooks.server.ts.
 *
 * This module integrates with authentication, theme management, and collection retrieval systems to ensure that users are directed to appropriate content based on their session and available resources.
 */

import { publicEnv } from '@root/config/public';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Databases
import { initializationPromise } from '@src/databases/db';

// Collections
import { getCollections } from '@src/collections';

// System Logs
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		logger.debug('Load function started');

		// Ensure initialization is complete
		await initializationPromise;
		logger.debug('Initialization complete');

		// User and permissions are now set by hooks.server.ts
		const user = locals.user;
		const permissions = locals.permissions;

		logger.debug(`User loaded: ${user ? 'Yes' : 'No'}`);
		logger.debug(`Permissions loaded: ${permissions && permissions.length > 0 ? 'Yes' : 'No'}`);

		// Fetch collections only if needed
		if (!locals.collections) {
			logger.debug('Fetching collections');
			const collections = await getCollections();
			logger.debug(`Collections fetched: ${Object.keys(collections).join(', ')}`);
			locals.collections = collections;
		}

		if (locals.collections && Object.keys(locals.collections).length > 0) {
			const first_collection_key = Object.keys(locals.collections)[0];
			const first_collection = locals.collections[first_collection_key];
			logger.debug(`First collection key: ${first_collection_key}`);

			if (first_collection && first_collection.name) {
				logger.debug(`Redirecting to first collection: ${first_collection.name}`);
				throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${first_collection.name}`);
			} else {
				logger.error('First collection is invalid or missing a name');
				throw error(500, 'Invalid first collection');
			}
		} else {
			logger.error('No collections found');
			throw error(404, 'No collections found');
		}
	} catch (err) {
		// Handle errors as in your original code
		logger.error(`Unexpected error in load function: +page.server: ${err instanceof Error ? err.message : 'Unknown error'}`);
		throw error(500, 'An unexpected error occurred');
	}
};
