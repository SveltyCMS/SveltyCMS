/**
 * @file src/hooks/handleTheme.ts
 * @description Handles server-side theme rendering to prevent theme flickering.
 *
 * ### Features
 * - Reads 'theme' cookie with values: 'system' | 'light' | 'dark'
 * - Injects the 'dark' class into the initial HTML for correct SSR
 * - Sets `event.locals.darkMode` (boolean) for use in other server `load` functions
 */

import type { Handle } from '@sveltejs/kit';
import { ThemeManager } from '@src/databases/themeManager';
import { logger } from '@utils/logger.server';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance();

export const handleTheme: Handle = async ({ event, resolve }) => {
	// 1. Read the theme preference cookie
	const themePreference = event.cookies.get('theme') as 'system' | 'light' | 'dark' | undefined;

	// 2. Determine the dark mode state
	let isDarkMode = false;

	if (themePreference === 'dark') {
		isDarkMode = true;
	} else if (themePreference === 'light') {
		isDarkMode = false;
	} else {
		// For 'system' or no preference, we can't determine server-side
		// The inline script in app.html will handle this client-side
		// Default to false for SSR (will be corrected by client script immediately)
		isDarkMode = false;
	}

	// 3. Set darkMode (boolean) for use in other server load functions
	event.locals.darkMode = isDarkMode;

	// 4. Retrieve custom CSS from the active theme
	try {
		const currentTheme = await themeManager.getTheme(event.locals.tenantId);
		event.locals.theme = currentTheme; // Make the entire theme object available
		event.locals.customCss = currentTheme?.customCss || ''; // Extract custom CSS
	} catch (err) {
		logger.error('Error retrieving custom CSS in handleTheme hook:', err);
		event.locals.customCss = ''; // Fallback to empty string on error
	}

	// 5. Transform the HTML response to prevent flickering
	return resolve(event, {
		transformPageChunk: ({ html }) => {
			// This string MUST match your <html ...> tag in app.html
			const htmlTag = '<html lang="en" dir="ltr">';

			// Only inject dark class if explicitly set to 'dark'
			// For 'system', let the client-side script handle it
			if (themePreference === 'dark') {
				return html.replace(htmlTag, '<html lang="en" dir="ltr" class="dark">');
			}
			return html;
		}
	});
};
