// @ts-nocheck
/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page.
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import type { PageServerLoad } from './$types';
import { version as pkgVersion } from '@root/package.json';

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from '@root/project.inlang/settings.json';

export const load = async ({ locals, cookies }: Parameters<PageServerLoad>[0]) => {
	// --- SECURITY ---
	// Note: The handleSetup middleware already checks if setup is complete
	// and blocks access to /setup routes if config has valid values.

	// Clear any existing session cookies to ensure fresh start
	// This prevents issues when doing a fresh database setup
	cookies.delete('auth_session', { path: '/' });

	// Get available system languages from inlang settings (direct import, no parsing needed)
	const availableLanguages: string[] = inlangSettings.locales || ['en', 'de'];

	// Pass theme data and PKG_VERSION from server to client
	return {
		theme: locals.theme,
		darkMode: locals.darkMode,
		availableLanguages, // Pass the languages from settings.json
		settings: {
			PKG_VERSION: pkgVersion
		}
	};
};
