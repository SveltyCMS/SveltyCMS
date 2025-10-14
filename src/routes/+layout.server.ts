/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language and user/tenant context for the entire application.
 */
import { version } from '../../package.json';
// Use server-side settings service with setup-safe fallbacks
import { getPrivateSettingSync } from '@src/services/settingsService';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Load settings from configuration service - settings should be loaded from DB during initialization
	const siteName = publicEnv.SITE_NAME;
	const baseLocale = publicEnv.BASE_LOCALE;
	const defaultContentLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	const isMultiTenant = getPrivateSettingSync('MULTI_TENANT');

	// Determine the system language from cookies or fall back to the database default.
	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? baseLocale;
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? defaultContentLanguage;

	return {
		systemLanguage,
		contentLanguage,
		// During setup, hooks may skip auth; keep these tolerant
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant,
		tenantId: locals.tenantId ?? null,
		settings: {
			SITE_NAME: siteName,
			BASE_LOCALE: baseLocale,
			DEFAULT_CONTENT_LANGUAGE: defaultContentLanguage,
			PKG_VERSION: version
		}
	};
};
