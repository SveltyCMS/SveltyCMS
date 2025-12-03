/**
 * @file src/utils/setupValidationSchemas.ts
 * @description Validation schemas for setup configuration
 */

import { array, check, minLength, object, pipe, string } from 'valibot';

// NOTE: Error messages are plain strings for universal (client/server) compatibility.
const isValidLanguageCode = (code: string) => typeof code === 'string' && code.length >= 2;

/**
 * Validation schema for system configuration during setup
 */
export const systemConfigSchema = object({
	siteName: pipe(string(), minLength(1, 'Site name is required')),
	defaultSystemLanguage: pipe(string(), minLength(1, 'Default system language is required'), check(isValidLanguageCode, 'Invalid language code')),
	systemLanguages: pipe(
		array(string()),
		check((langs) => langs.length > 0, 'At least one system language is required'),
		check((langs) => langs.every(isValidLanguageCode), 'Invalid system language code')
	),
	defaultContentLanguage: pipe(string(), minLength(1, 'Default content language is required'), check(isValidLanguageCode, 'Invalid language code')),
	contentLanguages: pipe(
		array(string()),
		check((langs) => langs.length > 0, 'At least one content language is required'),
		check((langs) => langs.every(isValidLanguageCode), 'Invalid content language code')
	),
	mediaFolder: pipe(string(), minLength(1, 'Media folder is required')),
	timezone: pipe(string(), minLength(1, 'Timezone is required'))
});

/**
 * Type for system configuration - should match SystemSettings from setupStore
 */
export type SystemConfigSchema = {
	siteName: string;
	defaultSystemLanguage: string;
	systemLanguages: string[];
	defaultContentLanguage: string;
	contentLanguages: string[];
	mediaFolder: string;
	timezone: string;
};
