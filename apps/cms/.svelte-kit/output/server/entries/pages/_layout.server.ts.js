import { version } from '../../chunks/package.js';
import { loadSettingsCache, getPrivateSettingSync } from '../../chunks/settingsService.js';
const load = async ({ cookies, locals, url }) => {
	const setupMode = locals.__setupConfigExists === false || url.pathname.startsWith('/setup');
	if (setupMode) {
		return {
			systemLanguage: cookies.get('systemLanguage') ?? 'en',
			contentLanguage: cookies.get('contentLanguage') ?? 'en',
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
	let publicSettings;
	try {
		const settingsResult = await loadSettingsCache();
		publicSettings = settingsResult.public;
	} catch (error) {
		console.error('[Layout] Settings load failed (preview mode?):', error);
		return {
			systemLanguage: 'en',
			contentLanguage: 'en',
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
	const baseLocale = publicSettings.BASE_LOCALE;
	const defaultContentLanguage = publicSettings.DEFAULT_CONTENT_LANGUAGE;
	const isMultiTenant = getPrivateSettingSync('MULTI_TENANT');
	const systemLanguage = cookies.get('systemLanguage') ?? baseLocale;
	const contentLanguage = cookies.get('contentLanguage') ?? defaultContentLanguage;
	const { contentManager } = await import('../../chunks/ContentManager.js');
	let navigationStructure = [];
	let contentVersion = 0;
	try {
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
export { load };
//# sourceMappingURL=_layout.server.ts.js.map
