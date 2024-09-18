/**
 * @file src/routes/(app)/[language]/+layout.server.ts
 * @description
 * This module handles the server-side loading logic for a SvelteKit application,
 * specifically for routes that include a language parameter. It manages collection access
 * and language-specific routing. The module performs the following tasks:
 *
 * - Ensures that the requested language is available.
 * - Manages collection access based on user permissions.
 * - Redirects users based on their permissions and the availability of collections.
 * - Uses authentication and theme information set by hooks.server.ts.
 *
 * The module utilizes various utilities and configurations for robust error handling
 * and logging, providing a secure and user-friendly experience.
 */

import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getCollections } from '@collections';

// Paraglide JS
import { contentLanguage } from '@src/stores/store';

// System Logs
import logger from '@src/utils/logger';

// Config
import { roles as configRoles } from '@root/config/roles';

// Helper function to convert MongoDB document to plain object
function toPlainObject(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(toPlainObject);
	}
	const plainObj: Record<string, any> = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			if (key === '_id' && typeof obj[key].toHexString === 'function') {
				plainObj[key] = obj[key].toHexString();
			} else {
				plainObj[key] = toPlainObject(obj[key]);
			}
		}
	}
	return plainObj;
}

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

// Debounce getCollections with a 300ms delay
const getCollectionsDebounced = debounceAsync(getCollections, 300);

export const load: LayoutServerLoad = async ({ locals, route, params }) => {
	try {
		const { user, theme } = locals;

		if (!user) {
			logger.warn('No valid user session found, redirecting to login.');
			throw redirect(302, '/login');
		}

		// Redirect to user page if lastAuthMethod token
		if (user?.lastAuthMethod === 'token') {
			logger.debug('User authenticated with token, redirecting to user page.');
			throw redirect(302, `/user`);
		}

		const collections = await getCollectionsDebounced();
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

		// Check if user has admin privileges based on their role
		const userRole = configRoles.find((role) => role._id === user.role);
		let hasPermission = userRole?.isAdmin;

		if (!hasPermission && collection?.permissions) {
			// Check if the user has permission to access the collection
			hasPermission = collection.permissions[user.role]?.read !== false;
		}

		logger.debug(`User role: ${user.role}, Role isAdmin: ${userRole?.isAdmin}, Collection: ${collection?.name}, Has permission: ${hasPermission}`);

		if (!hasPermission) {
			logger.warn(`No access to collection ${collection?.name} for role ${user.role}`);
			throw error(401, {
				message: 'No Access to this collection'
			});
		}

		logger.debug(`Using theme: ${JSON.stringify(theme)}`);

		// Convert user and theme to plain objects
		const plainUser = toPlainObject(user);
		const plainTheme = toPlainObject(theme);

		return {
			user: plainUser,
			theme: plainTheme
		};
	} catch (err) {
		logger.error(`Unexpected error in load function: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
};
