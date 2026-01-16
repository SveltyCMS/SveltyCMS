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
	let publicSettings;
	try {
		const cache = await loadSettingsCache();
		publicSettings = cache.public;
	} catch (e) {
		// Log error only if setup is complete (otherwise it's expected)
		// We'll use fallback defaults so the layout doesn't crash
		// Log as debug/info because this is expected behavior during first-time setup
		console.debug('Layout: Settings cache not available, using defaults (Setup Mode enabled).');
		publicSettings = {
			BASE_LOCALE: 'en',
			DEFAULT_CONTENT_LANGUAGE: 'en',
			SITE_NAME: 'SveltyCMS Setup',
			SITE_TITLE: 'SveltyCMS Setup'
		};
	}

	// Extract values for server-side logic
	const baseLocale = publicSettings.BASE_LOCALE;
	const defaultContentLanguage = publicSettings.DEFAULT_CONTENT_LANGUAGE;

	// Private settings only accessible server-side
	const isMultiTenant = getPrivateSettingSync('MULTI_TENANT');

	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? baseLocale;
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? defaultContentLanguage;

	// --- Content System Hydration ---
	// --- Content System Hydration ---
	// Only load content if not in setup mode (settings loaded successfully)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let navigationStructure: any[] = [];
	let contentVersion = 0;

	if (!publicSettings['SITE_NAME'] || publicSettings['SITE_NAME'] !== 'SveltyCMS Setup') {
		try {
			const { contentManager } = await import('@src/content/ContentManager');
			navigationStructure = await contentManager.getNavigationStructureProgressive({
				maxDepth: 1,
				tenantId: locals.tenantId
			});
			contentVersion = contentManager.getContentVersion();
		} catch (err) {
			console.warn('Layout: Failed to initialize ContentManager (non-fatal):', err);
		}
	}

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
