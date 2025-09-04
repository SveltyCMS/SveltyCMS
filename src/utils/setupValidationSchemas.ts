/**
 * @file src/utils/setupValidationSchemas.ts
 * @description Validation schemas for setup configuration
 */

import { array, object, pipe, string, check, minLength } from 'valibot';
import { isValidLanguageCode } from './languageValidation';
import * as m from '@src/paraglide/messages';

/**
 * Validation schema for system configuration during setup
 */
export const systemConfigSchema = object({
	siteName: pipe(string(m.setup_validation_sitename_required()), minLength(1, m.setup_validation_sitename_required())),
	defaultContentLanguage: pipe(string(m.setup_validation_language_required()), check(isValidLanguageCode, m.setup_validation_language_invalid())),
	contentLanguages: pipe(
		array(string()),
		check((langs) => langs.length > 0, m.setup_validation_languages_required()),
		check((langs) => langs.every(isValidLanguageCode), m.setup_validation_languages_invalid())
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
