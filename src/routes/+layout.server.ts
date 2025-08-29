/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language and user/tenant context for the entire application.
 */
import { config } from '@src/lib/config.server';
import { privateEnv } from '@root/config/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Load settings from configuration service
	let siteName = 'SveltyCMS';
	let baseLocale = 'en';
	let defaultContentLanguage = 'en';

	try {
		// Ensure configuration service is initialized
		if (!config.isInitialized()) {
			await config.initialize();
		}

		siteName = (await config.getPublic('SITE_NAME')) || 'SveltyCMS';
		baseLocale = (await config.getPublic('BASE_LOCALE')) || 'en';
		defaultContentLanguage = (await config.getPublic('DEFAULT_CONTENT_LANGUAGE')) || 'en';
	} catch (error) {
		// Use default values if config service fails
	}

	// Determine the system language from cookies or fall back to the public environment default.
	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? baseLocale;
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? defaultContentLanguage;

	return {
		systemLanguage,
		contentLanguage,
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant: privateEnv.MULTI_TENANT,
		tenantId: locals.tenantId ?? null,
		settings: {
			SITE_NAME: siteName,
			BASE_LOCALE: baseLocale,
			DEFAULT_CONTENT_LANGUAGE: defaultContentLanguage
		}
	};
};
