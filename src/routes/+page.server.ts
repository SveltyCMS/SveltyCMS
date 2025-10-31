/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection.
 * This version is updated to use the modern ContentManager for cleaner logic.
 */
import { getPrivateSettingSync } from '@src/services/settingsService';
import { publicEnv } from '@src/stores/globalSettings.svelte';

import { contentManager } from '@src/content/ContentManager';
import { dbInitPromise } from '@src/databases/db';
import { error, redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

// Roles
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, tenantId, roles: tenantRoles } = locals;
	if (!user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		// Wait for the database and ContentManager to be ready
		await dbInitPromise;
		await contentManager.initialize(tenantId);
		logger.debug('System is ready, proceeding with page load.', { tenantId });

		// For any route other than the root, just return user data
		if (url.pathname !== '/') {
			const rolesToUse = tenantRoles && tenantRoles.length > 0 ? tenantRoles : roles;
			const userRole = rolesToUse.find((role) => role._id === user?.role);
			const isAdmin = Boolean(userRole?.isAdmin);

			return {
				user: { ...user, isAdmin },
				permissions: locals.permissions
			};
		}

		// --- Start of Redirect Logic for the Root Route ('/') ---
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		// Determine the correct language for the redirect URL
		const redirectLanguage = url.searchParams.get('contentLanguage') || user.systemLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';

		// Use the new, efficient method from ContentManager to get the redirect URL
		const redirectUrl = await contentManager.getFirstCollectionRedirectUrl(redirectLanguage, tenantId);

		// If a valid collection URL is found, redirect the user
		if (redirectUrl) {
			logger.info(`Redirecting to first collection: \x1b[34m${redirectUrl}\x1b[0m`, { tenantId });
			throw redirect(302, redirectUrl);
		}

		// If no collections are found, do not redirect.
		// The page can render a message like "No collections configured."
		logger.warn('No collections found for user. Staying on root page.', { tenantId });
		const rolesToUse = tenantRoles && tenantRoles.length > 0 ? tenantRoles : roles;
		const userRole = rolesToUse.find((role) => role._id === user?.role);
		const isAdmin = Boolean(userRole?.isAdmin);
		return {
			user: { ...user, isAdmin },
			permissions: locals.permissions
		};
	} catch (err) {
		// Re-throw redirects and known errors
		if (typeof err === 'object' && err !== null && 'status' in err) {
			throw err;
		}
		logger.error('Unexpected error in root page load function', { error: err, tenantId });
		const message = err instanceof Error ? err.message : 'An unexpected error occurred';
		throw error(500, message);
	}
};
