/**
 * @file src/hooks/handleTheme.ts
 * @description Handles server-side theme rendering to prevent theme flickering.
 *
 * ### Features
 * - Reads a single 'theme' cookie ('dark' | 'light') as the source of truth.
 * - Injects the 'dark' class into the initial HTML for correct SSR.
 * - Sets `event.locals.darkMode` (boolean) and `event.locals.theme` (string) for use in other server `load` functions.
 */

import type { Handle } from '@sveltejs/kit';

export const handleTheme: Handle = async ({ event, resolve }) => {
	// 1. Read the single 'theme' cookie
	const theme = event.cookies.get('theme') as 'dark' | 'light' | undefined;

	// 2. Determine the dark mode state
	const isDarkMode = theme === 'dark';

	// 3. Set darkMode (boolean) for use in other server load functions
	event.locals.darkMode = isDarkMode;
	// Note: locals.theme expects a Theme entity from DB, not a simple string
	// For theme preference, use locals.darkMode instead
	event.locals.theme = null;

	// 4. Transform the HTML response to prevent flickering
	return resolve(event, {
		transformPageChunk: ({ html }) => {
			// This string MUST match your <html ...> tag in app.html
			const htmlTag = '<html lang="en" dir="ltr">';

			if (isDarkMode) {
				// Inject the 'dark' class
				return html.replace(htmlTag, '<html lang="en" dir="ltr" class="dark">');
			}
			return html;
		}
	});
};
