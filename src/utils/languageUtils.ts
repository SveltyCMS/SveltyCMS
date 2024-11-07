/**
 * Gets the native name of a language using the browser's Intl API
 * @param tag - The ISO 639-1 language code
 * @param displayLocale - Optional locale to display the language name in (defaults to the language itself for native name)
 * @returns The language name in its native form (or in the specified display locale)
 */
export function getLanguageName(tag: string, displayLocale?: string): string {
	try {
		// If no display locale provided, use the language's own tag to get its native name
		const locale = displayLocale || tag;
		const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
		return languageNames.of(tag) || tag;
	} catch (error) {
		// Fallback to the tag if something goes wrong
		console.warn(`Error getting language name for ${tag}:`, error);
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
