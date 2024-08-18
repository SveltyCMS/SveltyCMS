/**
 * @file src/routes/(app)/user/+page.server.ts
 * @description Server-side logic for the user page in the application.
 *
 * This module handles the server-side operations for the user page, including:
 * - User authentication and session management
 * - Role retrieval
 * - Form validation for adding users and changing passwords
 * - First user detection
 *
 * Features:
 * - Session validation using cookies
 * - User and role information retrieval
 * - Form handling with Superforms
 * - Error logging and handling
 *
 * Usage:
 * This file is used as the server-side counterpart for the user page in a SvelteKit application.
 * It prepares data and handles authentication for the client-side rendering.
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
	await initializationPromise; // Ensure initialization is complete

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw redirect(302, '/login');
	}

	// Secure this page with session cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.debug('No session ID found, redirecting to login');
		throw redirect(302, '/login');
	}

	// Validate the user's session
	let user;
	try {
		user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session, redirecting to login');
			throw redirect(302, '/login');
		}
	} catch (e) {
		logger.error(`Session validation failed: ${(e as Error).message}`);
		throw redirect(302, '/login');
	}

	// Fetch the theme
	let theme;
	try {
		theme = await dbAdapter.getDefaultTheme();
		// Ensure theme is serializable
		theme = JSON.parse(JSON.stringify(theme));
		logger.info(`Theme loaded successfully: ${JSON.stringify(theme)}`);
	} catch (error) {
		logger.error(`Error fetching default theme: ${(error as Error).message}`);
		theme = DEFAULT_THEME;
	}

	// Set the system language if needed based on the theme
	if (theme.language) {
		systemLanguage.set(theme.language);
	}

	// Fetch collections and redirect to the first one
	let collections;
	try {
		collections = await getCollections();
		const firstCollection = Object.keys(collections)[0];

		if (!firstCollection) {
			logger.error('No collections found');
			throw new Error('No collections found');
		}

		// Check if the user has permission to access the first collection
		const collectionPermissions = collections[firstCollection].permissions;
		const userRole = user.role;

		if (collectionPermissions && collectionPermissions[userRole] && collectionPermissions[userRole].read === false) {
			logger.warn(`User ${user._id} does not have permission to access collection ${firstCollection}`);
			throw new Error('No accessible collections found');
		}

		logger.debug(`First accessible collection: ${firstCollection}`);
		throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${collections[firstCollection].name}`);
	} catch (error) {
		logger.error(`Error fetching or accessing collections: ${(error as Error).message}`);
		throw redirect(302, '/login');
	}
};
