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
import type { NavigationNode } from '@src/content/ContentManager';

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
	// Use cached setup status from hooks instead of re-checking
	// The handleSetup hook already sets locals.__setupConfigExists
	const setupMode = locals.__setupConfigExists === false || url.pathname.startsWith('/setup');

	// Fast-path for setup mode - skip ALL CMS initialization
	if (setupMode) {
		return {
			systemLanguage: (cookies.get('systemLanguage') as Locale) ?? 'en',
			contentLanguage: (cookies.get('contentLanguage') as Locale) ?? 'en',
			user: null,
			isAdmin: false,
			isMultiTenant: false,
			cspNonce: locals.cspNonce,
			tenantId: null,
			darkMode: locals.darkMode ?? false,
			navigationStructure: [],
			contentVersion: 0,
			settings: {
				PKG_VERSION: version,
				siteName: 'SveltyCMS Setup'
			}
		};
	}

	// Wrap settings loading in try-catch for preview mode resilience
	let publicSettings;
	try {
		const settingsResult = await loadSettingsCache();
		publicSettings = settingsResult.public;
	} catch (error) {
		console.error('[Layout] Settings load failed (preview mode?):', error);
		// Return minimal valid data structure
		return {
			systemLanguage: 'en' as Locale,
			contentLanguage: 'en' as Locale,
			user: null,
			isAdmin: false,
			isMultiTenant: false,
			cspNonce: locals.cspNonce,
			tenantId: null,
			darkMode: locals.darkMode ?? false,
			navigationStructure: [],
			contentVersion: 0,
			settings: {
				PKG_VERSION: version,
				siteName: 'SveltyCMS'
			}
		};
	}

	// Extract values for server-side logic
	const baseLocale = publicSettings.BASE_LOCALE;
	const defaultContentLanguage = publicSettings.DEFAULT_CONTENT_LANGUAGE;

	// Private settings only accessible server-side
	const isMultiTenant = getPrivateSettingSync('MULTI_TENANT');

	const systemLanguage = (cookies.get('systemLanguage') as Locale) ?? baseLocale;
	const contentLanguage = (cookies.get('contentLanguage') as Locale) ?? defaultContentLanguage;

	// Content System Hydration with error handling for preview mode
	const { contentManager } = await import('@src/content/ContentManager');
	let navigationStructure: NavigationNode[] = [];
	let contentVersion = 0;

	try {
		// Check if ContentManager is initialized before using it
		if (contentManager.getHealthStatus().state === 'initialized') {
			navigationStructure = await contentManager.getNavigationStructureProgressive({
				maxDepth: 1,
				tenantId: locals.tenantId
			});
			contentVersion = contentManager.getContentVersion();
		} else {
			console.warn('[Layout] ContentManager not initialized, skipping navigation load');
		}
	} catch (error) {
		console.error('[Layout] ContentManager error (preview mode?):', error);
		// Continue with empty navigation - don't block page load
	}

	return {
		systemLanguage,
		contentLanguage,
		user: locals.user ?? null,
		isAdmin: locals.isAdmin ?? false,
		isMultiTenant,
		cspNonce: locals.cspNonce,
		tenantId: locals.tenantId ?? null,
		darkMode: locals.darkMode ?? false,
		navigationStructure,
		contentVersion,
		// Pass public settings to client for store initialization
		settings: {
			...publicSettings,
			PKG_VERSION: version
		}
	};
};
