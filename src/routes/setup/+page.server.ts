/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page.
 * It now protects the route from being accessed after setup is complete.
 */

import { isSetupComplete } from '@utils/setupCheck';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { version as pkgVersion } from '../../../package.json';

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from '../../../project.inlang/settings.json';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// --- SECURITY ---
	// If setup is already complete, redirect the user away immediately.
	// This is the primary protection for this route.
	if (isSetupComplete()) {
		throw redirect(302, '/login');
	}

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
