/**
 * @file src/utils/languageUtils.ts
 * @description Display language names using browser's native Intl API
 *
 * **Purpose:**
 * Converts language codes (en, de, ja) to human-readable names using the browser's
 * built-in `Intl.DisplayNames` API instead of maintaining translation tables.
 *
 * **Why use this instead of iso639-1.json?**
 * - iso639-1.json: Static list for BROWSING/SELECTING languages (UI picker)
 * - languageUtils.ts: Dynamic display of ANY language code (even custom ones)
 *
 * **Example:**
 * - Database stores: "de"
 * - UI displays: "Deutsch" (using this utility)
 *
 * @example
 * // Display native name (language's own name)
 * getLanguageName('de')       // → "Deutsch"
 * getLanguageName('ja')       // → "日本語"
 *
 * // Display in specific language
 * getLanguageName('de', 'en') // → "German"
 * getLanguageName('ja', 'en') // → "Japanese"
 *
 * // Works with ANY code, not just ISO 639-1
 * getLanguageName('zh-CN')    // → "中文（中国）"
 * getLanguageName('en-US')    // → "English (United States)"
 */

import { logger } from '@shared/utils/logger';

/**
 * Gets the native or localized name of a language using browser's Intl.DisplayNames API.
 *
 * @param tag - Language code (ISO 639-1 like 'en', 'de' or extended like 'zh-CN')
 * @param displayLocale - Optional locale to display the name in (defaults to native name)
 * @returns The language name in native form or specified display locale
 */
export function getLanguageName(tag: string, displayLocale?: string): string {
	// Early exit for invalid tags to prevent RangeError from Intl.DisplayNames
	if (!tag || tag.trim() === '') {
		return tag;
	}

	try {
		const locale = displayLocale || tag;
		// Also validate locale to prevent RangeError
		if (!locale || locale.trim() === '') {
			return tag;
		}
		const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
		return languageNames.of(tag) || tag;
	} catch (error) {
		logger.warn(`Error getting language name for ${tag}:`, error);
		return tag;
	}
}
