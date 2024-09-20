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
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getCollections } from '@collections';
// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logs
import logger from '@src/utils/logger';

// Config
import { roles as configRoles } from '@root/config/roles';

// Helper function to debounce any async function
function debounceAsync(func: (...args: any[]) => Promise<any>, delay: number) {
	let timeout: NodeJS.Timeout;
	let pendingPromise: Promise<any> | null = null;

	return (...args: any[]) => {
		if (pendingPromise) {
			return pendingPromise;
		}

		return new Promise((resolve, reject) => {
			if (timeout) clearTimeout(timeout);

			timeout = setTimeout(async () => {
				try {
					pendingPromise = func(...args);
					const result = await pendingPromise;
					resolve(result);
				} catch (err) {
					reject(err);
				} finally {
					pendingPromise = null;
				}
			}, delay);
		});
	};
}

// Debounce getCollections with a 300ms delay to prevent excessive database calls
const getCollectionsDebounced = debounceAsync(getCollections, 300);

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals, params }) => {
	try {
		const { user, theme } = locals;
		const activeTheme = theme || DEFAULT_THEME;

		// Ensure the user is authenticated
		if (!user) {
			logger.warn('No valid user session found.');
			throw error(401, 'Unauthorized');
		}

		// Redirect to user page if lastAuthMethod token
		if (user?.lastAuthMethod === 'token') {
			logger.debug('User authenticated with token, redirecting to user page.');
			throw redirect(302, `/user`);
		}

		// Fetch collections with debounce to optimize performance
		const collections = await getCollectionsDebounced();
		const collection = Object.values(collections).find((c: any) => c.name === params.collection);

		// Validate the requested language
		if (!publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(params.language as any)) {
			logger.warn(`The language '${params.language}' is not available.`);
			throw error(404, {
				message: `The language '${params.language}' is not available.`
			});
		} else if (!collection && params.collection) {
			logger.warn(`The collection '${params.collection}' does not exist.`);
			throw error(404, {
				message: `The collection '${params.collection}' does not exist.`
			});
		}

		// Determine user permissions based on role
		const userRole = configRoles.find((role) => role._id === user.role);
		let hasPermission = userRole?.isAdmin;

		if (!hasPermission && collection?.permissions) {
			// Check if the user has permission to access the collection
			hasPermission = collection.permissions[user.role]?.read !== false;
		}

		logger.debug(`User role: ${user.role}, Role isAdmin: ${userRole?.isAdmin}, Collection: ${collection?.name}, Has permission: ${hasPermission}`);

		// Deny access if the user lacks necessary permissions
		if (!hasPermission) {
			logger.warn(`No access to collection ${collection?.name} for role ${user.role}`);
			throw error(401, {
				message: 'No Access to this collection'
			});
		}

		return {
			user,
			theme: activeTheme
		};
	} catch (err) {
		logger.error(`Unexpected error in load function: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
};
