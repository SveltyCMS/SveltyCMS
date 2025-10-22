/**
 * @file src/utils/languageValidation.ts
 * @description Utility functions for language validation using ISO 639-1 standard
 */

import iso6391 from './iso639-1.json';

/**
 * Get all valid ISO 639-1 language codes
 */
export function getValidLanguageCodes(): string[] {
	return iso6391.map((lang) => lang.code);
}

/**
 * Validate if a language code is valid according to ISO 639-1 standard
 */
export function isValidLanguageCode(code: string): boolean {
	if (typeof code !== 'string' || code.length !== 2) {
		return false;
	}
	return iso6391.some((lang) => lang.code === code.toLowerCase());
}

/**
 * Get language information by code
 */
export function getLanguageInfo(code: string): { name: string; code: string; native: string } | null {
	const lang = iso6391.find((l) => l.code === code.toLowerCase());
	return lang || null;
}

/**
 * Get all available languages with their details
 */
export function getAllLanguages(): Array<{ name: string; code: string; native: string }> {
	return iso6391;
}

/**
 * Search languages by name or native name
 */
export function searchLanguages(query: string): Array<{ name: string; code: string; native: string }> {
	const lowerQuery = query.toLowerCase();
	return iso6391.filter(
		(lang) =>
			lang.name.toLowerCase().includes(lowerQuery) || lang.native.toLowerCase().includes(lowerQuery) || lang.code.toLowerCase().includes(lowerQuery)
	);
}
