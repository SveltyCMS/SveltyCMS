/**
 * @file src/routes/api/setup/constants.ts
 * @description Shared constants for setup configuration (client-safe)
 *
 * This file contains only constant exports that are safe to import in both
 * client-side and server-side code. NO server-only dependencies (fs, node:*, etc).
 */

/**
 * Default system/interface languages (must match project.inlang/settings.json)
 * These are the languages available for the CMS interface itself.
 */
export const DEFAULT_SYSTEM_LANGUAGES = ['en', 'de'] as const;

/**
 * Default base locale for the CMS interface
 * This is the fallback language when no user preference is set.
 */
export const DEFAULT_BASE_LOCALE = 'en' as const;

/**
 * Default content languages available for user content
 * These are the languages users can create content in.
 */
export const DEFAULT_CONTENT_LANGUAGES = ['en', 'de'] as const;

/**
 * Default content language
 * This is the default language for new content items.
 */
export const DEFAULT_CONTENT_LANGUAGE = 'en' as const;
