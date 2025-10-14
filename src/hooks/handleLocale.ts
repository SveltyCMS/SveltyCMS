/**
 * @file src/hooks/handleLocale.ts
 * @description Synchronizes language preferences from cookies to Svelte stores
 *
 * ### Purpose
 * This hook runs **after** ParaglideJS's main i18n handler, which determines the
 * request language from the URL. This hook handles *secondary* language preferences
 * stored in cookies:
 * - **System Language**: UI language for the application interface
 * - **Content Language**: Language for user-generated content and data
 *
 * ### Behavior
 * - Reads language cookies and syncs them to their respective stores
 * - Validates language codes against supported locales
 * - Cleans up invalid cookies automatically
 * - Handles malformed cookie values gracefully
 * - Only updates stores if cookies contain valid, supported languages
 *
 * ### Prerequisites
 * - ParaglideJS i18n.handle() has already determined the request language
 * - System state is READY (guaranteed by handleSystemState)
 *
 * @prerequisite Runs after i18n.handle() in the middleware sequence
 */

import type { Handle } from '@sveltejs/kit';
import { contentLanguage, systemLanguage } from '@stores/store.svelte';
import type { Locale } from '@src/paraglide/runtime';
import { locales } from '@src/paraglide/runtime';
import { logger } from '@utils/logger.svelte';

// --- UTILITY FUNCTIONS ---

/**
 * Validates if a language code is supported by the application.
 *
 * @param lang - The language code to validate
 * @returns True if the language is supported, false otherwise
 */
function isValidLocale(lang: string | undefined): lang is Locale {
	if (!lang) return false;
	return (locales as readonly string[]).includes(lang);
}

/**
 * Safely sets a language in a store, with validation and error handling.
 *
 * @param cookieName - Name of the cookie being processed
 * @param cookieValue - The language value from the cookie
 * @param setter - Function to update the store
 * @returns True if successfully set, false otherwise
 */
function safelySetLanguage(cookieName: string, cookieValue: string | undefined, setter: (value: Locale) => void): boolean {
	if (!cookieValue) return false;

	if (!isValidLocale(cookieValue)) {
		logger.warn(`Invalid \x1b[34m${cookieName}\x1b[0m cookie value: "\x1b[32m${cookieValue}\x1b[0m". ` + `Supported locales: ${locales.join(', ')}`);
		return false;
	}

	try {
		setter(cookieValue);
		logger.trace(`\x1b[34m${cookieName}\x1b[0m set to: \x1b[32m${cookieValue}\x1b[0m`);
		return true;
	} catch (err) {
		logger.error(`Failed to set \x1b[34m${cookieName}\x1b[0m store: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

// --- MAIN HOOK ---

export const handleLocale: Handle = async ({ event, resolve }) => {
	const { cookies } = event;

	// Sync system language store from cookie
	const systemLangCookie = cookies.get('systemLanguage');
	const systemLangSet = safelySetLanguage('systemLanguage', systemLangCookie, systemLanguage.set);

	// Clean up invalid system language cookie
	if (systemLangCookie && !systemLangSet) {
		logger.debug('Removing invalid systemLanguage cookie');
		cookies.delete('systemLanguage', { path: '/' });
	}

	// Sync content language store from cookie
	const contentLangCookie = cookies.get('contentLanguage');
	const contentLangSet = safelySetLanguage('contentLanguage', contentLangCookie, contentLanguage.set);

	// Clean up invalid content language cookie
	if (contentLangCookie && !contentLangSet) {
		logger.debug('Removing invalid contentLanguage cookie');
		cookies.delete('contentLanguage', { path: '/' });
	}

	return resolve(event);
};
