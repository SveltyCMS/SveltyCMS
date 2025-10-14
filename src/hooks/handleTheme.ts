/**
 * @file src/hooks/handleTheme.ts
 * @description Handles server-side theme rendering to prevent theme flickering.
 *
 * ### Features
 * - Reads a single 'theme' cookie to determine the user's preference.
 * - Injects the 'dark' class into the initial HTML for correct Server-Side Rendering (SSR).
 * - Sets `event.locals.theme` for use in other server `load` functions.
 */

import type { Handle } from '@sveltekit/kit';

export const handleTheme: Handle = async ({ event, resolve }) => {
	// 1. Read the single 'theme' cookie as the source of truth ('dark' or 'light').
	const theme = event.cookies.get('theme') as 'dark' | 'light' | undefined;

	// 2. Determine the dark mode state. Default to false (light mode) if no cookie is set.
	const isDarkMode = theme === 'dark';

	// 3. Set `locals` for use in your `load` functions.
	// `event.locals.theme` can be used to pass the theme state to the page.
	event.locals.theme = theme || 'light';

	// 4. Transform the HTML response to prevent flickering.
	// This function intercepts the final HTML and injects the 'dark' class if needed
	// BEFORE the browser ever sees the page.
	return resolve(event, {
		transformPageChunk: ({ html }) => {
			if (isDarkMode) {
				// The initial HTML from app.html might look like: <html lang="en" dir="ltr">
				// We replace it to inject the dark class.
				return html.replace('<html lang="en" dir="ltr">', '<html lang="en" dir="ltr" class="dark">');
			}
			return html;
		}
	});
};
