// @ts-nocheck
/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection.
 * This version is updated to use the modern ContentManager for cleaner logic.
 */
import { getPrivateSettingSync } from '@shared/services/settingsService';
import { publicEnv } from '@shared/stores/globalSettings.svelte';

import { contentManager } from '../content/ContentManager';
import { dbInitPromise } from '@shared/database/db';
import { error, redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';
import type { User, Role } from '@shared/database/auth/types';

// Roles

// System Logger
import { logger } from '@shared/utils/logger.server';

export const load = async ({ locals, url }: Parameters<PageServerLoad>[0]) => {
	const { user, tenantId, roles } = locals as { user: User | null; tenantId: string | undefined; roles: Role[] | undefined };
	const tenantRoles = roles || [];
	if (!user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		// Wait for the database and ContentManager to be ready
		await dbInitPromise;

		// Verify ContentManager is ready (should be from hooks)
		const healthStatus = contentManager.getHealthStatus();
		if (healthStatus.state !== 'initialized') {
			logger.warn('ContentManager not initialized in page load', {
				state: healthStatus.state
			});
		}
		logger.debug('System is ready, proceeding with page load.', { tenantId });

		// For any route other than the root, just return user data
		if (url.pathname !== '/') {
			const userRole = tenantRoles.find((role) => role._id === user?.role);
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
		const redirectLanguage = url.searchParams.get('contentLanguage') || user.locale || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';

		// Use the new, efficient method from ContentManager to get the redirect URL
		const redirectUrl = await contentManager.getFirstCollectionRedirectUrl(redirectLanguage, tenantId);

		// If a valid collection URL is found, redirect the user
		if (redirectUrl) {
			logger.info(`Redirecting to first collection: ${redirectUrl}`, { tenantId });
			throw redirect(302, redirectUrl);
		}

		// If no collections are found, redirect to collectionbuilder
		logger.warn('No collections found for user. Redirecting to collectionbuilder.', { tenantId });
		throw redirect(302, '/config/collectionbuilder');
		const userRole = tenantRoles.find((role) => role._id === user?.role);
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
