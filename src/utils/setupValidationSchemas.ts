/**
 * @file src/utils/setupValidationSchemas.ts
 * @description Validation schemas for setup configuration
 */

import * as m from '@src/paraglide/messages';
import { array, check, minLength, object, pipe, string } from 'valibot';
import { isValidLanguageCode } from './languageValidation';

/**
 * Validation schema for system configuration during setup
 */
export const systemConfigSchema = object({
	siteName: pipe(string(), minLength(1, m.setup_validation_sitename_required)),
	defaultContentLanguage: pipe(
		string(),
		minLength(1, m.setup_validation_language_required),
		check(isValidLanguageCode, m.setup_validation_language_invalid)
	),
	contentLanguages: pipe(
		array(string()),
		check((langs) => langs.length > 0, m.setup_validation_languages_required),
		check((langs) => langs.every(isValidLanguageCode), m.setup_validation_languages_invalid)
	)
});

/**
 * Type for system configuration
 */
export type SystemConfigSchema = {
	siteName: string;
	defaultContentLanguage: string;
	contentLanguages: string[];
};
