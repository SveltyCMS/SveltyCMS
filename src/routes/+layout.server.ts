/**
 * @file src/routes/+layout.server.ts
 * @description Root server-side layout handler.
 *
 * ### Features
 * - Settings Loading
 * - User Management
 * - Theme Management
 * - Content Versioning
 *
 * ### Security
 * - Settings Loading is cached
 * - User Management is cached
 * - Theme Management is cached
 * - Content Versioning is cached
 */
import { version } from '../../package.json';
import { loadSettingsCache, getPrivateSettingSync } from '@src/services/settingsService';
import type { LayoutServerLoad } from './$types';
import type { Locale } from '@src/paraglide/runtime';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Load settings from database cache (ensures cache is populated)
	const { public: publicSettings } = await loadSettingsCache();

	// Extract values for server-side logic
	const baseLocale = publicSettings.BASE_LOCALE;
	const defaultContentLanguage = publicSettings.DEFAULT_CONTENT_LANGUAGE;

	// Private settings only accessible server-side
	const isMultiTenant = getPrivateSettingSync('MULTI_TENANT');

	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? baseLocale;
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? defaultContentLanguage;

	// --- Content System Hydration ---
	const { contentManager } = await import('@src/content/ContentManager');
	const navigationStructure = await contentManager.getNavigationStructureProgressive({
		maxDepth: 1,
		tenantId: locals.tenantId
	});
	const contentVersion = contentManager.getContentVersion();

	return {
		systemLanguage,
		contentLanguage,
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant,
		cspNonce: locals.cspNonce,
		tenantId: locals.tenantId ?? null,
		darkMode: locals.darkMode,
		navigationStructure,
		contentVersion,
		// Pass public settings to client for store initialization
		settings: {
			...publicSettings,
			PKG_VERSION: version
		}
	};
};
