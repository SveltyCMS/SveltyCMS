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
import { dbInitPromise } from '@src/databases/db';
import { contentManager } from '@root/src/content/ContentManager';

import type { PageServerLoad } from './$types';

// Roles
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals, url, request }) => {
	// Unauthenticated users should be redirected to the login page
	if (!locals.user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		// Wait for the database connection, model creation, and initial ContentManager load
		await dbInitPromise;
		logger.debug('System is ready, proceeding with page load.');

		// If the current route is not the root route, simply return the user data
		if (url.pathname !== '/') {
			logger.debug(`Already on route ${url.pathname}`);

			// Determine admin status properly by checking role
			const userRole = roles.find((role) => role._id === locals.user?.role);
			const isAdmin = Boolean(userRole?.isAdmin);

			return {
				user: {
					...locals.user,
					isAdmin
				},
				permissions: locals.permissions
			};
		}

		// Get the first collection redirect URL
		if (url.pathname === '/') {
			await dbInitPromise;
			const firstCollection = contentManager.getFirstCollection();
			let redirectUrl = '/';

			if (firstCollection && firstCollection.path) {
				const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
				redirectUrl = `/${defaultLanguage}${firstCollection.path}`;
			} else {
				// Fallback: Get content structure
				const contentNodes = contentManager.getContentStructure();
				if (Array.isArray(contentNodes) && contentNodes.length > 0) {
					const collections = contentNodes.filter((node) => node.nodeType === 'collection' && node._id);
					if (collections.length > 0) {
						const sortedCollections = collections.sort((a, b) => {
							if (a.order !== undefined && b.order !== undefined) {
								return a.order - b.order;
							}
							return (a.name || '').localeCompare(b.name || '');
						});
						const firstCollectionNode = sortedCollections[0];
						const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
						const collectionPath = firstCollectionNode.path || `/${firstCollectionNode._id}`;
						redirectUrl = `/${defaultLanguage}${collectionPath}`;
					}
				}
			}

			logger.info(`Redirecting to \x1b[34m${redirectUrl}\x1b[0m`);

			// Prefetch first collection data for instant loading when navigating to root (fire and forget)
			if (redirectUrl !== '/') {
				import('@utils/collections-prefetch')
					.then(({ prefetchFirstCollectionData }) => {
						const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
						prefetchFirstCollectionData(defaultLanguage, fetch, request).catch((err) => {
							logger.debug('Prefetch failed during root redirect:', err);
						});
					})
					.catch(() => {
						// Silently fail if prefetch module can't be loaded
					});
			}

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
