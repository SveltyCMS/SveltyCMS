/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language and user/tenant context for the entire application.
 */
import { getPublicSetting } from '@src/stores/globalSettings';
import { privateEnv } from '@root/config/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Determine the system language from cookies or fall back to the public environment default.
	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? (getPublicSetting('BASE_LOCALE') as Locale);

	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? (getPublicSetting('DEFAULT_CONTENT_LANGUAGE') as Locale);
	// so they are available in the `data` prop for all components and pages.

	return {
		systemLanguage,
		contentLanguage,
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant: privateEnv.MULTI_TENANT ?? false,
		tenantId: locals.tenantId ?? null
	};
};
