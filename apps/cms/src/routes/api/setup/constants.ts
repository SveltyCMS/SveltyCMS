/**
 * @file src/routes/api/setup/constants.ts
 * @description DOCUMENTATION ONLY - These constants are NOT imported anywhere
 *
 * ⚠️ DO NOT IMPORT THIS FILE
 * This file exists only for documentation. The actual values are:
 * - Read from project.inlang/settings.json by seed.ts at build/startup time
 * - Seeded into the database
 * - Accessed via publicEnv.LOCALES at runtime
 *
 * To add a new system language:
 * 1. Add it to project.inlang/settings.json locales array
 * 2. Create the corresponding message file in src/messages/{locale}.json
 * 3. Restart the development server
 * 4. Run setup wizard again to seed the new locale into the database
 */

/**
 * Fallback system/interface languages (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database → publicEnv.LOCALES
 */
export const DEFAULT_SYSTEM_LANGUAGES = ['en', 'de'] as const;

/**
 * Fallback base locale (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database → publicEnv.BASE_LOCALE
 */
export const DEFAULT_BASE_LOCALE = 'en' as const;

/**
 * Fallback content languages (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database
 */
export const DEFAULT_CONTENT_LANGUAGES = ['en', 'de'] as const;

/**
 * Fallback content language (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database
 */
export const DEFAULT_CONTENT_LANGUAGE = 'en' as const;
