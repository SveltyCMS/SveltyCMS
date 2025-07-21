/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language context for the entire application by reading cookies.
 */
import { publicEnv } from '@root/config/public';
import type { LayoutServerLoad } from './$types';
import type { Locale } from '@src/paraglide/runtime';

export const load: LayoutServerLoad = async ({ cookies }) => {
	// Determine the system language from cookies or fall back to the public environment default.
	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? (publicEnv.BASE_LOCALE as Locale);

	// Determine the content language from cookies or fall back to the public environment default.
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? (publicEnv.DEFAULT_CONTENT_LANGUAGE as Locale);

	// Return the resolved languages so they are available in the `data` prop
	// for all +layout.svelte components and child pages.
	return {
		systemLanguage,
		contentLanguage
	};
};
