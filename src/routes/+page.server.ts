/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection with the correct language for the current tenant.
 *
 * ### Features
 * - Fetches and returns the content structure for the website, scoped by tenant
 * - Redirects to the first collection with the correct language
 * - Throws an error if there are no collections for the tenant
 */
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

import { redirect, error } from '@sveltejs/kit';
import { dbInitPromise } from '@src/databases/db';
import { contentManager } from '@src/content/ContentManager';

import type { PageServerLoad } from './$types';

// Roles
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	const { user, tenantId, roles: tenantRoles } = locals; // Unauthenticated users should be redirected to the login page
	if (!user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		// Wait for the database connection, model creation, and initial ContentManager load
		await dbInitPromise;
		logger.debug('System is ready, proceeding with page load.', { tenantId }); // If the current route is not the root route, simply return the user data

		if (url.pathname !== '/') {
			logger.debug(`Already on route ${url.pathname}`, { tenantId }); // Determine admin status properly by checking tenant-specific role

			const rolesToUse = tenantRoles && tenantRoles.length > 0 ? tenantRoles : roles;
			const userRole = rolesToUse.find((role) => role._id === user?.role);
			const isAdmin = Boolean(userRole?.isAdmin);

			return {
				user: {
					...user,
					isAdmin
				},
				permissions: locals.permissions
			};
		} // Get the first collection redirect URL for the current tenant

		if (url.pathname === '/') {
			if (privateEnv.MULTI_TENANT && !tenantId) {
				throw error(400, 'Tenant could not be identified for this operation.');
			}
			const firstCollection = await contentManager.getFirstCollection(tenantId);
			let redirectUrl = '/';

			if (firstCollection && firstCollection.path) {
				const contentLanguageCookie = url.searchParams.get('contentLanguage');
				const userLanguage = user?.systemLanguage;
				const redirectLanguage = contentLanguageCookie || userLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
				redirectUrl = `/${redirectLanguage}${firstCollection.path}`;
			} else {
				// Fallback: Get content structure for the tenant
				const contentNodes = await contentManager.getContentStructure(tenantId);
				if (Array.isArray(contentNodes) && contentNodes.length > 0) {
					const collections = contentNodes.filter((node) => node.nodeType === 'collection' && node._id);
					if (collections.length > 0) {
						const sortedCollections = collections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || ''));
						const firstCollectionNode = sortedCollections[0];
						const contentLanguageCookie = url.searchParams.get('contentLanguage');
						const userLanguage = user?.systemLanguage;
						const redirectLanguage = contentLanguageCookie || userLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
						const collectionPath = firstCollectionNode.path || `/${firstCollectionNode._id}`;
						redirectUrl = `/${redirectLanguage}${collectionPath}`;
					}
				}
			}

			logger.info(`Redirecting to \x1b[34m${redirectUrl}\x1b[0m`, { tenantId }); // Prefetch first collection data for instant loading

			if (redirectUrl !== '/') {
				import('@utils/collections-prefetch')
					.then(({ prefetchFirstCollectionData }) => {
						const contentLanguageCookie = url.searchParams.get('contentLanguage');
						const userLanguage = user?.systemLanguage;
						const redirectLanguage = contentLanguageCookie || userLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
						prefetchFirstCollectionData(redirectLanguage, fetch).catch((err) => {
							logger.debug('Prefetch failed during root redirect:', err);
						});
					})
					.catch(() => {});
			}

			throw redirect(302, redirectUrl);
		}
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'status' in err) {
			throw err;
		}
		logger.error('Unexpected error in root page load function', { error: err, tenantId });
		const message = err instanceof Error ? err.message : 'An unexpected error occurred';
		throw error(500, message);
	}
};
