/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection with the correct language.
 *
 * ### Features
 * - Fetches and returns the content structure for the website
 * - Redirects to the first collection with the correct language
 * - Throws an error if there are no collections *
 */

import { publicEnv } from '@root/config/public';
import { redirect, error } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';
import { dbInitPromise } from '@src/databases/db';

import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Unauthenticated users should be redirected to the login page
	if (!locals.user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		// Wait for the database connection, model creation, and initial ContentManager load
		await dbInitPromise;
		logger.debug('System is ready, proceeding with page load.');

		// Now ContentManager is guaranteed to be initialized and have loaded initial data
		const collection = await contentManager.getFirstCollection();

		// If there are no collections, throw a 404 error
		if (!collection) {
			logger.error('No collections available for redirection');
			throw error(404, 'No collections found');
		}

		// If the current route is not the root route, simply return the user data
		if (url.pathname !== '/') {
			logger.debug(`Already on route ${url.pathname}`);
			return { user: locals.user, permissions: locals.permissions };
		}

		// Get the first collection and use its UUID
		if (url.pathname === '/') {
			const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
			if (!collection) throw new Error('No First collections found');

			// Construct redirect URL using UUID instead of name
			const redirectUrl = `/${defaultLanguage}${collection.path}`;

			logger.info(`Redirecting to \x1b[34m${redirectUrl}\x1b[0m`);
			throw redirect(302, redirectUrl);
		}
	} catch (err) {
		// If the error has a status code (like a thrown redirect or error from sveltekit), rethrow it
		if (typeof err === 'object' && err !== null && 'status' in err) {
			throw err;
		}
		// Log other unexpected errors
		console.error('err', err); // Keep console.error for visibility during dev
		logger.error('Unexpected error in root page load function', err);
		// Use the specific error message if available
		const message = err instanceof Error ? err.message : 'An unexpected error occurred';
		throw error(500, message);
	}
};
