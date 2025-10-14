/**
 * @file src/routes/(app)/+layout.server.ts
 * @description Optimized server-side logic for the main application layout.
 *
 * ### Features
 * - Fetches data required by all pages within the (app) group.
 * - Caches the main content structure (`contentManager.getNavigationStructure()`) to improve performance and reduce database load on every navigation.
 * - Provides a cache invalidation function to be called when content structure changes.
 * - Relies on session data for the user object, avoiding redundant database queries.
 * - Ensures all data returned to the client is properly serialized.
 * - Conditionally fetches data (like virtual folders) only when on specific routes.
 */

import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';
import { loadSettingsCache } from '@src/services/settingsService';

import type { LayoutServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals }) => {
	const { theme, user } = locals;

	// Load settings from server-side cache (defaults from seed data)
	const { public: publicSettings } = await loadSettingsCache();

	try {
		await contentManager.initialize();

		const contentStructure = await contentManager.getNavigationStructure();

		// Get fresh user data from database to ensure we have the latest avatar info
		let freshUser = user;
		if (user) {
			try {
				// Dynamically import to avoid mixed import warnings while keeping it async
				const { auth } = await import('@src/databases/db');
				// Note: Using dynamic import in async context to load only when needed
				if (auth) {
					const dbUser = await auth.getUserById(user._id.toString());
					if (dbUser) {
						freshUser = dbUser;
						logger.debug('Fresh user data loaded in layout', {
							userId: dbUser._id,
							hasAvatar: !!dbUser.avatar,
							avatar: dbUser.avatar
						});
					}
				}
			} catch (error) {
				logger.warn('Failed to fetch fresh user data in layout, using session data:', error);
				freshUser = user; // Fallback to session data
			}
		}

		return {
			theme: theme || DEFAULT_THEME,
			contentStructure: contentStructure,
			user: freshUser,
			publicSettings // Pass public settings to client (includes all defaults from seed)
		};
	} catch (error) {
		logger.error('Failed to load layout data:', error);

		// Return fallback data
		return {
			theme: theme || DEFAULT_THEME,
			user,
			contentStructure: [],
			error: 'Failed to load collection data',
			publicSettings // Pass public settings even on error
		};
	}
};
