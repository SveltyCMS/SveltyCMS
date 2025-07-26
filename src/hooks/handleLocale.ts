/**
 * @file src/hooks/handleLocale.ts
 * @description Handles locale and language management from cookies
 *
 * Features:
 * - System language cookie handling
 * - Content language cookie handling
 * - Automatic store synchronization
 * - Invalid locale cleanup and validation
 * - Efficient cookie-to-store updates
 * - Error handling for malformed locale data
 */

import type { Handle } from '@sveltejs/kit';

// Stores
import { contentLanguage, systemLanguage } from '@stores/store.svelte';

// Paraglide
import type { Locale } from '@src/paraglide/runtime';

// System Logger
import { logger } from '@utils/logger.svelte';

export const handleLocale: Handle = async ({ event, resolve }) => {
	const { cookies } = event;

	// Update stores from existing cookies if present
	const systemLangCookie = cookies.get('systemLanguage');
	const contentLangCookie = cookies.get('contentLanguage');
	if (systemLangCookie) {
		try {
			systemLanguage.set(systemLangCookie as Locale);
		} catch {
			logger.warn(`Invalid system language cookie value: ${systemLangCookie}`);
			cookies.delete('systemLanguage', { path: '/' });
		}
	}
	if (contentLangCookie) {
		try {
			contentLanguage.set(contentLangCookie as Locale);
		} catch {
			logger.warn(`Invalid content language cookie value: ${contentLangCookie}`);
			cookies.delete('contentLanguage', { path: '/' });
		}
	}

	return resolve(event);
};
