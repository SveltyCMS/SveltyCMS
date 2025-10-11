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

import { DEFAULT_THEME, ThemeManager } from '@src/databases/themeManager';
import type { Handle } from '@sveltejs/kit';

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

		// Use centralized state check
		if (!event.locals.__skipSystemHooks) {
			try {
				const themeManager = ThemeManager.getInstance();
				if (themeManager.isInitialized()) {
					theme = await themeManager.getTheme(event.locals.tenantId);
				} else {
					// ThemeManager not initialized, but not in setup.
					// This can happen during the first request after setup completes and the server restarts.
					// Silently use the default theme; the manager will be ready on the next navigation.
					logger.trace('ThemeManager not ready, using default theme. This is normal after initial setup.');
				}
			} catch (error) {
				logger.warn('Failed to get theme from ThemeManager, using default theme:', error);
			}
		}

		// Set theme in locals
		event.locals.theme = theme;

		// Determine dark mode preference
		let isDarkMode = false;

		if (darkModePreference !== undefined) {
			// Use saved preference if available
			isDarkMode = darkModePreference === 'true';
		} else if (themePreference !== undefined) {
			// Use saved theme preference if available
			isDarkMode = themePreference === 'dark';
		} else {
			// No saved preference, try to detect device preference from Accept header or other hints
			// This is a fallback for server-side rendering, but client-side detection is more reliable
			isDarkMode = false; // Default to light mode for server-side, client will correct it
		}

		// Set dark mode preference in locals for client-side use
		event.locals.darkMode = isDarkMode;

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
