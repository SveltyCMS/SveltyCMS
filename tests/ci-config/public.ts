/**
 * Test Public Config for CI
 * Copy this file to config/public.ts in CI before build.
 */
import { createPublicConfig } from '../../config/types.ts';

export const publicEnv = createPublicConfig({
	// --- Host Configuration ---
	HOST_DEV: 'http://localhost:5173',
	HOST_PROD: 'http://localhost:4173',

	// --- Site Configuration ---
	SITE_NAME: 'SveltyCMS Test Site',
	PASSWORD_LENGTH: 8,

	// --- Language Configuration ---
	DEFAULT_CONTENT_LANGUAGE: 'en',
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de'],
	BASE_LOCALE: 'en',
	LOCALES: ['en', 'de'],

	// --- Media Configuration ---
	MEDIA_FOLDER: 'ci-media-files',
	MEDIA_OUTPUT_FORMAT_QUALITY: { format: 'avif', quality: 60 },
	IMAGE_SIZES: { thumbnail: 150, card: 600 },
	USE_ARCHIVE_ON_DELETE: true,

	// --- Logging ---
	LOG_LEVELS: ['info', 'warn', 'error'],
	LOG_RETENTION_DAYS: 7,
	LOG_ROTATION_SIZE: 5 * 1024 * 1024, // 5MB

	// --- Theming ---
	SEASONS: false,
	// SEASON_REGION: 'Global',

	// --- Demo Mode ---
	DEMO: false
});
