/**
 * Gets the native name of a language using the browser's Intl API
 * @param tag - The ISO 639-1 language code
 * @param displayLocale - Optional locale to display the language name in (defaults to the language itself for native name)
 * @returns The language name in its native form (or in the specified display locale)
 */

// System Logger
import { logger } from '@utils/logger.svelte';
import type { Locale } from '@src/paraglide/runtime';

export function getLanguageName(tag: string, displayLocale?: string): string {
	try {
		// If no display locale provided, use the language's own tag to get its native name
		const locale = displayLocale || tag;
		const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
		return languageNames.of(tag) || tag;
	} catch (error) {
		// Fallback to the tag if something goes wrong
		logger.warn(`Error getting language name for ${tag}:`, error);
		return tag;
	}
}

/**
 * Gets both the native name and English name of a language
 * @param tag - The ISO 639-1 language code
 * @returns Object containing native name and English name
 */
export function getLanguageNames(tag: string): { native: string; english: string } {
	return {
		native: getLanguageName(tag), // Get name in its native form
		english: getLanguageName(tag, 'en') // Get name in English
	};
}

/**
 * Sets a cookie with the given name, value, and expiration time in days.
 * @param name - The name of the cookie.
 * @param value - The value of the cookie.
 * @param days - The number of days until the cookie expires.
 */
export function setCookie(name: string, value: string, days: number): void {
	if (name === 'systemLanguage' || name === 'contentLanguage') {
		// Type assertion ensures value is a valid language tag
		const lang = value as Locale;
		logger.dev(`Setting language cookie: ${name}=${lang}`);
	}

	logger.dev(`Setting cookie: ${name}=${value}; expires in ${days} days`);
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
	logger.dev('Document cookie after setting:', document.cookie);
}
