/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 * This runs for every request and is responsible for establishing the
 * correct language and user/tenant context for the entire application.
 */
import { config, getSiteName, getBaseLocale, getDefaultLanguage, isMultiTenant } from '@src/lib/config.server';
import { isSetupComplete } from '@src/lib/env.server';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Initialize configuration service
	await config.initialize();

	// Determine the system language from cookies or fall back to the public environment default.
	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? (await getBaseLocale() as Locale);

	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? (await getDefaultLanguage() as Locale);

	// Get all public settings for the client
	const publicSettings = await config.getAllPublic();

	return {
		systemLanguage,
		contentLanguage,
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant: await isMultiTenant() ?? false,
		tenantId: locals.tenantId ?? null,
		settings: publicSettings // Only public settings exposed to client
	};
};
