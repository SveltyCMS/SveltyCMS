/**
 * @file src/routes/(app)/[language]/+layout.server.ts
 * @description
 * This module handles the server-side loading logic for a SvelteKit application,
 * specifically for routes that include a language parameter. It manages user
 * authentication and session handling, ensuring that users have valid sessions
 * before accessing specific collections. The module performs the following tasks:
 *
 * - Validates the user's session and creates a new session if none exists.
 * - Redirects users to the login page if they are not authenticated.
 * - Ensures that the requested language and collection are available.
 * - Redirects users based on their permissions and the availability of collections.
 * - Retrieves the default theme for the user from the database.
 *
 * The module utilizes various utilities and configurations for robust error handling
 * and logging, providing a secure and user-friendly experience.
 */
import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getCollections } from '@collections';

// Auth
import { auth, dbAdapter, initializationPromise } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Paraglide JS
import { contentLanguage } from '@src/stores/store';

// System Logs
import logger from '@src/utils/logger';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

export const load: LayoutServerLoad = async ({ cookies, route, params }) => {
	try {
		// Ensure initialization is complete
		await initializationPromise;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Secure this page with session cookie
		const session_id = cookies.get(SESSION_COOKIE_NAME);

		if (!session_id) {
			logger.debug('No session ID found, redirecting to login');
			throw redirect(302, '/login');
		}

		const user = await auth.validateSession({ session_id });

		// Redirect to login if no valid User session
		if (!user) {
			logger.warn('No valid user session found, redirecting to login.');
			throw redirect(302, '/login');
		}

		// Convert MongoDB ObjectId to string to avoid serialization issues
		if (user._id) {
			user._id = user._id.toString();
		}

		// Redirect to user page if lastAuthMethod token
		if (user?.lastAuthMethod === 'token') {
			logger.debug('User authenticated with token, redirecting to user page.');
			throw redirect(302, `/user`);
		}

		const collections = await getCollections();
		const collection = Object.values(collections).find((c: any) => c.name === params.collection);

		// Check if language and collection both set in URL
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

		if (route.id !== '/(app)/[language]/[collection]') {
			const _filtered = Object.values(collections).filter((c: any) => c?.permissions?.[user.role]?.read !== false);

			if (_filtered.length === 0) {
				logger.warn('No accessible collections found.');
				throw error(404, 'No accessible collections found.');
			}

			const redirectLanguage = params.language || contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE;
			logger.debug(`Redirecting to first accessible collection with language: ${redirectLanguage}`);
			throw redirect(302, `/${redirectLanguage}/${_filtered[0].name}`);
		}

		let hasPermission = user.role === 'admin';
		if (!hasPermission && collection?.permissions) {
			hasPermission = collection.permissions[user.role]?.read !== false;
		}

		logger.debug(`User role: ${user.role}, Collection: ${collection?.name}, Has permission: ${hasPermission}`);

		if (!hasPermission) {
			logger.warn(`No access to collection ${collection?.name} for role ${user.role}`);
			throw error(401, {
				message: 'No Access to this collection'
			});
		}

		const { _id, ...rest } = user;
		let theme = DEFAULT_THEME;

		try {
			const fetchedTheme = await dbAdapter.getDefaultTheme();
			logger.info(`Theme loaded successfully: ${JSON.stringify(fetchedTheme)}`);

			if (fetchedTheme && fetchedTheme.name && fetchedTheme.name !== DEFAULT_THEME.name) {
				theme = {
					name: fetchedTheme.name,
					path: fetchedTheme.path,
					isDefault: fetchedTheme.isDefault,
					createdAt: fetchedTheme.createdAt,
					updatedAt: fetchedTheme.updatedAt
				};
			}
		} catch (err) {
			logger.error('Failed to load theme from database:', err instanceof Error ? err.message : String(err));
			// Fallback to the default theme (already set)
		}

		logger.debug(`Using theme: ${JSON.stringify(theme)}`);

		return {
			user: { _id: _id.toString(), ...rest },
			theme
		};
	} catch (err) {
		logger.error(`Unexpected error in load function: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
};
