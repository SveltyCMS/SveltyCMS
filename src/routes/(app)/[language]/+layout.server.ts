/**
 * @file src/routes/(app)/[language]/+layout.server.ts
 * @description
 * This module handles the server-side loading logic for a SvelteKit application,
 * specifically for routes that include a language parameter. It manages collection access,
 * language-specific routing, and utilizes the centralized theme. The module performs the following tasks:
 *
 * - Ensures that the requested language is available.
 * - Manages collection access based on user permissions.
 * - Uses authentication information set by hooks.server.ts.
 * - Utilizes the theme provided by event.locals.theme.
 *
 * The module utilizes various utilities and configurations for robust error handling
 * and logging, providing a secure and user-friendly experience.
 */

import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

import { roles as configRoles } from '@root/config/roles';
import { getCollections } from '@collections';

import { DEFAULT_THEME } from '@src/databases/themeManager';
// System Logger
import logger from '@src/utils/logger';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals, params }) => {
	try {
		const { user, permissions, theme } = locals;
		const { language, collection: collectionName } = params;

		logger.debug(`Layout server load started. Language: ${language}, Collection: ${collectionName}`);

		// Ensure the user is authenticated
		if (!user) {
			logger.warn('User not authenticated, redirecting to login.');
			throw redirect(302, '/login');
		}

		// Redirect to user page if lastAuthMethod is token
		if (user.lastAuthMethod === 'token') {
			logger.debug('User authenticated with token, redirecting to user page.');
			throw redirect(302, '/user');
		}

		// Validate the requested language
		if (!publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(language)) {
			logger.warn(`The language '${language}' is not available.`);
			throw error(404, `The language '${language}' is not available.`);
		}

		// Fetch collections
		const collections = await getCollections();
		// Log available collection names for debugging
		const collectionNames = Object.values(collections).map((c) => c.name);
		logger.debug(`Available collections: ${collectionNames.join(', ')}`);
		// Log the requested collection name
		logger.debug(`Requested collection name: ${collectionName}`);

		// If no collection is specified, redirect to the first collection
		if (!collectionName) {
			if (collections && Object.keys(collections).length > 0) {
				const firstCollection = Object.values(collections)[0];
				const redirectUrl = `/${language}/${firstCollection.name}`;
				logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
				throw redirect(302, redirectUrl);
			} else {
				logger.error('No collections found to redirect');
				throw error(404, 'No collections found');
			}
		}

		// Get the specified collection
		const collection = Object.values(collections).find((c) => c.name === collectionName);

		if (!collection) {
			logger.warn(`The collection '${collectionName}' does not exist.`);
			throw error(404, `The collection '${collectionName}' does not exist.`);
		}

		// Determine user permissions based on role and collection
		const userRole = configRoles.find((role) => role._id === user.role);
		let hasPermission = userRole?.isAdmin || false;

		if (!hasPermission && collection.permissions) {
			// Check if the user has permission to access the collection
			const collectionPermissions = collection.permissions[user.role];
			if (collectionPermissions && collectionPermissions.read !== false) {
				// Check if the user has permission to access the collection
				hasPermission = permissions.includes(collection.permissions[user.role]?.read !== false);
			}
		}

		logger.debug(`User role: ${user.role}, isAdmin: ${userRole?.isAdmin}, Collection: ${collection.name}, Has permission: ${hasPermission}`);

		// Deny access if the user lacks necessary permissions
		if (!hasPermission) {
			logger.warn(`No access to collection ${collection.name} for role ${user.role}`);
			throw error(403, 'No Access to this collection');
		}

		return { theme: theme || DEFAULT_THEME, language };
	} catch (err) {
		logger.error(`Unexpected error in load function: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
};
