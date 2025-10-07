/**
 * @file src/routes/(app)/+layout.server.ts
 * @description
 * This file is the server-side logic for the all collection data
 *
 * ### Props
 * - `theme` {string} - The theme of the website
 * - `contentStructure` {object} - The structure of the content
 * - `nestedContentStructure` {object} - The nested structure of the content
 *
 * ### Features
 * - Fetches and returns the content structure for the website
 */

import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';
import { publicEnv } from '@src/stores/globalSettings';

import type { LayoutServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals }) => {
	const { theme, user } = locals;
	// Get settings from database with error handling
	const siteName = publicEnv.SITE_NAME || 'SveltyCMS';
	const locales = publicEnv.LOCALES || ['en'];
	const baseLocale = publicEnv.BASE_LOCALE || 'en';
	const pkgVersion = publicEnv.PKG_VERSION || '0.0.0';

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
			settings: {
				SITE_NAME: siteName,
				LOCALES: locales,
				BASE_LOCALE: baseLocale,
				PKG_VERSION: pkgVersion
			}
		};
	} catch (error) {
		logger.error('Failed to load layout data:', error);

		// Return fallback data
		return {
			theme: theme || DEFAULT_THEME,
			user,
			contentStructure: [],
			error: 'Failed to load collection data',
			settings: {
				SITE_NAME: siteName,
				LOCALES: locales,
				BASE_LOCALE: baseLocale,
				PKG_VERSION: pkgVersion
			}
		};
	}
};
