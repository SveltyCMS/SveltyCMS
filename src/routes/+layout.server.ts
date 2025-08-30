/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language and user/tenant context for the entire application.
 */
// Use server-side settings service with setup-safe fallbacks
import { publicEnv } from '@src/stores/globalSettings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Load settings from configuration service
	const siteName = publicEnv.SITE_NAME || 'SveltyCMS';
	const baseLocale = publicEnv.BASE_LOCALE || 'en';
	const defaultContentLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
	const isMultiTenant = publicEnv.MULTI_TENANT;

	// Determine the system language from cookies or fall back to the public environment default.
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
			DEFAULT_CONTENT_LANGUAGE: defaultContentLanguage
		}
	};
};
