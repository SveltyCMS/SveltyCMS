/**
 * @file src/hooks/handleTheme.ts
 * @description Handles theme management and persistence using cookies
 *
 * Features:
 * - Server-side theme initialization from cookies
 * - Dark/light mode persistence
 * - Prevents flash of unstyled content (FOUC)
 * - Fallback to system preference
 * - Cookie-based theme storage
 */

import type { Handle } from '@sveltejs/kit';
import { ThemeManager } from '@src/databases/themeManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

export const handleTheme: Handle = async ({ event, resolve }) => {
	const { cookies } = event;

	try {
		// Get theme preference from cookie
		const themePreference = cookies.get('theme');
		const darkModePreference = cookies.get('darkMode');

		// Initialize ThemeManager if available
		let theme = DEFAULT_THEME;
		try {
			const themeManager = ThemeManager.getInstance();
			if (themeManager.isInitialized()) {
				theme = await themeManager.getTheme(event.locals.tenantId);
			} else {
				// ThemeManager not initialized (likely in setup mode), use default theme
				logger.debug('ThemeManager not initialized, using default theme for setup mode');
			}
		} catch (error) {
			// Only log as warning if it's not a setup mode scenario
			if (!event.url.pathname.startsWith('/setup')) {
				logger.warn('Failed to initialize ThemeManager, using default theme:', error);
			} else {
				logger.debug('ThemeManager not available in setup mode, using default theme');
			}
		}

		// Set theme in locals
		event.locals.theme = theme;

		// Set dark mode preference in locals for client-side use
		event.locals.darkMode = darkModePreference === 'true';

		// If we have a theme preference cookie, set it in the response
		if (themePreference) {
			// The theme preference is already set in locals,
			// but we ensure the cookie is set for future requests
			cookies.set('theme', themePreference, {
				path: '/',
				httpOnly: false, // Allow client-side access
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 365 // 1 year
			});
		}

		// If we have a dark mode preference cookie, set it in the response
		if (darkModePreference) {
			cookies.set('darkMode', darkModePreference, {
				path: '/',
				httpOnly: false, // Allow client-side access
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 365 // 1 year
			});
		}
	} catch (error) {
		logger.error('Error in theme handler:', error);
		// Set fallback theme
		event.locals.theme = DEFAULT_THEME;
		event.locals.darkMode = false;
	}

	return resolve(event);
};
