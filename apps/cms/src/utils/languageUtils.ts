/**
 * Gets the native name of a language using the browser's Intl API
 * @param tag - The ISO 639-1 language code
 * @param displayLocale - Optional locale to display the language name in (defaults to the language itself for native name)
 * @returns The language name in its native form (or in the specified display locale)
 */

// System Logger
import { logger } from '@utils/logger.svelte';

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
 * Sets a cookie with the given name, value, and expiration time in days.
 * Ensures the cookie is set with SameSite=Lax and is Secure in production.
 * @param name - The name of the cookie.
 * @param value - The value of the cookie.
 * @param days - The number of days until the cookie expires.
 */
export function setCookie(name: string, value: string, days: number): void {
	if (typeof document === 'undefined') {
		return;
	}

	let cookieString = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 24 * 60 * 60}; SameSite=Lax`;

	// Ensure the 'Secure' attribute is added in production environments
	if (process.env.NODE_ENV === 'production') {
		cookieString += '; Secure';
	}

	document.cookie = cookieString;
	logger.dev(`Cookie set: ${cookieString}`);
}
